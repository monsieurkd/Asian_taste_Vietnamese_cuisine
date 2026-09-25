import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ordersApi } from "@/api/orders"
import type { OrderStatus } from "@/types"
import { AdminTop } from "@/components/AdminLayout"
import { Avatar, Button, Kv, KvRow, Panel, PanelBody, PanelHead, Pill, SkeletonRows, SumRow } from "@/components/ui/Primitives"
import { StatusPill } from "@/components/ui/StatusPill"
import { apiStatusValue, isClosed as isOrderClosed, STATUS_META, STATUS_ORDER, statusKey } from "@/lib/orderStatus"
import { readPayment } from "@/lib/payment"
import { formatCurrency, formatDate, minutesAgo } from "@/lib/utils"
import { showAdminToast } from "@/components/ui/AdminToast"
import { AdminModal } from "@/components/ui/AdminModal"
import { refundEligibility } from "@/lib/refund"

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
  /** Whether the refund confirmation is open. See the dialog for why it is a step. */
  const [refunding, setRefunding] = useState(false)

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

  /**
   * Refund the card charge.
   *
   * Full refund only, from here: a partial refund is a negotiation about what went
   * wrong, and doing it by typing a number into a kitchen screen invites a decimal
   * point in the wrong place. Partial refunds stay in the Stripe dashboard, where the
   * amount is set beside the charge it applies to.
   *
   * The order is refetched after a success rather than patched locally, because the
   * server decides whether the refund was full or partial (comparing the refunded
   * total against what was actually paid) — and the row is what the till reconciles.
   */
  const refund = useMutation({
    mutationFn: () => {
      if (!order?.paymentIntentId) throw new Error("This order has no card payment to refund.");
      return ordersApi.refundPayment(order.paymentIntentId);
    },
    onSuccess: (result) => {
      if (!result.success) {
        showAdminToast(result.errorMessage ?? "Stripe refused the refund — try it from the dashboard");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] })
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      showAdminToast(`Refunded ${formatCurrency(result.amount)}`)
    },
    onError: (err: unknown) =>
      showAdminToast(err instanceof Error ? err.message : "Couldn't refund that order"),
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
  const payment = readPayment(order.paymentStatus, order.paymentMethod, order.paymentFailureReason)

  // The refund rule lives in lib/refund, where its cases are tested — including the
  // quiet one: an order with no payment reference cannot have a refund matched to it,
  // so the money would move while the order kept reading as paid.
  const refundable = refundEligibility(order.paymentStatus, order.paymentMethod, order.paymentIntentId)

  // An ASAP order stores the moment it was placed as its requested time, so the only
  // way to tell a scheduled order from an immediate one is that its time is meaningfully
  // ahead of when it arrived. Anything inside the pickup window is "now".
  const requestedAt = new Date(order.requestedTime).getTime()
  const placedAt = new Date(order.createdAt).getTime()
  const isScheduled = Number.isFinite(requestedAt) && requestedAt - placedAt > 5 * 60_000

  return (
    <>
      <AdminTop
        title={order.orderNumber}
        sub={`Placed ${formatDate(order.createdAt, "long")} · ${minutesAgo(order.createdAt)} min ago`}
        actions={
          <>
            <StatusPill status={order.status} />
            {payment.attention && <Pill className="pill-warn">{payment.label}</Pill>}
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

            <Panel data-od-id="detail-payment">
              <PanelHead>
                <h3>Payment</h3>
                {/* The outcome, not the method. This said "Paid online" for every
                    card order — including a declined one — because the payment
                    status was never fetched. */}
                <Pill className={payment.attention ? "pill-warn" : undefined}>{payment.label}</Pill>
              </PanelHead>
              <PanelBody>
                <SumRow label="Subtotal" value={formatCurrency(order.subtotal)} />
                <SumRow label="GST" value="included" />
                <SumRow label="Total" value={formatCurrency(order.total)} total />
                {payment.attention && (
                  <p className="pay-warning" role="status">
                    {payment.detail}
                  </p>
                )}
                {!payment.attention && payment.detail && (
                  <p className="meta" style={{ marginTop: 8 }}>
                    {payment.detail}
                  </p>
                )}

                {/* Refunding from the ticket rather than the Stripe dashboard. The
                    endpoint has worked for a while and nothing called it, so a refund
                    still meant a second system and a copied id. */}
                {(refundable.canRefund || refundable.alreadyRefunded) && (
                  <div style={{ marginTop: 14 }}>
                    {refundable.alreadyRefunded ? (
                      <p className="meta" style={{ margin: 0 }}>
                        Refunded in full — nothing further to collect or return.
                      </p>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => setRefunding(true)}
                        disabled={update.isPending || refund.isPending}
                      >
                        {refund.isPending ? 'Refunding…' : 'Refund this order'}
                      </Button>
                    )}
                  </div>
                )}

                {/* When a refund is impossible, say so. A control that is simply
                    absent sends staff to the Stripe dashboard with no explanation. */}
                {refundable.reason && (
                  <p className="meta" style={{ marginTop: 12 }}>
                    {refundable.reason}
                  </p>
                )}
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
                  <KvRow
                    label={isScheduled ? "Wanted for" : "Time"}
                    value={
                      isScheduled
                        ? formatDate(order.requestedTime, "time")
                        : "As soon as possible"
                    }
                  />
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

      {refunding && (
        <AdminModal
          title="Refund this order?"
          labelledBy="refund-title"
          onClose={() => setRefunding(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRefunding(false)} disabled={refund.isPending}>
                Keep the payment
              </Button>
              <Button variant="primary" onClick={() => refund.mutate()} disabled={refund.isPending}>
                {refund.isPending ? "Refunding…" : `Refund ${formatCurrency(order.total)}`}
              </Button>
            </>
          }
        >
          {/* The confirmation states the amount and the consequence rather than asking
              "are you sure?" — a refund cannot be undone from this screen, and the two
              things staff need to check are WHAT is going back and WHICH order it
              belongs to. The customer's name is here because a refund pressed on the
              wrong ticket is the expensive mistake. */}
          <p style={{ margin: "0 0 10px" }}>
            <strong>{formatCurrency(order.total)}</strong> will be returned to{" "}
            <strong>{order.customerName}</strong> for order <strong>{order.orderNumber}</strong>.
          </p>
          <p className="meta" style={{ margin: 0 }}>
            The money goes back to the card within a few business days. This cannot be undone
            here — the order will be marked refunded, and cancelling it afterwards will not take
            the money back.
          </p>
        </AdminModal>
      )}
    </>
  )
}
