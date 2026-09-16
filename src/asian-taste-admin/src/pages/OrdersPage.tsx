import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ordersApi } from "@/api/orders"
import { AdminTop } from "@/components/AdminLayout"
import { Panel, PanelBody, SkeletonRows } from "@/components/ui/Primitives"
import { StatusPill } from "@/components/ui/StatusPill"
import { serviceLabel, STATUS_ORDER, statusKey, type StatusKey } from "@/lib/orderStatus"
import { formatCurrency, formatDate, minutesAgo } from "@/lib/utils"

type StatusFilter = "all" | StatusKey
type ServiceFilter = "all" | "delivery" | "pickup"

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  ...STATUS_ORDER.map((key) => ({ id: key as StatusFilter, label: key[0].toUpperCase() + key.slice(1) })),
  { id: "cancelled", label: "Cancelled" },
]

const SERVICE_FILTERS: Array<{ id: ServiceFilter; label: string }> = [
  { id: "all", label: "All services" },
  { id: "delivery", label: "Delivery" },
  { id: "pickup", label: "Pickup" },
]

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  )
}

/**
 * The order list.
 *
 * Search and filters run over the fetched page rather than round-tripping per
 * keystroke. The API supports status and date filters but not lookup by order
 * number (docs/TODO.md §9 item 5), so a search that only hit the server would
 * fail on the one thing staff actually search for: an order number a customer
 * just read out over the phone.
 */
export function OrdersPage() {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [service, setService] = useState<ServiceFilter>("all")

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "list"],
    queryFn: () => ordersApi.getOrders({ limit: 100 }),
    refetchInterval: 30_000,
  })

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((order) => {
      const key = statusKey(order.status)
      if (status !== "all" && key !== status) {
        // "Ready" also covers an order already out for delivery — staff looking
        // for a handover do not care which side of it the driver is on.
        if (!(status === "ready" && key === "delivery")) return false
      }
      if (service !== "all" && order.orderType.toLowerCase() !== service) return false
      if (q) {
        const hay = `${order.orderNumber} ${order.customerName} ${order.customerPhone}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [orders, query, status, service])

  const clearFilters = () => {
    setQuery("")
    setStatus("all")
    setService("all")
  }

  const isFiltered = query !== "" || status !== "all" || service !== "all"

  return (
    <>
      <AdminTop title="Orders" sub="Search, filter and open any order from today's service." />

      <div className="admin-page">
        <Panel data-od-id="orders-filters">
          <PanelBody>
            <div className="filterbar">
              <div className="search">
                <SearchIcon />
                <label className="sr-only" htmlFor="order-search">
                  Search orders
                </label>
                <input
                  id="order-search"
                  className="input"
                  type="search"
                  placeholder="Search by order number, customer or phone…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="seg-sm" role="group" aria-label="Filter by service">
                {SERVICE_FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={service === option.id}
                    onClick={() => setService(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="seg-sm" role="group" aria-label="Filter by status" style={{ marginTop: 12 }}>
              {STATUS_FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={status === option.id}
                  onClick={() => setStatus(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <p className="meta" aria-live="polite" style={{ margin: "12px 0 0" }}>
              Showing {rows.length} of {orders.length} orders
              {isFiltered && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={clearFilters}
                    style={{ background: "none", border: 0, color: "var(--color-accent)", cursor: "pointer", fontWeight: 700 }}
                  >
                    Clear filters
                  </button>
                </>
              )}
            </p>
          </PanelBody>
        </Panel>

        <Panel data-od-id="orders-table">
          {isLoading ? (
            <PanelBody>
              <SkeletonRows />
            </PanelBody>
          ) : (
            <div className="table-wrap">
              <table className="dtable">
                <caption className="sr-only">Orders for today</caption>
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
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="state-block">
                          <span className="state-icon">
                            <SearchIcon />
                          </span>
                          <h3>No orders match</h3>
                          <p>Try a different status, service or search term.</p>
                          <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                            Clear filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <Link className="order-id" to={`/orders/${order.id}`}>
                            {order.orderNumber}
                          </Link>
                        </td>
                        <td>
                          <strong>{order.customerName}</strong>
                          <br />
                          <span className="meta">{order.customerPhone}</span>
                        </td>
                        <td>{serviceLabel(order.orderType)}</td>
                        <td>
                          {formatDate(order.createdAt, "time")}
                          <br />
                          <span className="meta">{minutesAgo(order.createdAt)} min ago</span>
                        </td>
                        <td>
                          <StatusPill status={order.status} />
                        </td>
                        <td className="num-col">{formatCurrency(order.total)}</td>
                        <td>
                          <Link className="btn btn-ghost" style={{ minHeight: 36, padding: "6px 12px", fontSize: 13 }} to={`/orders/${order.id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="panel-foot row-between">
            <span className="meta">Showing today's most recent {orders.length} orders.</span>
          </div>
        </Panel>
      </div>
    </>
  )
}
