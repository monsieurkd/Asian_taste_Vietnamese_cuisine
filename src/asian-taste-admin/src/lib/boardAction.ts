import { canTransition } from '@shared/lib/orderTransitions';
import { nextStatus, statusKey, type StatusKey } from '@shared/lib/orderStatus';

/**
 * What the kitchen board offers a ticket, as opposed to what the ticket says.
 *
 * The board is the one screen where a wrong action costs food: a press that skips a
 * stage marks food as handed over when it is still on the wok, and a press on a
 * cancelled order reopens a ticket the owner deliberately closed. Both are already
 * refused by `canTransition` — this module is the board's single call site for that
 * rule, extracted so the rule is testable without rendering a browser.
 *
 * It is deliberately NOT a new state machine. `nextStatus` answers "what comes next
 * on the happy path" and `canTransition` answers "may this order move there at all";
 * the two disagree in exactly the cases that matter (a cancelled or collected order
 * has a `nextStatus` and no legal move), and the disagreement is the bug this exists
 * to prevent.
 */
export interface BoardAction {
  /** The stage the press moves to — already proven legal. */
  to: StatusKey;
  /** The button's words, in the kitchen's language rather than the API's. */
  label: string;
}

/** The kitchen's verb for the action taken FROM a stage. */
const VERB: Partial<Record<StatusKey, string>> = {
  placed: 'Accept',
  confirmed: 'Mark ready',
  ready: 'Mark collected',
};

/**
 * The single action offered on a ticket, or null when there is nothing to do.
 *
 * Null is a real answer and the board renders it as "No further step." rather than as
 * a disabled button: a greyed-out control invites a tap and explains nothing, whereas
 * a sentence says the ticket is done.
 */
export function boardAction(status: string | null | undefined): BoardAction | null {
  const from = statusKey(status);
  const next = nextStatus(status);
  if (!next) return null;

  // The verb belongs to where the order IS, not where it is going: a New ticket is
  // accepted, a Cooking one is marked ready. Keying this by the target reads
  // plausibly and is wrong — "Accept" would appear on an order already cooking.
  const label = VERB[from];
  if (!label) return null;

  if (!canTransition(status, next).allowed) return null;

  return { to: next, label };
}

/** True when the board should show this ticket as needing nothing further. */
export function isBoardComplete(status: string | null | undefined): boolean {
  return boardAction(status) === null && statusKey(status) !== 'cancelled';
}
