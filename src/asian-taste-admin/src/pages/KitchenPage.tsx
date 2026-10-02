import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { kitchenApi, type CookState, type KitchenItem, type KitchenTicket } from "@/api/kitchenApi"
import { AdminTop } from "@/components/AdminLayout"
import { Button, Panel, PanelBody, Pill, SkeletonRows } from "@/components/ui/Primitives"
import { AdminModal } from "@/components/ui/AdminModal"
import { showAdminToast } from "@/components/ui/AdminToast"
import { StatusPill } from "@/components/ui/StatusPill"
import { formatCurrency } from "@/lib/utils"
import {
  cookActionLabel,
  cookStateLabel,
  groupForCooking,
  itemsOf,
  nextCookState,
  progressPhrase,
  urgencyOf,
  wantedLabel,
} from "@/lib/kitchenBoard"

/**
 * Back of house — the kitchen's own workspace for managing an order.
 *
 * This is NOT the orders list. That screen answers "find me order 42"; this one answers
 * "what do I cook next, and what is left on it". It is built for someone standing up with
 * food in front of them:
 *
 *   * **Each dish is its own control, with three states.** A cook can say "the pho is on"
 *     rather than only "the pho is done", which is the difference between a board that
 *     reflects the kitchen and one that only records it afterwards.
 *   * **What is on the wok comes first**, because that is what burns. See
 *     `groupForCooking` for why the order within a group is not re-sorted.
 *   * **A ticket can be held, not just cancelled.** "Waiting on the spring rolls" and "the
 *     customer is late" are not cancellations, and cancelling tells the customer their
 *     order is dead.
 *   * **Every action is attributed.** The activity log names who did what, which is the
 *     question asked after something goes wrong and which nothing here could answer before.
 *
 * Age and lateness come from the SERVER (`ageMinutes`), never from the tablet's clock — a
 * "this has been sitting 20 minutes" alarm is only useful if every screen in the room says
 * the same thing.
 */
export function KitchenPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<"live" | "cooking" | "late" | "held" | "all">("live")
  const [holding, setHolding] = useState<KitchenTicket | null>(null)
  const [holdReason, setHoldReason] = useState("")
  const [noting, setNoting] = useState<{ ticket: KitchenTicket; item: KitchenItem } | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [busyItemId, setBusyItemId] = useState<number | null>(null)
  const [historyFor, setHistoryFor] = useState<KitchenTicket | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["kitchen", "board"],
    queryFn: () => kitchenApi.getBoard(false),
    // Short, because this is a live screen: a ticket that appeared a minute ago should be
    // here before the customer has finished paying. The WebSocket pushes too, but the poll
    // is what makes the board self-healing when a push is missed.
    refetchInterval: 15_000,
  })

  // Memoised so the identity is stable: `shown` depends on it, and a fresh empty array on
  // every render would make that memo recompute for nothing.
  const tickets = useMemo(() => data?.tickets ?? [], [data])
  const summary = data?.summary

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["kitchen"] })
    queryClient.invalidateQueries({ queryKey: ["orders"] })
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
  }

  /**
   * Move a dish on one state.
   *
   * Optimistic, because this is pressed constantly and a round trip under the finger makes
   * the pass feel broken. The rollback is the half that matters: if the server refuses, the
   * board must not keep a claim the database denies.
   */
  const advance = useMutation({
    mutationFn: ({ orderId, itemId, state }: { orderId: number; itemId: number; state: CookState }) =>
      kitchenApi.setCookState(orderId, itemId, state),

    onMutate: async ({ orderId, itemId, state }) => {
      setBusyItemId(itemId)
      await queryClient.cancelQueries({ queryKey: ["kitchen", "board"] })
      const previous = queryClient.getQueryData(["kitchen", "board"])

      queryClient.setQueryData(["kitchen", "board"], (current: typeof data) => {
        if (!current) return current
        return {
          ...current,
          tickets: current.tickets.map((t) =>
            t.id !== orderId || !t.items
              ? t
              : {
                  ...t,
                  items: t.items.map((i) => (i.id === itemId ? { ...i, cookState: state } : i)),
                  remainingLines: t.items.filter((i) => (i.id === itemId ? state : i.cookState) !== "Done").length,
                  cookingLines: t.items.filter((i) => (i.id === itemId ? state : i.cookState) === "Cooking").length,
                },
          ),
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
      setBusyItemId(null)
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

  const shown = useMemo(() => {
    const list = tickets.filter((t) => {
      switch (filter) {
        case "live":
          return !t.isHeld
        case "cooking":
          return !t.isHeld && t.cookingLines > 0
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

  const FILTERS = [
    { id: "live" as const, label: "On the line", count: summary?.liveOrders },
    { id: "cooking" as const, label: "On the wok", count: summary?.dishesCooking },
    { id: "late" as const, label: "Late", count: summary?.overdueOrders },
    { id: "held" as const, label: "Held", count: summary?.heldOrders },
    { id: "all" as const, label: "Everything", count: tickets.length },
  ]

  return (
    <>
      <AdminTop
        title="Back of house"
        sub="Manage the orders on the line — start a dish, finish it, hold a ticket or write a note."
        actions={
          <>
            <Pill neutral>{summary?.dishesToCook ?? 0} dishes to cook</Pill>
            <Pill neutral>{summary?.awaitingAcceptance ?? 0} to accept</Pill>
          </>
        }
      />

      <div className="admin-page">
        <section className="stat-grid" data-od-id="boh-stats">
          <div className="stat-card is-accent">
            <p className="stat-k">On the line</p>
            <p className="stat-v">{summary?.liveOrders ?? 0}</p>
            <p className="stat-delta">{summary?.dishesToCook ?? 0} dishes still to cook</p>
          </div>
          <div className="stat-card">
            <p className="stat-k">On the wok</p>
            <p className="stat-v">{summary?.dishesCooking ?? 0}</p>
            <p className="stat-delta">started, not finished</p>
          </div>
          <div className="stat-card">
            <p className="stat-k">Late</p>
            <p className="stat-v">{summary?.overdueOrders ?? 0}</p>
            <p className="stat-delta down">past the promised time</p>
          </div>
          <div className="stat-card">
            <p className="stat-k">Held</p>
            <p className="stat-v">{summary?.heldOrders ?? 0}</p>
            <p className="stat-delta">off the line, with a reason</p>
          </div>
        </section>

        <Panel data-od-id="boh-filters">
          <PanelBody>
            <div className="seg-sm" role="group" aria-label="Filter the board">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {typeof f.count === "number" && <span className="seg-count">{f.count}</span>}
                </button>
              ))}
            </div>
          </PanelBody>
        </Panel>

        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : shown.length === 0 ? (
          <Panel>
            <PanelBody>
              <p className="meta" style={{ margin: 0 }}>
                Nothing here. New orders appear the moment they are paid.
              </p>
            </PanelBody>
          </Panel>
        ) : (
          <div className="boh-grid">
            {shown.map((ticket) => (
              <KitchenTicketCard
                key={ticket.id}
                ticket={ticket}
                busyItemId={busyItemId}
                onAdvance={(item) => {
                  const next = nextCookState(item.cookState)
                  if (next) advance.mutate({ orderId: ticket.id, itemId: item.id, state: next })
                }}
                onNote={(item) => {
                  setNoting({ ticket, item })
                  setNoteDraft(item.kitchenNote ?? "")
                }}
                onHold={() => {
                  setHolding(ticket)
                  setHoldReason("")
                }}
                onResume={() => setHold.mutate({ orderId: ticket.id, held: false })}
                onHistory={() => setHistoryFor(ticket)}
              />
            ))}
          </div>
        )}
      </div>

      {/* The hold dialog. The reason is required, because a held ticket with no reason is
          one the next person has to ask around about. */}
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
                onClick={() =>
                  setHold.mutate({ orderId: holding.id, held: true, reason: holdReason.trim() })
                }
              >
                {setHold.isPending ? "Holding…" : "Hold it"}
              </Button>
            </>
          }
        >
          <p style={{ margin: "0 0 12px" }}>
            The order keeps its stage and its dishes — it simply stops being the next thing
            the kitchen picks up, and comes back when you say so.
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

      {historyFor && (
        <TicketHistory ticket={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </>
  )
}

/**
 * One ticket, with its dishes as the controls.
 */
function KitchenTicketCard({
  ticket,
  busyItemId,
  onAdvance,
  onNote,
  onHold,
  onResume,
  onHistory,
}: {
  ticket: KitchenTicket
  busyItemId: number | null
  onAdvance: (item: KitchenItem) => void
  onNote: (item: KitchenItem) => void
  onHold: () => void
  onResume: () => void
  onHistory: () => void
}) {
  const urgency = urgencyOf(ticket)
  const items = itemsOf(ticket)
  const groups = groupForCooking(items)
  const phrase = progressPhrase(ticket)

  // Ordered for a cook: what is on the wok first. See groupForCooking.
  const ordered = [...groups.cooking, ...groups.queued, ...groups.done]

  return (
    <article className={`boh-ticket ${urgency}`} data-held={ticket.isHeld}>
      <header className="boh-top">
        <div>
          <span className="boh-id">{ticket.orderNumber}</span>
          <span className="meta">
            {ticket.ageMinutes} min ago · wanted {wantedLabel(ticket)}
          </span>
        </div>
        <StatusPill status={ticket.status} />
      </header>

      {ticket.isHeld && (
        <p className="boh-held" role="status">
          <strong>Held{ ticket.heldBy ? ` by ${ticket.heldBy}` : ""}:</strong> {ticket.heldReason}
        </p>
      )}

      {/* The allergy sits above everything it could be buried under. A cook picks what to
          start from this card, and an allergy under the third dish is one they have already
          started cooking without. */}
      {ticket.allergyDeclaration && (
        <p className="boh-allergy" role="alert">
          <strong>Allergy:</strong> {ticket.allergyDeclaration}
        </p>
      )}

      <p className="boh-who">
        <strong>{ticket.customerName}</strong>
        <span className="meta">
          {ticket.orderType === "DineIn" ? "Dine in" : "Pickup"} · {formatCurrency(ticket.total)}
        </span>
      </p>

      {ticket.notes && <p className="boh-note">{ticket.notes}</p>}

      {phrase && <p className="boh-progress">{phrase}</p>}

      <ul className="boh-items">
        {ordered.map((item) => {
          const next = nextCookState(item.cookState)
          const label = cookActionLabel(item.cookState)
          const busy = busyItemId === item.id

          return (
            <li key={item.id} className="boh-item" data-state={item.cookState}>
              <div className="boh-item-main">
                <span className="boh-item-name">
                  <strong>{item.quantity}×</strong> {item.menuItemName}
                </span>
                <span className={`boh-state boh-state-${item.cookState.toLowerCase()}`}>
                  {cookStateLabel(item.cookState)}
                </span>
              </div>

              {item.modifiers && <p className="boh-item-detail">{item.modifiers}</p>}
              {item.specialInstructions && (
                <p className="boh-item-detail">{item.specialInstructions}</p>
              )}
              {item.kitchenNote && (
                <p className="boh-item-kitchen">
                  {item.kitchenNote}
                  {item.noteBy && <span className="meta"> — {item.noteBy}</span>}
                </p>
              )}

              <div className="boh-item-actions">
                {next && label ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || ticket.isHeld}
                    onClick={() => onAdvance(item)}
                  >
                    {busy ? "Saving…" : label}
                  </button>
                ) : (
                  <span className="meta">
                    {item.cookedBy ? `Done by ${item.cookedBy}` : "Done"}
                  </span>
                )}
                <button type="button" className="btn-link" onClick={() => onNote(item)}>
                  {item.kitchenNote ? "Edit note" : "Add note"}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {items.length === 0 && (
        <p className="items-empty" role="status">
          This order has no items recorded.
        </p>
      )}

      <footer className="boh-foot">
        {ticket.isHeld ? (
          <Button variant="ghost" onClick={onResume}>
            Back on the line
          </Button>
        ) : (
          <Button variant="ghost" onClick={onHold}>
            Hold
          </Button>
        )}
        <button type="button" className="btn-link" onClick={onHistory}>
          History
        </button>
      </footer>
    </article>
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
          Nothing recorded yet. Actions taken from this screen — starting a dish, holding the
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
