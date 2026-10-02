import { Pill } from "@/components/ui/Primitives"
import {
  canTickItems,
  lineDetail,
  progressFraction,
  progressLabel,
  progressOf,
} from "@/lib/itemProgress"
import type { Order } from "@/types"

/**
 * The dish list and its tick control — one implementation, three screens.
 *
 * This was written once inside the kitchen board's ticket. It then had to appear in the
 * Orders list and on the single-ticket page too, and the reason it lives here rather than
 * being copied is the lesson this repo keeps relearning: two renderers of the same thing
 * drift, and the drift here would be a dish that can be ticked on one screen and not on
 * another — which reads to staff as the app being broken, not as a rule.
 *
 * The three screens differ in what they need AROUND the list (a compact ticket, a table
 * row, a full panel), so this renders only the part they share: the progress line, the
 * dishes, and the two statements worth making out loud (nothing recorded, everything done).
 */

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

export interface OrderItemsProps {
  order: Order
  /** Tick or untick one dish. Omit to render the list read-only. */
  onTick?: (itemId: number, isCompleted: boolean) => void
  /** The line currently in flight, so only that one reads as busy. */
  tickingItemId?: number | null
  /**
   * Show the progress bar and the "N to cook" label.
   *
   * On for the board, where a glance has to answer "how far through is this ticket". Off
   * for a table row, where the same information is in the column count and the bar would
   * be a second, noisier way of saying it.
   */
  showProgress?: boolean
}

export function OrderItems({ order, onTick, tickingItemId = null, showProgress = true }: OrderItemsProps) {
  const lines = order.items ?? []
  const progress = progressOf(order)
  const tickable = canTickItems(order) && !!onTick
  const label = progressLabel(order)
  const allDone = progress.total > 0 && progress.done === progress.total

  // Nothing recorded on this order.
  //
  // Said explicitly rather than rendering an empty list, because an order with no items
  // is a real thing in this database — orders were seeded straight into `orders` by older
  // scripts, without their lines — and a ticket that silently shows nothing is
  // indistinguishable from a broken screen. That ambiguity is exactly what made this look
  // like a bug when it was not.
  if (lines.length === 0) {
    return (
      <p className="items-empty" role="status">
        {progress.total > 0
          ? `${progress.total} ${progress.total === 1 ? "item is" : "items are"} recorded on this order, but the list could not be loaded.`
          : "This order has no items recorded."}
      </p>
    )
  }

  return (
    <div className="order-items">
      {showProgress && (
        <div className="ticket-progress">
          <span className="ticket-progress-label">{label}</span>
          <span
            className="ticket-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label={`${progress.done} of ${progress.total} dishes done`}
          >
            <span style={{ width: `${progressFraction(order) * 100}%` }} />
          </span>
        </div>
      )}

      <ul className="ticket-line-list">
        {lines.map((line) => {
          const detail = lineDetail(line)
          const inFlight = tickingItemId === line.id

          // Read-only when there is no handler: the detail page passes one, the summary
          // rows do not. A disabled button that looks pressable is worse than plain text.
          if (!onTick) {
            return (
              <li key={line.id} data-done={line.isCompleted} className="ticket-line-static">
                <span className={`ticket-line-check ${line.isCompleted ? "is-done" : ""}`} aria-hidden="true">
                  {line.isCompleted && <CheckMark />}
                </span>
                <span className="ticket-line-body">
                  <span className="ticket-line-name">
                    <strong>{line.quantity}×</strong> {line.menuItemName}
                  </span>
                  {detail && <span className="ticket-line-detail">{detail}</span>}
                </span>
                <span className="sr-only">{line.isCompleted ? "Done" : "Not done yet"}</span>
              </li>
            )
          }

          return (
            <li key={line.id} data-done={line.isCompleted}>
              <button
                type="button"
                className="ticket-line"
                aria-pressed={line.isCompleted}
                disabled={!tickable || inFlight}
                onClick={() => onTick(line.id, !line.isCompleted)}
              >
                {/* A real checkbox shape, because that is the gesture: this is the control
                    pressed tens of times a shift, and it should read as a tick rather
                    than as a button. */}
                <span className="ticket-line-check" aria-hidden="true">
                  <CheckMark />
                </span>
                <span className="ticket-line-body">
                  <span className="ticket-line-name">
                    <strong>{line.quantity}×</strong> {line.menuItemName}
                  </span>
                  {detail && <span className="ticket-line-detail">{detail}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* The one thing worth saying out loud once the last dish is ticked. The order moves
          itself (the server decides that, not this screen), so this reports what happened
          rather than asking for another press. */}
      {allDone && tickable && (
        <p className="ticket-alldone" role="status">
          Every dish is done — this order is ready.
        </p>
      )}

      {allDone && !tickable && (
        <p className="ticket-alldone" role="status">
          Every dish is done.
        </p>
      )}
    </div>
  )
}

/** The compact "2 of 4" badge, for a table row that cannot afford the full list. */
export function OrderProgressPill({ order }: { order: Order }) {
  const label = progressLabel(order)
  if (!label) return <Pill neutral>No items</Pill>
  return <Pill neutral>{label}</Pill>
}
