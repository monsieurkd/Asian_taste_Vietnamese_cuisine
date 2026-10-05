import type { PointerEvent as ReactPointerEvent } from "react"
import type { KitchenItem, KitchenTicket } from "@/api/kitchenApi"
import { readPayment } from "@/lib/payment"
import { formatCurrency } from "@/lib/utils"
import { boardAction } from "@/lib/boardAction"
import { urgencyOf } from "@/lib/kitchenBoard"
import { formatShopTime, shopDayLabel, shopRelativeLabel } from "@/lib/shopTime"
import type { StatusKey } from "@/lib/orderStatus"

const TYPE_LABEL: Record<string, string> = {
  DineIn: "Dine in",
  Takeaway: "Takeaway",
  Delivery: "Delivery",
}

/**
 * One ticket on the board.
 *
 * Rebuilt to match `docs/DESIGN/mockups/admin-console/kitchen-board.html`. The card leads
 * with the three things a cook scans for — the order code, who it is for and the promised
 * time — then the flags that change what to do, the dishes as the cross-out, and the stage
 * action in the footer. The dish list is the ticket's own rows rather than `OrderItems`,
 * because the board needs the per-dish note button to sit on the row itself; every other
 * screen still uses `OrderItems`, so a dish cannot be tickable here and not there.
 */
export function BoardTicket({
  ticket,
  onAdvance,
  onTick,
  onHold,
  onResume,
  onNote,
  onPickup,
  onDragHandlePointerDown,
  dragging,
  saving,
  tickingItemId,
}: {
  ticket: KitchenTicket
  onAdvance: (next: StatusKey) => void
  onTick: (itemId: number, isCompleted: boolean) => void
  onHold: () => void
  onResume: () => void
  onNote: (item: KitchenItem) => void
  onPickup: () => void
  onDragHandlePointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void
  dragging: boolean
  saving: boolean
  tickingItemId: number | null
}) {
  const urgency = urgencyOf(ticket)
  const payment = readPayment(ticket.paymentStatus, ticket.paymentMethod)
  const action = boardAction(ticket.status)
  const items = ticket.items ?? []

  // The promised time, in the shop's clock. An immediate order reads "ASAP": its
  // `requestedTime` is when it was placed, which is not a promise the kitchen made, so a
  // relative label against it would read as a permanent "late".
  const wantedTime = ticket.isScheduled ? formatShopTime(ticket.requestedTime) : "ASAP"
  const wantedDay = ticket.isScheduled ? shopDayLabel(ticket.requestedTime) : ""
  const whoLabel = ticket.customerName || (ticket.orderType === "DineIn" ? "Dine in" : "Walk-in")
  const typeLabel = TYPE_LABEL[ticket.orderType] ?? "Takeaway"

  const itemCount = items.length
    ? items.reduce((sum, item) => sum + item.quantity, 0)
    : ticket.itemsDone.total

  const progress = ticket.itemsDone
  const allDone = progress.total > 0 && progress.done === progress.total

  const cls = [
    "ticket",
    urgency === "late" ? "late" : urgency === "warning" ? "warn" : "",
    ticket.isHeld ? "held" : "",
    dragging ? "is-source" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <article className={cls} data-ticket-id={ticket.id}>
      <div className="t-head">
        <button
          type="button"
          className="t-grip"
          aria-label={`Drag to move order ${ticket.orderNumber}`}
          onPointerDown={onDragHandlePointerDown}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6" />
            <circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" />
            <circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" />
            <circle cx="15" cy="18" r="1.6" />
          </svg>
        </button>
        <span className="t-code">{ticket.orderNumber}</span>
        <span className="t-type">{typeLabel}</span>
      </div>

      <div className="t-main">
        <span className="t-who">
          {whoLabel}
          {ticket.customerPhone && <span className="t-phone">{ticket.customerPhone}</span>}
        </span>
        <span className="t-total">{formatCurrency(ticket.total)}</span>
      </div>

      {/* The promised time — the one line the kitchen runs on, and the way to move it.
          Tapping opens the editor, which writes ONLY the time (see ordersApi.setPickupTime);
          it never touches the dishes, so changing a promise cannot lose a cook's ticks. */}
      <button
        type="button"
        className={`t-time ${urgency === "late" ? "is-late" : urgency === "warning" ? "is-warn" : ""}`}
        onClick={onPickup}
        aria-label={`Edit pickup time, ${ticket.isScheduled ? `${wantedDay} ${wantedTime}` : "ASAP"}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
        <span className="t-time-val">{wantedTime}</span>
        {ticket.isScheduled && wantedDay !== "Today" && <span className="t-time-day">{wantedDay}</span>}
        {ticket.isScheduled && <span className="t-time-rel">{shopRelativeLabel(ticket.requestedTime)}</span>}
        <svg
          className="t-time-edit"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 20h4L20 8l-4-4L4 16z" />
        </svg>
      </button>

      <div className="t-sub">
        <span>{ticket.ageMinutes} min on the line</span>
        <span className="dot">·</span>
        <span>{itemCount} items</span>
      </div>

      {/* The two things that change what the kitchen should do: a bag that cannot go out
          because the charge failed, and food parked for a reason worth reading out. */}
      {(payment.attention || ticket.isHeld) && (
        <div className="t-flags">
          {payment.attention && <span className="t-flag pay">{payment.label}</span>}
          {ticket.isHeld && <span className="t-flag hold">Held</span>}
        </div>
      )}

      {/* The allergy sits above everything it could be buried under: a cook picks what to
          start from this card, and an allergy under the third dish is one they have already
          started cooking without. */}
      {(ticket.allergyDeclaration || ticket.notes) && (
        <p className={`t-note ${ticket.allergyDeclaration ? "has-allergy" : ""}`}>
          <span className="t-note-label">Restaurant note:</span>
          <span>
            {ticket.allergyDeclaration && (
              <>
                <span className="allergy">{ticket.allergyDeclaration} allergy</span>
                {ticket.notes && <span className="dot"> · </span>}
              </>
            )}
            {ticket.notes}
          </span>
        </p>
      )}

      {ticket.isHeld && (
        <p className="boh-held" role="status">
          <strong>Held{ticket.heldBy ? ` by ${ticket.heldBy}` : ""}:</strong> {ticket.heldReason}
        </p>
      )}

      <div className="t-items">
        {items.map((item) => (
          <div key={item.id} className={`dish ${item.isCompleted ? "is-done" : ""}`}>
            <div className="dish-row">
              <button
                type="button"
                className="dish-tap"
                aria-pressed={item.isCompleted}
                disabled={tickingItemId === item.id}
                onClick={() => onTick(item.id, !item.isCompleted)}
              >
                <span className="dish-qty">{item.quantity}×</span>
                <span className="dish-name">{item.menuItemName}</span>
              </button>
              <button
                type="button"
                className={`dish-note ${item.kitchenNote ? "has-note" : ""}`}
                aria-label={`${item.kitchenNote ? "Edit" : "Add"} a kitchen note for ${item.menuItemName}`}
                onClick={() => onNote(item)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 6h10M4 12h7M4 18h5" />
                  <path d="M16.5 15.5 20 12a2.1 2.1 0 0 1 3 3l-3.5 3.5-3.5 1z" />
                </svg>
              </button>
            </div>
            {(item.modifiers || item.specialInstructions || item.kitchenNote) && (
              <p className="dish-detail">
                {item.modifiers}
                {item.modifiers && (item.specialInstructions || item.kitchenNote) && <span className="dot"> · </span>}
                {item.specialInstructions}
                {item.specialInstructions && item.kitchenNote && <span className="dot"> · </span>}
                {item.kitchenNote && (
                  <>
                    <span className="k">Kitchen:</span> {item.kitchenNote}
                    {item.noteBy && <span className="meta"> ({item.noteBy})</span>}
                  </>
                )}
              </p>
            )}
          </div>
        ))}
      </div>

      {allDone && <p className="t-alldone">Every dish done — ready to hand over.</p>}

      <div className="t-foot">
        {action ? (
          <button
            type="button"
            className="btn btn-sm btn-advance"
            disabled={saving}
            onClick={() => onAdvance(action.to)}
          >
            {saving ? "Saving…" : action.label}
          </button>
        ) : (
          <span className="meta" style={{ flex: 1 }}>
            No further step.
          </span>
        )}

        {ticket.isHeld ? (
          <button type="button" className="t-act" title="Put back on the line" onClick={onResume}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12l4.5 4.5L19 7" />
            </svg>
            Resume
          </button>
        ) : (
          <button type="button" className="t-act" title="Park this order" onClick={onHold}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="6.5" y="5" width="4" height="14" rx="1" />
              <rect x="13.5" y="5" width="4" height="14" rx="1" />
            </svg>
            Hold
          </button>
        )}
      </div>
    </article>
  )
}
