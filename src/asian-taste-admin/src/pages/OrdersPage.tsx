import { Fragment, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type { Order } from "@/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ordersApi } from "@/api/orders"
import { AdminTop } from "@/components/AdminLayout"
import { Panel, PanelBody, Pill, SkeletonRows } from "@/components/ui/Primitives"
import { StatusPill } from "@/components/ui/StatusPill"
import { STATUS_META, STATUS_ORDER, statusKey, type StatusKey } from "@/lib/orderStatus"
import { readPayment } from "@/lib/payment"
import { OrderItems, OrderProgressPill } from "@/components/orders/OrderItems"
import { showAdminToast } from "@/components/ui/AdminToast"
import { formatCurrency, formatDate, minutesAgo } from "@/lib/utils"

type StatusFilter = "all" | StatusKey

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  ...STATUS_ORDER.map((key) => ({ id: key as StatusFilter, label: STATUS_META[key].label })),
  { id: "cancelled", label: "Cancelled" },
]

/**
 * The list used to filter by service — Pickup, Delivery or all. v1 is pickup only, so
 * every row said "Pickup" and the filter could not change what was shown. A control
 * that cannot do anything is worse than no control: it suggests a choice that is not
 * there. The Service COLUMN stays, because the API can hold a dine-in order and the
 * column is how anyone would notice one.
 */

/** The money, per row. A declined card must be visible without opening the order. */
function paymentFor(order: Order) {
  return readPayment(order.paymentStatus, order.paymentMethod)
}

/**
 * When the order is wanted.
 *
 * An ASAP order stores the moment it was placed as its requested time, so anything
 * inside the pickup window reads as "ASAP" and only a genuinely scheduled order shows
 * a time. That is the distinction the board needs: a 6pm order appearing at 4pm must
 * not be cooked on arrival.
 */
function wantedFor(order: Order): string {
  const requested = new Date(order.requestedTime).getTime()
  const placed = new Date(order.createdAt).getTime()
  if (!Number.isFinite(requested) || requested - placed <= 5 * 60_000) return "ASAP"
  return formatDate(order.requestedTime, "time")
}

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
 * Two search paths, deliberately:
 *
 *   1. **The order number hits the server.** A customer on the phone reads out a
 *      number; the kitchen needs THAT order, which may be older than the latest
 *      page. A client-side filter can only ever search what has been fetched, so
 *      at any real volume it silently fails at the one lookup staff actually
 *      perform. `orderNumber` is now a real API filter (docs/TODO.md §9 item 5).
 *   2. **Name and phone stay client-side**, over the current page. They are
 *      partial, fuzzy, and typed while someone is still talking — round-tripping
 *      every keystroke for them would trade a useful latency for nothing.
 *
 * When a number is typed, both run: the server narrows, then the local filter
 * matches the other fields against what came back. The two are additive, so
 * neither can hide a row the other would have found.
 */
export function OrdersPage() {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const queryClient = useQueryClient()
  /**
   * The row whose dishes are showing, if any.
   *
   * One at a time, because the point of expanding here is to answer a question about ONE
   * order — usually a phone call — and a table where every row is open is the board
   * with more columns.
   */
  const [openRowId, setOpenRowId] = useState<number | null>(null)
  const [tickingItemId, setTickingItemId] = useState<number | null>(null)

  // Digits are what an order number is made of, so a query containing any is
  // treated as a potential number lookup. A name or a phone also contains digits
  // (a phone is all digits), so this is deliberately a *superset* trigger: the
  // server match is a substring, and the local filter still runs over the result.
  const numberQuery = useMemo(() => {
    const q = query.trim()
    return /\d/.test(q) ? q : ""
  }, [query])

  // The list fetches the LINES too, so a row can show what to cook without opening the
  // order. It is the same payload the board asks for; the alternative is one request per
  // expanded row, which is the round trip this screen exists to skip.
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "list", numberQuery],
    queryFn: () =>
      ordersApi.getOrders({
        limit: 100,
        orderNumber: numberQuery || undefined,
        includeItems: true,
      }),
    refetchInterval: 30_000,
  })

  /**
   * Tick a dish from the list.
   *
   * Deliberately NOT optimistic here, unlike the board. This screen is used one-handed
   * while talking to somebody on the phone, where a row that changes under the cursor
   * before the server agrees is worse than a half-second of "saving" — and there is no
   * pressure to keep up with, because nobody is cooking from this table.
   */
  const tick = useMutation({
    mutationFn: ({ orderId, itemId, isCompleted }: { orderId: number; itemId: number; isCompleted: boolean }) =>
      ordersApi.setItemCompleted(orderId, itemId, isCompleted),

    onMutate: ({ itemId }) => setTickingItemId(itemId),
    onSettled: () => {
      setTickingItemId(null)
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
    },
    onSuccess: (result) => {
      // Say what the screen could not know: whether the last dish finished the order, and
      // whether the customer was actually emailed. Same wording as the board, because it
      // is the same fact.
      if (result.orderMarkedReady) {
        showAdminToast(
          result.customerNotified
            ? "Every dish done — order is ready and the customer has been emailed"
            : "Every dish done — order is ready. Nobody to email, so call the number out",
        )
      }
    },
    onError: () => showAdminToast("Couldn't update that dish — try again"),
  })

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((order) => {
      const key = statusKey(order.status)
      if (status !== "all" && key !== status) return false
      if (q) {
        const hay = `${order.orderNumber} ${order.customerName} ${order.customerPhone}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [orders, query, status])

  const clearFilters = () => {
    setQuery("")
    setStatus("all")
  }

  const isFiltered = query !== "" || status !== "all"

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

              <div className="seg-sm" role="group" aria-label="Filter by status">
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
                    <th scope="col">Wanted</th>
                    <th scope="col">Placed</th>
                    <th scope="col">Status</th>
                    <th scope="col">Items</th>
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
                      <td colSpan={8}>
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
                    rows.map((order) => {
                      const open = openRowId === order.id
                      const panelId = `order-items-${order.id}`

                      return (
                        <Fragment key={order.id}>
                          <tr data-open={open}>
                            <td>
                              <Link className="order-id" to={`/orders/${order.id}`}>
                                {order.orderNumber}
                              </Link>
                            </td>
                            <td>
                              <strong>{order.customerName}</strong>
                              <br />
                              <span className="meta">{order.customerPhone}</span>
                              {paymentFor(order).attention && (
                                <>
                                  <br />
                                  <Pill className="pill-warn">{paymentFor(order).label}</Pill>
                                </>
                              )}
                            </td>
                            <td>{wantedFor(order)}</td>
                            <td>
                              {formatDate(order.createdAt, "time")}
                              <br />
                              <span className="meta">{minutesAgo(order.createdAt)} min ago</span>
                            </td>
                            <td>
                              <StatusPill status={order.status} />
                            </td>
                            <td>
                              {/* The dishes are one press away rather than always on
                                  screen: a table with every ticket open is the board with
                                  more columns, and this screen is for finding an order,
                                  not for working the pass. */}
                              <button
                                type="button"
                                className="row-expand"
                                aria-expanded={open}
                                aria-controls={panelId}
                                onClick={() => setOpenRowId(open ? null : order.id)}
                              >
                                <OrderProgressPill order={order} />
                                <span className="row-expand-chev" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m6 9.5 6 5.5 6-5.5" />
                                  </svg>
                                </span>
                                <span className="sr-only">
                                  {open ? "Hide dishes" : "Show dishes"}
                                </span>
                              </button>
                            </td>
                            <td className="num-col">{formatCurrency(order.total)}</td>
                            <td>
                              <Link className="btn btn-ghost" style={{ minHeight: 36, padding: "6px 12px", fontSize: 13 }} to={`/orders/${order.id}`}>
                                Open
                              </Link>
                            </td>
                          </tr>

                          {open && (
                            <tr className="row-items">
                              <td colSpan={8} id={panelId}>
                                <OrderItems
                                  order={order}
                                  tickingItemId={tickingItemId}
                                  onTick={(itemId, isCompleted) =>
                                    tick.mutate({ orderId: order.id, itemId, isCompleted })
                                  }
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })
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
