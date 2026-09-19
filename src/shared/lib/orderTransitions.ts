/**
 * Which status moves the console is allowed to make, and why the illegal ones
 * matter.
 *
 * `nextStatus` answers "what is the next stage?" — a question about the happy
 * path. This answers the different question the buttons actually need: **may
 * this order move there at all?**
 *
 * The two are not the same, and the gap between them is where the console can
 * do real damage:
 *
 *   - **Advancing a cancelled order.** A refunded order is finished. Pressing
 *     "Ready" on it tells the kitchen to cook food nobody is paying for, and
 *     re-opens a ticket the owner closed deliberately.
 *   - **Un-cancelling an order.** Moving a cancelled order back to a live stage
 *     makes it reappear on the board and in "live orders" — and, because the
 *     customer already has a cancellation, the two views disagree.
 *   - **Skipping a stage.** `placed → collected` marks food as handed over that
 *     was never marked cooked. The board's numbers are the owner's record of the
 *     day, so a skip corrupts the only accounting this app does.
 *
 * `nextStatus` deliberately stays permissive: it drives the "advance" button,
 * and a guard there would just disable buttons without explaining why. The rule
 * lives here so the console can say *why* a move is refused.
 */

import {
  STATUS_ORDER,
  isClosed,
  statusKey,
  type StatusKey,
} from "./orderStatus";

export interface TransitionCheck {
  allowed: boolean;
  /** Shown to staff when `allowed` is false. Empty when allowed. */
  reason: string;
}

const ALLOWED: TransitionCheck = { allowed: true, reason: "" };

/**
 * Cancelling is always legal while an order is still live.
 *
 * Staff cancel for reasons the app cannot see — the customer rang, the kitchen
 * ran out, the card failed. Blocking that would be worse than allowing it.
 */
function canCancel(from: StatusKey): TransitionCheck {
  if (isClosed(from)) {
    return {
      allowed: false,
      reason: "This order is already finished, so it cannot be cancelled again.",
    };
  }
  return ALLOWED;
}

/** Moving forward along the pickup journey, one stage at a time. */
function canAdvance(to: StatusKey, from: StatusKey): TransitionCheck {
  // `collected` is the last stage in STATUS_ORDER, so the index checks below
  // already refuse every forward move out of it — this branch is defence in
  // depth, not the thing doing the work. It is kept deliberately: if a stage is
  // ever added after `collected`, this guard is what stops a finished order
  // being walked forward into it. A mutation check confirmed the index maths
  // alone blocks `collected -> *`, so this is a genuinely equivalent-mutant line
  // rather than an untested one; the tests pin the behaviour, not this line.
  if (isClosed(from)) {
    return {
      allowed: false,
      reason:
        from === "cancelled"
          ? "This order was cancelled. It cannot be moved forward again."
          : "This order has already been collected, so it is done.",
    };
  }

  const fromIndex = STATUS_ORDER.indexOf(from);
  const toIndex = STATUS_ORDER.indexOf(to);

  if (toIndex === -1) {
    return { allowed: false, reason: `${to} is not a stage an order can move to.` };
  }
  if (toIndex < fromIndex) {
    return {
      allowed: false,
      reason: "An order cannot move backwards. Cancel it instead if it is wrong.",
    };
  }
  if (toIndex === fromIndex) {
    return { allowed: false, reason: "This order is already at that stage." };
  }
  if (toIndex > fromIndex + 1) {
    return {
      allowed: false,
      reason: "Move the order one stage at a time, so the board stays accurate.",
    };
  }
  return ALLOWED;
}

/**
 * Whether the console may move an order from one status to another.
 *
 * Unknown or missing values are normalised first, so a WebSocket frame carrying
 * an older vocabulary is judged by the same rules as everything else.
 */
export function canTransition(
  from: string | null | undefined,
  to: string | null | undefined,
): TransitionCheck {
  if (to == null || to === "") {
    return { allowed: false, reason: "Choose a status to move to." };
  }

  const fromKey = statusKey(from);
  const toKey = statusKey(to);

  if (toKey === fromKey) {
    return { allowed: false, reason: "This order is already at that stage." };
  }

  if (toKey === "cancelled") {
    return canCancel(fromKey);
  }
  if (fromKey === "cancelled") {
    return {
      allowed: false,
      reason: "This order was cancelled. It cannot be moved forward again.",
    };
  }

  return canAdvance(toKey, fromKey);
}

/** The statuses staff can actually choose, for this order. */
export function allowedTransitions(from: string | null | undefined): StatusKey[] {
  return (["placed", "confirmed", "ready", "collected", "cancelled"] as StatusKey[]).filter(
    (to) => canTransition(from, to).allowed,
  );
}
