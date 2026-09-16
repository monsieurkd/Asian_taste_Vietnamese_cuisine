import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ordersApi } from "@/api/orders"
import type { Order, OrderStatus } from "@/types"
import { AdminTop } from "@/components/AdminLayout"
import { Avatar, Panel, PanelBody, Pill, SkeletonRows } from "@/components/ui/Primitives"
import { StatusPill } from "@/components/ui/StatusPill"
import { apiStatusValue, nextStatus, serviceLabel, statusKey, type StatusKey } from "@/lib/orderStatus"
import { formatCurrency, formatDate, minutesAgo } from "@/lib/utils"
import { useOrderWebSocket } from "@/hooks/useOrderWebSocket"

/**
 * The kitchen board, in the order the food moves.
 *
 * Three columns, because there are three states: an order waiting to be
 * accepted, one being cooked, and one waiting to be collected. "Confirmed" and
 * "Preparing" used to be separate columns — they are the same moment, so the
 * second was always empty.
 */
const COLUMNS: Array<{ key: StatusKey; title: string; hint: string }> = [
  { key: "placed", title: "New", hint: "Accept or reject" },
  { key: "confirmed", title: "Cooking", hint: "Accepted — on the wok" },
  { key: "ready", title: "Ready", hint: "Waiting to be collected" },
]

const ADVANCE_LABEL: Partial<Record<StatusKey, string>> = {
  placed: "Accept",
  confirmed: "Mark ready",
}

/** Matches the customer-side accent budget: one loud thing per screen. */
const URGENT_MINUTES = 20

function Ticket({ order }: { order: Order }) {
  const key = statusKey(order.status)
  const next = nextStatus(order.status)
  const mins = minutesAgo(order.createdAt)

  return (
    <article className={`ticket ${mins > URGENT_MINUTES ? "urgent" : ""}`}>
      <div className="ticket-top">
        <span className="ticket-id">{order.orderNumber}</span>
        <StatusPill status={order.status} />
      </div>

      <p className="ticket-who">
        <Avatar name={order.customerName} />
        <strong>{order.customerName}</strong>
        <span className="meta">{order.customerPhone}</span>
      </p>

      <p className="ticket-meta">
        {serviceLabel(order.orderType)} · placed {formatDate(order.createdAt, "time")} ·{" "}
        <strong>{mins} min ago</strong>
      </p>

      {order.notes && (
        <p className="ticket-meta" style={{ color: "var(--color-accent)" }}>
          {order.notes}
        </p>
      )}

      <div className="ticket-actions">
        <OpenLink href={`/orders/${order.id}`} />
        {next && ADVANCE_LABEL[key] && (
          <span className="meta">Next: {ADVANCE_LABEL[key].toLowerCase()}</span>
        )}
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

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "board"],
    queryFn: () => ordersApi.getOrders({ limit: 100 }),
    refetchInterval: 30_000,
  })

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => ordersApi.getDashboardSummary(),
    refetchInterval: 30_000,
  })

  const active = orders.filter((o) => statusKey(o.status) !== "cancelled")

  // Oldest first in every column: the next thing to do is always at the top.
  const inColumn = (key: StatusKey) =>
    orders
      .filter((o) => statusKey(o.status) === key)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  // Ready is the terminal state for pickup, so it is what "done today" means.
  const readyToday = orders.filter((o) => statusKey(o.status) === "ready")
  const revenueToday = readyToday.reduce((sum, o) => sum + o.total, 0)
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
            <p className="stat-k">Ready today</p>
            <p className="stat-v">{readyToday.length}</p>
            <p className="stat-delta down">{cancelledToday} cancelled</p>
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
                      list.map((order) => <Ticket key={order.id} order={order} />)
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
                  <th scope="col">Service</th>
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
                    <td>{serviceLabel(order.orderType)}</td>
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
