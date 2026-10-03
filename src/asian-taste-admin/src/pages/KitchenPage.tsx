import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ordersApi } from "@/api/orders"
import { kitchenApi, type KitchenItem, type KitchenTicket } from "@/api/kitchenApi"
import { AdminTop } from "@/components/AdminLayout"
import { Button, Panel, PanelBody, Pill } from "@/components/ui/Primitives"
import { AdminModal } from "@/components/ui/AdminModal"
import { showAdminToast } from "@/components/ui/AdminToast"
import { BoardTicket } from "@/components/orders/BoardTicket"
import { apiStatusValue, isClosed, OPEN_STATUSES, STATUS_META, statusKey, type StatusKey } from "@/lib/orderStatus"
import { readPayment } from "@/lib/payment"
import { urgencyOf } from "@/lib/kitchenBoard"
import { formatCurrency } from "@/lib/utils"
import { useOrderWebSocket } from "@/hooks/useOrderWebSocket"
import type { Order, OrderStatus } from "@/types"

/**
 * The board — the one screen for working orders, and today's numbers.
 *
 * THIS USED TO BE TWO SCREENS. `/dashboard` had the stage columns, the tap-to-cross-out
 * dishes and the money; `/kitchen` had Hold, History and the per-dish notes. Both rendered
 * the same orders, both rendered the same four stat cards, and neither was complete — so a
 * cook holding one order had two tabs open and something missing on whichever they were
 * looking at. That is the overlap the owner reported, and the fix is deletion, not addition.
 *
 * What survived from each:
 *
 *   * **The stage columns** (from the dashboard). Oldest at the top of each, because the
 *     board's job is to answer "what now" and a list in arrival order buries the ticket that
 *     has been waiting longest. A stage with nothing in it shows a quiet placeholder rather
 *     than collapsing, so the shape of the board does not jump around during service.
 *   * **The tap-to-cross-out dish list** (from the dashboard), which is now the industry
 *     norm and what the owner asked for by name. It is the SAME `OrderItems` component the
 *     Orders table and the ticket page use — tickable on all three or on none.
 *   * **Hold, History and per-dish notes** (from back of house). "Waiting on the spring
 *     rolls" is not a cancellation, and "who ticked this" is the question asked after a bag
 *     goes out wrong.
 *   * **Today's numbers** (from the dashboard), from the SERVER's summary. They were once
 *     computed by filtering the last 100 fetched orders, which silently truncated the
 *     figure on a busy day — a revenue number that is wrong at close is the one the owner
 *     actually reads.
 *
 * Age and lateness come from the SERVER (`ageMinutes`), never from the tablet's clock: a
 * "this has been sitting 20 minutes" alarm is only useful if every screen in the room says
 * the same thing.
 *
 * The dish control is deliberately BINARY (done / not done) rather than back of house's
 * three states. `docs/TODO.md` §22 records that decision, what it costs, and the fact that
 * the three-state columns are left in the database rather than dropped.
 */

/** The stages with a column, in the order the food moves. Collected has none: it has left. */
const COLUMNS: Array<{ key: StatusKey; title: string; hint: string }> = OPEN_STATUSES.map((key) => ({
  key,
  title: STATUS_META[key].label,
  hint:
    key === "placed"
      ? "Accept or reject"
      : key === "confirmed"
        ? "Accepted — on the wok"
        : "Waiting to be collected",
}))

/** Filter chips. "On the line" is the default because it is the pass's normal view. */
const FILTERS = [
  { id: "live" as const, label: "On the line" },
  { id: "late" as const, label: "Late" },
  { id: "held" as const, label: "Held" },
  { id: "all" as const, label: "Everything" },
]

export function KitchenPage() {
  const { isConnected } = useOrderWebSocket()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<"live" | "late" | "held" | "all">("live")
  const [holding, setHolding] = useState<KitchenTicket | null>(null)
  const [holdReason, setHoldReason] = useState("")
  const [noting, setNoting] = useState<{ ticket: KitchenTicket; item: KitchenItem } | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [historyFor, setHistoryFor] = useState<KitchenTicket | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  /** The single dish currently being ticked, so only its own row reads "saving". */
  const [tickingItemId, setTickingItemId] = useState<number | null>(null)

  // The board asks for the LINES, which is what both the cross-out list and the per-dish
  // notes are rendered from. Fetching them per ticket on demand would be one request per
  // press on the screen whose whole job is to be glanceable.
  const { data, isLoading } = useQuery({
    queryKey: ["kitchen", "board"],
    queryFn: () => kitchenApi.getBoard(false),
    // Short, because this is a live screen: a ticket that appeared a minute ago should be
    // here before the customer has finished paying. The WebSocket pushes too, but the poll
    // is what makes the board self-healing when a push is missed.
    refetchInterval: 15_000,
  })

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => ordersApi.getDashboardSummary(),
    refetchInterval: 30_000,
  })

  const tickets = useMemo(() => data?.tickets ?? [], [data])
  const boardSummary = data?.summary

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["kitchen"] })
    queryClient.invalidateQueries({ queryKey: ["orders"] })
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
  }

  /**
   * Advance one ticket a stage.
   *
   * Guarded by `boardAction`/`canTransition` rather than by the button's wording, so a
   * WebSocket frame carrying an older status cannot talk the board into an illegal move.
   */
  const advance = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusKey }) =>
      ordersApi.updateOrderStatus(id, { status: apiStatusValue(status) as OrderStatus }),
    onMutate: ({ id }) => setSavingId(id),
    onSettled: () => setSavingId(null),
    onSuccess: refresh,
    onError: () => showAdminToast("Couldn't update that order — try again"),
  })

  /**
   * Tick one dish off, from the board.
   *
   * Optimistic, and deliberately so: a cook presses this tens of times a shift, sometimes
   * twice a second, and a round trip of "Saving…" under the finger makes the pass feel
   * broken. The counts are patched locally too, so the ticket's progress moves with the tick
   * rather than a moment later.
   *
   * The rollback matters more than the optimism. If the server refuses — the order was
   * cancelled by somebody else, or the line moved — the locally-added tick is removed, so
   * the board never keeps a claim the database does not agree with. A kitchen working from a
   * tick that does not exist is how a dish gets forgotten.
   */
  const tick = useMutation({
    mutationFn: ({ orderId, itemId, isCompleted }: { orderId: number; itemId: number; isCompleted: boolean }) =>
      ordersApi.setItemCompleted(orderId, itemId, isCompleted),

    onMutate: async ({ orderId, itemId, isCompleted }) => {
      setTickingItemId(itemId)
      await queryClient.cancelQueries({ queryKey: ["kitchen", "board"] })
      const previous = queryClient.getQueryData(["kitchen", "board"])

      queryClient.setQueryData(["kitchen", "board"], (current: typeof data) => {
        if (!current) return current
        return {
          ...current,
          tickets: current.tickets.map((t) => {
            if (t.id !== orderId || !t.items) return t
            const items = t.items.map((i) =>
              i.id === itemId ? { ...i, isCompleted, cookState: isCompleted ? "Done" : "Queued" } : i,
            )
            return {
              ...t,
              items,
              itemsDone: { done: items.filter((i) => i.isCompleted).length, total: items.length },
              remainingLines: items.filter((i) => !i.isCompleted).length,
            }
          }),
        }
      })

      return { previous }
    },

    onError: (_e, _v, context) => {
      if (context?.previous) queryClient.setQueryData(["kitchen", "board"], context.previous)
      showAdminToast("Couldn't update that dish — check the ticket")
    },

    onSuccess: (result) => {
      // The two things the screen could not know: whether that dish finished the order, and
      // whether the customer was actually told. A cook needs both — one to clear the ticket,
      // the other to know whether to call the number out.
      if (result.orderMarkedReady) {
        showAdminToast(
          result.customerNotified
            ? "Every dish done — order is ready and the customer has been emailed"
            : "Every dish done — order is ready. Nobody to email, so call the number out",
        )
      }
    },

    onSettled: () => {
      setTickingItemId(null)
      refresh()
    },
  })

  const saveNote = useMutation({
    mutationFn: ({ orderId, itemId, note }: { orderId: number; itemId: number; note: string }) =>
      kitchenApi.setKitchenNote(orderId, itemId, note),
    onSuccess: () => {
      setNoting(null)
      showAdminToast("Note saved to the kitchen")
      refresh()
    },
    onError: () => showAdminToast("Couldn't save that note"),
  })

  const setHold = useMutation({
    mutationFn: ({ orderId, held, reason }: { orderId: number; held: boolean; reason?: string }) =>
      kitchenApi.setHold(orderId, held, reason),
    onSuccess: (_r, vars) => {
      setHolding(null)
      setHoldReason("")
      showAdminToast(vars.held ? "Order held — it is off the line" : "Order back on the line")
      refresh()
    },
    onError: () => showAdminToast("Couldn't change the hold"),
  })

  /** Which tickets each column shows, after the filter and the urgency sort. */
  const shown = useMemo(() => {
    const list = tickets.filter((t) => {
      switch (filter) {
        case "live":
          return !t.isHeld
        case "late":
          return !t.isHeld && urgencyOf(t) === "late"
        case "held":
          return t.isHeld
        case "all":
          return true
      }
    })

    // Most urgent first: the board's whole job is to answer "what now", and a list in
    // arrival order buries the ticket that has been waiting longest.
    const rank = { late: 0, warning: 1, normal: 2 } as const
    return [...list].sort((a, b) => {
      const byUrgency = rank[urgencyOf(a)] - rank[urgencyOf(b)]
      if (byUrgency !== 0) return byUrgency
      return a.ageMinutes < b.ageMinutes ? 1 : -1
    })
  }, [tickets, filter])

  // The columns carry only the OPEN stages. Collected orders have left the board and land in
  // the day's numbers instead of sitting in a column nobody has a reason to look at again.
  const inColumn = (key: StatusKey) =>
    shown
      .filter((t) => statusKey(t.status) === key)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  // "Collected today" and "Revenue today" come from the SERVER's summary, not from the
  // fetched page. Filtering the fetched page is how a busy day silently truncated the
  // takings and how yesterday's collection counted towards today.
  const collectedToday = summary?.completedOrdersToday ?? boardSummary?.collectedToday ?? 0
  const revenueToday = summary?.todayRevenue ?? 0

  const filterCounts: Record<string, number> = {
    live: tickets.filter((t) => !t.isHeld).length,
    late: tickets.filter((t) => !t.isHeld && urgencyOf(t) === "late").length,
    held: tickets.filter((t) => t.isHeld).length,
    all: tickets.length,
  }

  /** A ready order whose money never arrived cannot go out. Counted for the stat card. */
  const uncollectedMoney = useMemo(
    () =>
      tickets.filter((t) => {
        const payment = readPayment(t.paymentStatus, t.paymentMethod)
        return payment.attention && !isClosed(t.status)
      }).length,
    [tickets],
  )

  return (
    <>
      <AdminTop
        title="Board"
        sub="Every order on the line, and today's numbers. Tick a dish to strike it through."
        actions={
          // A connection cue, NOT a status pill. This passed `status="ready"` and only
          // overrode the label, so a green "ready" dot rendered the word "Reconnecting" —
          // the pill's colour came from the status while its text said the opposite. The
          // board's ticket pills say where an ORDER is; this says whether the screen is
          // live, which is a different question and gets a different control.
          <span className={`live-dot ${isConnected ? "" : "is-off"}`}>
            {isConnected ? "Live" : "Reconnecting"}
          </span>
        }
      />

      <div className="admin-page">
        <section className="stat-grid" data-od-id="board-stats">
          <div className="stat-card is-accent">
            <p className="stat-k">On the line</p>
            <p className="stat-v">{boardSummary?.liveOrders ?? 0}</p>
            <p className="stat-delta">{boardSummary?.dishesToCook ?? 0} dishes still to cook</p>
          </div>
          <div className="stat-card">
            <p className="stat-k">Late</p>
            <p className="stat-v">{boardSummary?.overdueOrders ?? 0}</p>
            <p className="stat-delta down">past the promised time</p>
          </div>
          <div className="stat-card">
            <p className="stat-k">Collected today</p>
            <p className="stat-v">{collectedToday}</p>
            <p className="stat-delta">
              {boardSummary?.heldOrders ?? 0} held · {uncollectedMoney} unpaid
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-k">Revenue today</p>
            <p className="stat-v">{formatCurrency(revenueToday)}</p>
            <p className="stat-delta">GST inclusive · AUD</p>
          </div>
        </section>

        <Panel data-od-id="board-filters">
          <PanelBody>
            <div className="filterbar">
              <div className="seg-sm" role="group" aria-label="Filter the board">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label}
                    <span className="seg-count">{filterCounts[f.id] ?? 0}</span>
                  </button>
                ))}
              </div>
              <Pill neutral>{boardSummary?.awaitingAcceptance ?? 0} to accept</Pill>
            </div>
          </PanelBody>
        </Panel>

        {isLoading ? (
          <Panel>
            <PanelBody>
              <p className="meta" style={{ margin: 0 }}>
                Loading the board…
              </p>
            </PanelBody>
          </Panel>
        ) : (
          <div className="board" data-od-id="board-columns">
            {COLUMNS.map((column) => {
              const list = inColumn(column.key)
              return (
                <div className="col" key={column.key}>
                  <div className="col-head">
                    <h3>{column.title}</h3>
                    <span className="count">{list.length}</span>
                  </div>
                  <p className="meta" style={{ margin: "-6px 0 12px" }}>
                    {column.hint}
                  </p>

                  {list.length === 0 ? (
                    <p className="board-empty">Nothing here.</p>
                  ) : (
                    list.map((ticket) => (
                      <BoardTicket
                        key={ticket.id}
                        ticket={ticket}
                        saving={savingId === ticket.id}
                        tickingItemId={tickingItemId}
                        onAdvance={(status) => advance.mutate({ id: ticket.id, status })}
                        onTick={(itemId, isCompleted) =>
                          tick.mutate({ orderId: ticket.id, itemId, isCompleted })
                        }
                        onHold={() => {
                          setHolding(ticket)
                          setHoldReason("")
                        }}
                        onResume={() => setHold.mutate({ orderId: ticket.id, held: false })}
                        onNote={(item) => {
                          setNoting({ ticket, item })
                          setNoteDraft(item.kitchenNote ?? "")
                        }}
                        onHistory={() => setHistoryFor(ticket)}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* The hold dialog. The reason is required, because a held ticket with no reason is one
          the next person has to ask around about. */}
      {holding && (
        <AdminModal
          title={`Hold ${holding.orderNumber}?`}
          labelledBy="hold-title"
          onClose={() => setHolding(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setHolding(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!holdReason.trim() || setHold.isPending}
                onClick={() => setHold.mutate({ orderId: holding.id, held: true, reason: holdReason.trim() })}
              >
                {setHold.isPending ? "Holding…" : "Hold it"}
              </Button>
            </>
          }
        >
          <p style={{ margin: "0 0 12px" }}>
            The order keeps its stage and its dishes — it simply stops being the next thing the
            kitchen picks up, and comes back when you say so.
          </p>
          <label className="counter-note-field">
            <span>Why is it held? (the next person reads this)</span>
            <input
              className="input"
              autoFocus
              value={holdReason}
              placeholder="waiting on the spring rolls"
              onChange={(e) => setHoldReason(e.target.value)}
            />
          </label>
        </AdminModal>
      )}

      {/* The kitchen's note on one dish. Separate from the customer's instruction, which
          cannot be edited here — this is what the cook needs the front to know. */}
      {noting && (
        <AdminModal
          title={`Note on ${noting.item.menuItemName}`}
          labelledBy="note-title"
          onClose={() => setNoting(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setNoting(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={saveNote.isPending}
                onClick={() =>
                  saveNote.mutate({
                    orderId: noting.ticket.id,
                    itemId: noting.item.id,
                    note: noteDraft.trim(),
                  })
                }
              >
                {saveNote.isPending ? "Saving…" : "Save note"}
              </Button>
            </>
          }
        >
          {noting.item.specialInstructions && (
            <p className="meta" style={{ marginTop: 0 }}>
              The customer asked for: <strong>{noting.item.specialInstructions}</strong>
            </p>
          )}
          <label className="counter-note-field">
            <span>What the front needs to know (empty clears it)</span>
            <input
              className="input"
              autoFocus
              value={noteDraft}
              placeholder="out of beansprouts, used cabbage"
              onChange={(e) => setNoteDraft(e.target.value)}
            />
          </label>
        </AdminModal>
      )}

      {historyFor && <TicketHistory ticket={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  )
}

/**
 * What has happened to this ticket, and who did it.
 *
 * The question asked an hour later when something has gone wrong. Every other screen shows
 * current state, which is enough to run a service and useless for that question.
 */
function TicketHistory({ ticket, onClose }: { ticket: KitchenTicket; onClose: () => void }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["kitchen", "activity", ticket.id],
    queryFn: () => kitchenApi.getActivity(ticket.id),
  })

  return (
    <AdminModal
      title={`History — ${ticket.orderNumber}`}
      labelledBy="history-title"
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {isLoading ? (
        <p className="meta">Loading…</p>
      ) : events.length === 0 ? (
        <p className="meta">
          Nothing recorded yet. Actions taken from this screen — ticking a dish, holding the
          ticket, writing a note — appear here with who did them.
        </p>
      ) : (
        <ol className="boh-history">
          {events.map((e) => (
            <li key={e.id}>
              <span className="boh-history-detail">{e.detail}</span>
              <span className="meta">
                {new Date(e.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                {e.statusAtEvent ? ` · ${e.statusAtEvent}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </AdminModal>
  )
}

export type { Order }
