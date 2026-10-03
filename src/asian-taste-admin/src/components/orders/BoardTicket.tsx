import { Link } from "react-router-dom"
import type { KitchenItem, KitchenTicket } from "@/api/kitchenApi"
import { Button } from "@/components/ui/Primitives"
import { StatusPill } from "@/components/ui/StatusPill"
import { OrderItems } from "@/components/orders/OrderItems"
import { readPayment } from "@/lib/payment"
import { formatCurrency } from "@/lib/utils"
import { boardAction } from "@/lib/boardAction"
import { urgencyOf, wantedLabel } from "@/lib/kitchenBoard"
import type { StatusKey } from "@/lib/orderStatus"
import type { Order } from "@/types"

/**
 * One ticket on the board.
 *
 * This is the ONE ticket renderer, and the reason it exists is the merge that produced it:
 * back of house and the dashboard were two screens showing the same orders with different
 * halves of the job. The dashboard had the stage columns and the tap-to-cross-out dishes;
 * back of house had Hold, History and the per-dish notes. A cook who needed both had two
 * tabs open on one order, and whichever screen they were on, something was missing.
 *
 * What came from each, and why:
 *
 *   * **The dish list is the cross-out** (`OrderItems` with `onTick`). This is the control
 *     that matches the industry and the kitchen's own language — tap the dish, it strikes
 *     through — and it is the same component the Orders table and the ticket page use, so a
 *     dish cannot be tickable here and not there.
 *   * **The stage advance is `boardAction`**, unchanged. It is guarded by `canTransition`
 *     rather than by the button's own wording, so a WebSocket frame carrying an older status
 *     cannot talk the board into an illegal move.
 *   * **Hold and History stayed**, because "waiting on the spring rolls" and "who ticked
 *     this" are questions the kitchen asks and the dashboard could never answer.
 *
 * The ticket is rendered inside a stage column, so it no longer carries its own stage
 * control for the STATUS — the column says where it is, and the action button says what
 * happens next.
 */
export function BoardTicket({
  ticket,
  onAdvance,
  onTick,
  onHold,
  onResume,
  onNote,
  onHistory,
  saving,
  tickingItemId,
}: {
  ticket: KitchenTicket
  onAdvance: (next: StatusKey) => void
  onTick: (itemId: number, isCompleted: boolean) => void
  onHold: () => void
  onResume: () => void
  onNote: (item: KitchenItem) => void
  onHistory: () => void
  saving: boolean
  tickingItemId: number | null
}) {
  const urgency = urgencyOf(ticket)
  const payment = readPayment(ticket.paymentStatus, ticket.paymentMethod)
  const action = boardAction(ticket.status)

  // `OrderItems` reads an `Order`, and the board's ticket is shaped as one. The ticket has
  // everything that component needs — the id, the lines and the done counts — so this is a
  // widening rather than a lie: only the fields it reads are worth trusting here.
  const asOrder = ticket as unknown as Order

  return (
    <article
      className={`ticket board-ticket ${urgency === "late" ? "urgent" : ""} ${urgency === "warning" ? "warn" : ""}`}
      data-held={ticket.isHeld}
      data-ticket-id={ticket.id}
    >
      <div className="ticket-top">
        <span className="ticket-id">{ticket.orderNumber}</span>
        <StatusPill status={ticket.status} />
      </div>

      {/* The two things that change what the kitchen should do: a bag that cannot go out
          because the charge failed, and food wanted later rather than now. */}
      {(payment.attention || ticket.isScheduled) && (
        <div className="ticket-flags">
          {payment.attention && <span className="ticket-flag flag-warn">{payment.label}</span>}
          {ticket.isScheduled && (
            <span className="ticket-flag flag-time">For {wantedLabel(ticket)}</span>
          )}
        </div>
      )}

      {ticket.isHeld && (
        <p className="boh-held" role="status">
          <strong>Held{ticket.heldBy ? ` by ${ticket.heldBy}` : ""}:</strong> {ticket.heldReason}
        </p>
      )}

      {/* The allergy sits above everything it could be buried under: a cook picks what to
          start from this card, and an allergy under the third dish is one they have already
          started cooking without. */}
      {ticket.allergyDeclaration && (
        <p className="ticket-allergy" role="alert">
          <strong>Allergy:</strong> {ticket.allergyDeclaration}
        </p>
      )}

      <p className="ticket-who">
        <strong>{ticket.customerName}</strong>
        <span className="meta">
          {ticket.customerPhone || (ticket.orderType === "DineIn" ? "Dine in" : "Pickup")}
        </span>
      </p>

      <p className="ticket-meta">
        {ticket.ageMinutes} min ago · wanted {wantedLabel(ticket)} ·{" "}
        <strong>{formatCurrency(ticket.total)}</strong>
      </p>

      {ticket.notes && (
        <p className="ticket-meta" style={{ color: "var(--color-accent)" }}>
          {ticket.notes}
        </p>
      )}

      <div className="ticket-actions">
        {action ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 38, padding: "8px 14px", fontSize: 13 }}
            disabled={saving}
            onClick={() => onAdvance(action.to)}
          >
            {saving ? "Saving…" : action.label}
          </button>
        ) : (
          <span className="meta">No further step.</span>
        )}
        <Link
          className="btn btn-secondary"
          to={`/orders/${ticket.id}`}
          style={{ minHeight: 38, padding: "8px 14px", fontSize: 13 }}
        >
          Open
        </Link>
      </div>

      {/* The dishes, as the cross-out. `onTick` is what makes it interactive. */}
      <div className="ticket-lines">
        <OrderItems order={asOrder} onTick={onTick} tickingItemId={tickingItemId} />
      </div>

      {/* ── The kitchen's own per-dish notes ────────────────────────────────────
          One line per dish rather than a button inside each cross-out row: the row is the
          control a cook aims at tens of times a shift, and a second target inside it would
          halve it. Every dish gets a line here so the FIRST note on a dish has somewhere
          to come from — showing only dishes that already have one is how a feature becomes
          unreachable. */}
      {ticket.items && ticket.items.length > 0 && (
        <ul className="board-dish-notes">
          {ticket.items.map((item) => (
            <li key={item.id}>
              <button type="button" className="btn-link" onClick={() => onNote(item)}>
                <span className="board-dish-note-what">{item.menuItemName}</span>
                {item.kitchenNote ? (
                  <>
                    {" — "}
                    <strong>{item.kitchenNote}</strong>
                    {item.noteBy && <span className="meta"> ({item.noteBy})</span>}
                  </>
                ) : (
                  <span className="meta"> — add a note</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* The ticket's history, and taking it off the line. Both came from back of house and
          both are the reason the two screens could not simply be one of each. */}
      <footer className="boh-foot">
        <button type="button" className="btn-link" onClick={() => onHistory()}>
          History
        </button>
        {ticket.isHeld ? (
          <Button variant="ghost" onClick={onResume}>
            Back on the line
          </Button>
        ) : (
          <Button variant="ghost" onClick={onHold}>
            Hold
          </Button>
        )}
      </footer>
    </article>
  )
}
