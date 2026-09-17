import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ordersApi } from "@/api/orders"
import type { OrderStatus } from "@/types"
import { AdminTop } from "@/components/AdminLayout"
import { Avatar, Button, Kv, KvRow, Panel, PanelBody, PanelHead, Pill, SkeletonRows, SumRow } from "@/components/ui/Primitives"
import { StatusPill } from "@/components/ui/StatusPill"
import { apiStatusValue, isClosed as isOrderClosed, serviceLabel, STATUS_META, STATUS_ORDER, statusKey } from "@/lib/orderStatus"
import { formatCurrency, formatDate, minutesAgo } from "@/lib/utils"
import { showAdminToast } from "@/components/ui/AdminToast"

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

/**
 * One ticket.
 *
 * The six-stage scale and the status control are the same `STATUS_ORDER`: the bar
 * shows the whole journey and the buttons set it, so the staff member can see
 * both where the order is and what moving it means.
 */
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: order, isLoading } = useQuery({
    queryKey: ["order-detail", id],
    queryFn: () => ordersApi.getOrderDetail(Number(id)),
    enabled: !!id,
  })

  const update = useMutation({
    mutationFn: ({ status, reason }: { status: OrderStatus; reason?: string }) =>
      ordersApi.updateOrderStatus(Number(id), { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] })
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      showAdminToast("Status updated")
    },
    onError: () => showAdminToast("Couldn't update the status — try again"),
  })

  const setStatus = (key: (typeof STATUS_ORDER)[number]) => {
    if (key === "cancelled") {
      const reason = window.prompt("Reason for cancelling this order?")
      if (!reason) return
      update.mutate({ status: apiStatusValue("cancelled") as OrderStatus, reason })
      return
    }
    update.mutate({ status: apiStatusValue(key) as OrderStatus })
  }

  if (isLoading) {
    return (
      <>
        <AdminTop title="Order" sub="Loading this ticket…" />
        <div className="admin-page">
          <SkeletonRows rows={4} />
        </div>
      </>
    )
  }

  if (!order) {
    return (
      <>
        <AdminTop title="Order" />
        <div className="admin-page">
          <Panel>
            <div className="state-block error">
              <h3>We couldn&rsquo;t open that order</h3>
              <p>It may have been removed, or the link is out of date.</p>
              <Button variant="primary" onClick={() => navigate("/orders")}>
                Back to orders
              </Button>
            </div>
          </Panel>
        </div>
      </>
    )
  }

  const key = statusKey(order.status)
  const currentIndex = STATUS_ORDER.indexOf(key)
  const isClosed = isOrderClosed(order.status)

  return (
    <>
      <AdminTop
        title={order.orderNumber}
        sub={`Placed ${formatDate(order.createdAt, "long")} · ${minutesAgo(order.createdAt)} min ago`}
        actions={
          <>
            <StatusPill status={order.status} />
            <Pill neutral>{serviceLabel(order.orderType)}</Pill>
          </>
        }
      />

      <div className="admin-page">
        <div className="filterbar">
          <Link className="btn btn-ghost" to="/orders">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            Back to orders
          </Link>
          <span className="head-who">
            <Avatar name={order.customerName} />
            <span>
              <strong>{order.customerName}</strong>
              <span className="meta">{order.customerPhone}</span>
            </span>
          </span>
        </div>

        <Panel data-od-id="detail-status">
          <PanelHead>
            <div>
              <h3>Status</h3>
              <p className="meta" style={{ margin: "2px 0 0" }}>
                Four stages, left to right. The bar shows the whole journey, not just where it is.
              </p>
            </div>
            <StatusPill status={order.status} />
          </PanelHead>
          <PanelBody>
            <div className="scale" aria-hidden="true">
              {STATUS_ORDER.map((stage, i) => (
                <div
                  className="scale-step"
                  key={stage}
                  data-done={i < currentIndex}
                  data-current={i === currentIndex && !isClosed}
                >
                  <span className="scale-bar" />
                  <span className="scale-label">{STATUS_META[stage].label}</span>
                </div>
              ))}
            </div>

            <div className="status-control" role="group" aria-label="Set order status" style={{ marginTop: 22 }}>
              {STATUS_ORDER.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  className="status-btn"
                  aria-pressed={stage === key}
                  disabled={update.isPending}
                  onClick={() => setStatus(stage)}
                >
                  <strong>{STATUS_META[stage].label}</strong>
                  <span>{STATUS_META[stage].desc}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setStatus("cancelled" as never)} disabled={update.isPending}>
                Cancel this order
              </Button>
              <p className="meta" style={{ margin: 0 }}>
                {isClosed
                  ? key === "cancelled"
                    ? "This order was cancelled."
                    : "Collected — this order is done and has left the live board."
                  : `Next: ${STATUS_META[STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, currentIndex + 1)]].label}.`}
              </p>
            </div>
          </PanelBody>
        </Panel>

        <div className="detail-grid">
          <div className="flex flex-col gap-6" data-od-id="detail-items">
            <Panel>
              <PanelHead>
                <h3>Items</h3>
                <Pill>
                  {order.items.reduce((sum, i) => sum + i.quantity, 0)} items
                </Pill>
              </PanelHead>
              <PanelBody>
                {order.items.map((item) => (
                  <div className="line-item" key={item.id}>
                    <span className="li-qty">{item.quantity}×</span>
                    <div>
                      <strong>{item.menuItemName}</strong>
                      {item.specialInstructions && <p className="li-mod">Note: {item.specialInstructions}</p>}
                      {item.modifiers.length > 0 && (
                        <p className="li-mod">{item.modifiers.map((m) => m.modifierName).join(" · ")}</p>
                      )}
                    </div>
                    <span className="li-price">{formatCurrency(item.totalPrice)}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12 }}>
                  <SumRow label="Items" value={formatCurrency(order.subtotal)} total />
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHead>
                <h3>Kitchen note</h3>
              </PanelHead>
              <PanelBody>
                <p style={{ margin: 0 }}>
                  {order.notes || "No special instructions for this order."}
                </p>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHead>
                <h3>Payment</h3>
                <Pill>{order.paymentMethod === "Cash" ? "Pay at counter" : "Paid online"}</Pill>
              </PanelHead>
              <PanelBody>
                <SumRow label="Subtotal" value={formatCurrency(order.subtotal)} />
                <SumRow label="GST" value="included" />
                <SumRow label="Total" value={formatCurrency(order.total)} total />
              </PanelBody>
            </Panel>
          </div>

          <div className="flex flex-col gap-6" data-od-id="detail-customer">
            <Panel>
              <PanelHead>
                <h3>Customer</h3>
              </PanelHead>
              <PanelBody>
                <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
                  <Avatar name={order.customerName} lg />
                  <div>
                    <strong>{order.customerName}</strong>
                    <p className="meta" style={{ margin: "2px 0 0" }}>
                      {order.customerPhone}
                    </p>
                  </div>
                </div>
                <Kv>
                  <KvRow label="Service" value={serviceLabel(order.orderType)} />
                  <KvRow label="Email" value={order.customerEmail} />
                  <KvRow label="Placed" value={formatDate(order.createdAt, "long")} />
                </Kv>
                <div className="flex flex-wrap gap-2" style={{ marginTop: 16 }}>
                  <a className="btn btn-secondary" href={`tel:${order.customerPhone.replace(/\s/g, "")}`}>
                    Call
                  </a>
                  <Button
                    variant="ghost"
                    onClick={() => window.print()}
                  >
                    Print docket
                  </Button>
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHead>
                <h3>Progress</h3>
              </PanelHead>
              <PanelBody>
                <ol className="timeline">
                  {STATUS_ORDER.map((stage, i) => (
                    <li key={stage} data-done={i < currentIndex} data-current={i === currentIndex && !isClosed}>
                      <span className="tl-mark">
                        {i < currentIndex ? (
                          <CheckMark />
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <circle cx="12" cy="12" r={i === currentIndex ? 4 : 3.5} fill={i === currentIndex ? "currentColor" : "none"} />
                          </svg>
                        )}
                      </span>
                      <div className="tl-body">
                        <strong>{STATUS_META[stage].label}</strong>
                        <p>{i <= currentIndex ? STATUS_META[stage].desc : "Not yet."}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </>
  )
}
