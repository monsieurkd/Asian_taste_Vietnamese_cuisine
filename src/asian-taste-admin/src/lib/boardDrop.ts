import type { TransitionCheck } from "@shared/lib/orderTransitions"
import { STATUS_ORDER, isClosed, statusKey } from "./orderStatus"

/**
 * What a DRAG on the board is allowed to do, which is not what a button is allowed to do.
 *
 * The board's stage button (`boardAction`) walks the happy path one step forward, and the
 * shared `canTransition` guard refuses everything else — including moving an order BACK a
 * stage, which the button has no reason to offer. A drag is the opposite control: it is the
 * deliberate "this ticket is actually at a different stage" gesture, and the owner asked for
 * exactly the moves the button cannot express.
 *
 * The rule, as ratified:
 *
 *   - **Forwards, one stage at a time.** `placed → collected` would mark food handed over
 *     that was never cooked, and the board's numbers are the owner's record of the day. The
 *     same skip `canTransition` refuses is refused here, for the same reason.
 *   - **Backwards, however far.** Cooking set by mistake before the food was started, a
 *     ticket marked ready too early, an accept the front wants to undo — all real, all
 *     backwards, and all safe because the dishes and ticks are untouched. A drag can step
 *     back more than one column for the same reason it can step back one.
 *   - **Never off a closed order.** A collected or cancelled ticket has left the board; it
 *     has no column to be dragged from, and this guard is what keeps a stale WebSocket frame
 *     from putting one back.
 *
 * This is deliberately a separate function rather than an option on `canTransition`: the
 * shared guard drives the order-detail screen, where the button wording is "advance", and
 * loosening it there would let every screen drag a finished order backwards.
 */
export function dropCheck(from: string | null | undefined, to: string | null | undefined): TransitionCheck {
  const fromKey = statusKey(from)
  const toKey = statusKey(to)

  // The same column is a reorder, not a stage change; the caller decides how to order it.
  if (toKey === fromKey) return { allowed: true, reason: "" }

  if (isClosed(fromKey)) {
    return { allowed: false, reason: "This order is finished and has left the board." }
  }
  if (isClosed(toKey)) {
    return {
      allowed: false,
      reason: "Collected and cancelled are not places an order can be dragged to.",
    }
  }

  const fromIndex = STATUS_ORDER.indexOf(fromKey)
  const toIndex = STATUS_ORDER.indexOf(toKey)

  // Forward more than one stage is the skip the button guard also refuses. Backwards has no
  // such limit: `toIndex < fromIndex` falls straight through to allowed.
  if (toIndex > fromIndex + 1) {
    return { allowed: false, reason: "Move the order one stage at a time, so the board stays accurate." }
  }

  return { allowed: true, reason: "" }
}
