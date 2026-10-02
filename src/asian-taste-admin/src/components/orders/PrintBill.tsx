import type { OrderDetail } from "@/types"
import { readPayment } from "@/lib/payment"
import { formatCurrency, formatDate } from "@/lib/utils"

/**
 * The customer's bill, rendered ONLY for printing.
 *
 * This is a separate component rather than a print stylesheet over the ticket
 * screen, because the two documents disagree about what belongs on them:
 *
 *   * The screen shows a status scale, an edit button, a refund button and a
 *     kitchen note. None of that is the customer's business, and a receipt roll
 *     is the wrong place to discover a refund control was in the screenshot.
 *   * The bill shows the restaurant's name and phone, a GST statement and where
 *     to collect. None of that is on the screen, because staff already know it.
 *
 * It is hidden on screen and shown in `@layer print` (see index.css). Rendered
 * always, not conditionally, so there is no state to get wrong between deciding
 * to print and the printer starting.
 *
 * Prices come from the server (`order.subtotal`, `order.total`), never from the
 * items array summed on the client. The server prices every order, and a bill
 * that disagreed with the till by a cent would be a reconciliation problem
 * nobody could trace.
 */
export function PrintBill({ order }: { order: OrderDetail }) {
  // The payment label is taken from the same helper the console uses, so a
  // declined card cannot print as "Paid" on a receipt the customer keeps. That
  // bug was live once (2026-09-25) and is pinned by tests; a second description
  // of money here would be a second place for it to come back.
  const payment = readPayment(order.paymentStatus, order.paymentMethod, order.paymentFailureReason)

  // An ASAP order stores the moment it was placed as its requested time, so the
  // requested time only means something when it is meaningfully ahead of arrival.
  const requestedAt = new Date(order.requestedTime).getTime()
  const placedAt = new Date(order.createdAt).getTime()
  const isScheduled = Number.isFinite(requestedAt) && requestedAt - placedAt > 5 * 60_000

  return (
    <div className="bill" aria-hidden="true">
      <div className="bill-head">
        <div className="bill-name">Asian Taste</div>
        <div className="bill-sub">Vietnamese Cuisine</div>
        <div className="bill-sub">Brooklyn Park, SA</div>
      </div>

      <div className="bill-meta">
        <div className="bill-meta-row">
          <span>Order</span>
          <strong>{order.orderNumber}</strong>
        </div>
        <div className="bill-meta-row">
          <span>Name</span>
          <span>{order.customerName}</span>
        </div>
        <div className="bill-meta-row">
          <span>{order.orderType === "DineIn" ? "Dine in" : "Pickup"}</span>
          <span>
            {isScheduled ? formatDate(order.requestedTime, "time") : "As soon as possible"}
          </span>
        </div>
        <div className="bill-meta-row">
          <span>Placed</span>
          <span>{formatDate(order.createdAt, "long")}</span>
        </div>
      </div>

      <div className="bill-lines">
        {order.items.map((item) => (
          <div key={item.id}>
            <div className="bill-line">
              <span className="bill-qty">{item.quantity}×</span>
              <span className="bill-dish">{item.menuItemName}</span>
              <span className="bill-amt">{formatCurrency(item.totalPrice)}</span>
            </div>
            {item.modifiers.length > 0 && (
              <div className="bill-sub">{item.modifiers.map((m) => m.modifierName).join(" · ")}</div>
            )}
            {item.specialInstructions && <div className="bill-sub">{item.specialInstructions}</div>}
          </div>
        ))}
      </div>

      {/* Prices are GST-inclusive, so the tax is not added at the bottom. Saying
          so explicitly is the Australian convention and stops a customer reading
          the total as pre-tax. */}
      <div className="bill-totals">
        <div className="bill-total-row">
          <span>Subtotal</span>
          <span>{formatCurrency(order.subtotal)}</span>
        </div>
        <div className="bill-total-row">
          <span>GST</span>
          <span>included</span>
        </div>
        <div className="bill-total-row bill-grand">
          <span>Total</span>
          <span>{formatCurrency(order.total)}</span>
        </div>
        <div className="bill-total-row">
          <span>Payment</span>
          <span>{payment.label}</span>
        </div>
      </div>

      {/* Above the footer, in a box, because a receipt is read in a hurry. The
          kitchen sees this on the board too — but the customer is the one who
          said it, and a bill that omits what they declared reads as unheard. */}
      {order.allergyDeclaration && (
        <div className="bill-allergy">
          <div className="bill-allergy-head">⚠ Allergy</div>
          <div>{order.allergyDeclaration}</div>
        </div>
      )}

      {order.notes && <div className="bill-sub">Note: {order.notes}</div>}

      <div className="bill-foot">
        <div>Please keep this ticket</div>
        <div className="bill-number">{order.orderNumber}</div>
        <div>Thank you</div>
      </div>
    </div>
  )
}
