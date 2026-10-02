import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ordersApi } from "@/api/orders"
import type { Order, OrderStatus } from "@/types"
import { AdminTop } from "@/components/AdminLayout"
import { Avatar, Panel, PanelBody, Pill, SkeletonRows } from "@/components/ui/Primitives"
import { StatusPill } from "@/components/ui/StatusPill"
import { apiStatusValue, isClosed, OPEN_STATUSES, STATUS_META, statusKey, type StatusKey } from "@/lib/orderStatus"
import { readPayment } from "@/lib/payment"
import { boardAction } from "@/lib/boardAction"
import { OrderItems } from "@/components/orders/OrderItems"
import { showAdminToast } from "@/components/ui/AdminToast"
import { formatCurrency, formatDate, minutesAgo } from "@/lib/utils"
import { useOrderWebSocket } from "@/hooks/useOrderWebSocket"

/**
 * The kitchen board, in the order the food moves.
 *
 * One column per open stage, in the order of the shared `OPEN_STATUSES`. Collected
 * orders have no column: the press that finishes them is also the press that clears
 * the board.
 *
 * The titles come from the shared vocabulary rather than being typed out again. They
 * used to be a second, hand-written list, and it drifted — the column header said
 * "Cooking" while the pill underneath said "Confirmed", so one ticket carried two
 * names for one state.
 */
const COLUMN_HINTS: Record<string, string> = {
  placed: "Accept or reject",
  confirmed: "Accepted — on the wok",
  ready: "Waiting to be collected",
}

const COLUMNS: Array<{ key: StatusKey; title: string; hint: string }> = OPEN_STATUSES.map((key) => ({
  key,
  title: STATUS_META[key].label,
  hint: COLUMN_HINTS[key] ?? "",
}))


/** Matches the customer-side accent budget: one loud thing per screen. */
const URGENT_MINUTES = 20

/**
 * When the order is wanted.
 *
 * An ASAP order stores the moment it was placed as its requested time, so anything
 * inside the pickup window reads as "ASAP" and only a genuinely scheduled order shows
 * a time. Without this the board cannot tell a 6pm order placed at 4pm from one the
 * customer is waiting for — and cooking the first on arrival puts food on the counter
 * that nobody will collect for two hours.
 */
function wantedFor(order: Order): string {
  const requested = new Date(order.requestedTime).getTime()
  const placed = new Date(order.createdAt).getTime()
  if (!Number.isFinite(requested) || requested - placed <= 5 * 60_000) return "ASAP"
  return formatDate(order.requestedTime, "time")
}

function isScheduled(order: Order): boolean {
  return wantedFor(order) !== "ASAP"
}

/**
 * The kitchen's ticket, with its next action on it.
 *
 * The advance button is the point of this screen. It used to read "Next: accept" and
 * nothing else: moving an order meant opening the ticket on another page, finding the
 * status control, and pressing a stage button — a navigation and a second decision for
 * something the cook already knows. During service that is where a board goes stale.
 *
 * One press now, and the press is guarded by `canTransition` rather than by whatever
 * the button happens to say: the same rule that protects the detail page decides here,
 * so a WebSocket frame carrying an older status cannot talk the board into an illegal
 * move (skipping a stage, or advancing a cancelled order).
 */
function Ticket({
  order,
  onAdvance,
  onTick,
  busy,
  tickingItemId,
}: {
  order: Order
  onAdvance: (next: StatusKey) => void
  /** Tick or untick one dish. */
  onTick: (itemId: number, isCompleted: boolean) => void
  busy: boolean
  /** The line currently in flight, so only that one reads "saving". */
  tickingItemId: number | null
}) {
  const mins = minutesAgo(order.createdAt)
  const payment = readPayment(order.paymentStatus, order.paymentMethod)
  const scheduled = isScheduled(order)

  // The rule that decides, not the button's own wording. See lib/boardAction.
  const action = boardAction(order.status)

  return (
    <article className={`ticket ${mins > URGENT_MINUTES ? "urgent" : ""}`}>
      <div className="ticket-top">
        <span className="ticket-id">{order.orderNumber}</span>
        <StatusPill status={order.status} />
      </div>

      {/* The two things that change what the kitchen should do: a bag that cannot go
          out because the charge failed, and food wanted later rather than now. */}
      {(payment.attention || scheduled) && (
        <div className="ticket-flags">
          {payment.attention && <span className="ticket-flag flag-warn">{payment.label}</span>}
          {scheduled && (
            <span className="ticket-flag flag-time">For {wantedFor(order)}</span>
          )}
        </div>
      )}

      <p className="ticket-who">
        <Avatar name={order.customerName} />
        <strong>{order.customerName}</strong>
        <span className="meta">{order.customerPhone}</span>
      </p>

      <p className="ticket-meta">
        placed {formatDate(order.createdAt, "time")} · <strong>{mins} min ago</strong>
      </p>

      {/* The allergy, on the BOARD. A cook picks what to start from this screen, so an
          allergy visible only after opening the ticket is one they have already begun
          cooking without. Rendered in the alert red used everywhere else in this app
          for "do not proceed". */}
      {order.allergyDeclaration && (
        <p className="ticket-allergy" role="alert">
          <strong>Allergy:</strong> {order.allergyDeclaration}
        </p>
      )}

      {order.notes && (
        <p className="ticket-meta" style={{ color: "var(--color-accent)" }}>
          {order.notes}
        </p>
      )}

      <div className="ticket-actions">
        {action ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 38, padding: "8px 14px", fontSize: 13 }}
            disabled={busy}
            onClick={() => onAdvance(action.to)}
          >
            {busy ? "Saving…" : action.label}
          </button>
        ) : (
          <span className="meta">No further step.</span>
        )}
        <OpenLink href={`/orders/${order.id}`} />
      </div>

      {/* ── The dish list, at the bottom of the ticket ──────────────────────────
          This is what the ticket is FOR: a cook needs to know which dishes make up
          the order, and which of them are still to do. Until this existed the board
          showed a customer's name and a status, and the food itself was only visible
          after opening the ticket on another page.

          The list and its tick control come from components/orders/OrderItems, so the
          board, the Orders list and the ticket page cannot drift apart on what a dish
          can be ticked from. */}
      <div className="ticket-lines">
        <OrderItems
          order={order}
          onTick={onTick}
          tickingItemId={tickingItemId}
        />
      </div>
    </article>
  )
}

function OpenLink({ href }: { href: string }) {
  return (
    <Link className="btn btn-secondary" to={href} style={{ minHeight: 38, padding: "8px 14px", fontSize: 13 }}>
      Open
    </Link>
  )
}

/**
 * The dashboard.
 *
 * The kitchen board is the screen's job — a live order that only appears on
 * refresh is worse than useless, because the tablet is the pass's whole view of
 * the shop. `useOrderWebSocket` is what pushes; this page just renders the
 * orders it invalidates.
 */
export function DashboardPage() {
  const { isConnected } = useOrderWebSocket()
  const queryClient = useQueryClient()
  const [savingId, setSavingId] = useState<number | null>(null)
  /** The single dish currently being ticked, so only its own row shows as busy. */
  const [tickingItemId, setTickingItemId] = useState<number | null>(null)

  // The board asks for the LINES, which the Orders table does not. They are what the
  // ticket renders at its bottom, and fetching them per ticket on demand would mean one
  // request per tap of "Open" — on the screen whose whole job is to be glanceable.
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "board"],
    queryFn: () => ordersApi.getOrders({ limit: 100, includeItems: true }),
    refetchInterval: 30_000,
  })

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => ordersApi.getDashboardSummary(),
    refetchInterval: 30_000,
  })

  /**
   * Advance one ticket, from the board.
   *
   * The refresh is deliberately broad: advancing an order changes the day's numbers
   * as well as the columns, and the board is the screen a mistake is noticed on. A
   * failed press says so and changes nothing — the ticket stays where it is, so the
   * cook can try again rather than wondering whether it worked.
   *
   * The transition is re-checked by `canTransition` inside `Ticket`, and the API is
   * the last word: it rejects a status it considers invalid, which surfaces here.
   */
  const advance = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusKey }) =>
      ordersApi.updateOrderStatus(id, { status: apiStatusValue(status) as OrderStatus }),
    onMutate: ({ id }) => setSavingId(id),
    onSettled: () => setSavingId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
    },
    onError: () => showAdminToast("Couldn't update that order — try again"),
  })

  /**
   * Tick one dish off, from the ticket.
   *
   * Optimistic, and deliberately so: this is the control a cook presses tens of times a
   * shift, sometimes twice a second, and a round trip of "Saving…" under the finger makes
   * the pass feel broken. The counts are patched locally at the same time so the ticket's
   * "2 of 4" moves with the tick rather than a moment later.
   *
   * The rollback matters more than the optimism. If the server refuses — the order was
   * cancelled by somebody else, or the line moved — the locally-added tick is removed, so
   * the board never keeps a claim the database does not agree with. A kitchen working
   * from a tick that does not exist is how a dish gets forgotten.
   *
   * The response is authoritative on the bigger question (did the order finish?) and is
   * reported to the cook, because "the customer has been emailed" is not something the
   * screen could have guessed.
   */
  const tick = useMutation({
    mutationFn: ({ orderId, itemId, isCompleted }: { orderId: number; itemId: number; isCompleted: boolean }) =>
      ordersApi.setItemCompleted(orderId, itemId, isCompleted),

    onMutate: async ({ orderId, itemId, isCompleted }) => {
      setTickingItemId(itemId)

      // Stop an in-flight refetch from overwriting the optimistic patch with the old row.
      await queryClient.cancelQueries({ queryKey: ["orders", "board"] })
      const previous = queryClient.getQueryData<Order[]>(["orders", "board"])

      queryClient.setQueryData<Order[]>(["orders", "board"], (current) =>
        (current ?? []).map((order) => {
          if (order.id !== orderId || !order.items) return order

          const items = order.items.map((line) =>
            line.id === itemId ? { ...line, isCompleted } : line,
          )

          return {
            ...order,
            items,
            itemsDone: {
              done: items.filter((line) => line.isCompleted).length,
              total: items.length,
            },
          }
        }),
      )

      return { previous }
    },

    onError: (_error, { orderId }, context) => {
      // Put the board back the way the database still says it is.
      if (context?.previous) {
        queryClient.setQueryData(["orders", "board"], context.previous)
      }
      showAdminToast(`Couldn't update a dish on ${orderId} — check the ticket`)
    },

    onSuccess: (result) => {
      // Say the thing the screen could not know. The order moving, and the customer being
      // told, are both decided on the server and both change what the cook does next —
      // call the number out, or ring them.
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
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
    },
  })

  // The board carries only the open stages. Collected orders are finished, so
  // they leave it and land in the day's numbers below instead of sitting in a
  // column nobody has a reason to look at again.
  const active = orders.filter((o) => !isClosed(o.status))

  // Oldest first in every column: the next thing to do is always at the top.
  const inColumn = (key: StatusKey) =>
    orders
      .filter((o) => statusKey(o.status) === key)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  // "Collected today" and "Revenue today" come from the SERVER's summary.
  //
  // They were computed here instead, by filtering the last 100 orders the page had
  // fetched — so a busy day silently truncated the numbers, and an order collected
  // yesterday still counted towards today's takings, because the filter was "is in
  // the fetched page", not "was collected today". A revenue figure that is wrong at
  // the end of a busy day is the one number the owner actually reads.
  const collectedToday = summary?.completedOrdersToday ?? 0
  const revenueToday = summary?.todayRevenue ?? 0

  // These two are genuinely about what is on the board right now, so the fetched
  // page is the right source for them.
  const readyToday = orders.filter((o) => statusKey(o.status) === "ready").length
  const cancelledToday = orders.filter((o) => statusKey(o.status) === "cancelled").length

  return (
    <>
      <AdminTop
        title="Dashboard"
        sub="Live orders, the kitchen board and today's numbers."
        actions={<StatusPill status={apiStatusValue("ready")} label={isConnected ? "Kitchen online" : "Reconnecting"} />}
      />

      <div className="admin-page">
        <section className="stat-grid" data-od-id="dash-stats">
          <div className="stat-card is-accent">
            <p className="stat-k">Live orders</p>
            <p className="stat-v">{active.length}</p>
            <p className="stat-delta">
              {orders.filter((o) => statusKey(o.status) === "placed").length} waiting to be accepted
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-k">Needs attention</p>
            <p className="stat-v">
              {active.filter((o) => minutesAgo(o.createdAt) > URGENT_MINUTES).length}
            </p>
            <p className="stat-delta down">over {URGENT_MINUTES} min on the board</p>
          </div>
          <div className="stat-card">
            <p className="stat-k">Collected today</p>
            <p className="stat-v">{collectedToday}</p>
            <p className="stat-delta">
              {readyToday} on the counter · {cancelledToday} cancelled
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-k">Revenue today</p>
            <p className="stat-v">{formatCurrency(revenueToday)}</p>
            <p className="stat-delta">GST inclusive · AUD</p>
          </div>
        </section>

        <section data-od-id="dash-board">
          <div className="head" style={{ marginBottom: 20 }}>
            <div className="head-copy">
              <p className="eyebrow eyebrow-gold">Kitchen board</p>
              <h2 style={{ marginBottom: 6 }}>Where every order is right now</h2>
              <p className="meta" style={{ margin: 0 }}>
                Oldest order sits at the top of each column.
              </p>
            </div>
            <Link className="btn btn-secondary" to="/orders">
              Open the full order list
            </Link>
          </div>

          {isLoading ? (
            <SkeletonRows rows={4} />
          ) : (
            <div className="board">
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
                    {list.length ? (
                      list.map((order) => (
                        <Ticket
                          key={order.id}
                          order={order}
                          busy={savingId === order.id}
                          tickingItemId={tickingItemId}
                          onAdvance={(status) => advance.mutate({ id: order.id, status })}
                          onTick={(itemId, isCompleted) =>
                            tick.mutate({ orderId: order.id, itemId, isCompleted })
                          }
                        />
                      ))
                    ) : (
                      <p className="board-empty">Nothing here.</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section data-od-id="dash-recent">
          <div className="head" style={{ marginBottom: 16 }}>
            <div className="head-copy">
              <p className="eyebrow eyebrow-gold">Latest</p>
              <h2 style={{ marginBottom: 0 }}>Most recent orders</h2>
            </div>
            <Link className="btn btn-ghost" to="/orders">
              View all
            </Link>
          </div>

          <Panel className="table-wrap">
            <table className="dtable">
              <caption className="sr-only">The six most recent orders</caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Wanted</th>
                  <th scope="col">Placed</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num-col">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 6).map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link className="order-id" to={`/orders/${order.id}`}>
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td>{order.customerName}</td>
                    <td>{wantedFor(order)}</td>
                    <td>{formatDate(order.createdAt, "time")}</td>
                    <td>
                      <StatusPill status={order.status} />
                    </td>
                    <td className="num-col">{formatCurrency(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {summary?.ordersByStatus && (
              <PanelBody>
                <div className="filterbar">
                  {Object.entries(summary.ordersByStatus).map(([status, count]) => (
                    <Pill key={status} neutral>
                      {status}: {count as number}
                    </Pill>
                  ))}
                </div>
              </PanelBody>
            )}
          </Panel>
        </section>
      </div>
    </>
  )
}

export type { OrderStatus }
