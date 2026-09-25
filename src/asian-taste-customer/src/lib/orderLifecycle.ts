import {
  STATUS_META,
  STATUS_ORDER,
  apiStatusValue,
  statusKey,
  type StatusKey,
} from '@shared/lib/orderStatus';

/**
 * The customer's order tracker, expressed in the shared vocabulary.
 *
 * This file used to hold a second, private three-stage list — Placed, Confirmed,
 * Ready — with the shop's stages described in its own words. The console had four
 * stages, the tracker three, and the last one meant different things on each side:
 * `Completed` read as "Ready" here and "Collected" there, so a customer looking at
 * a collected order saw a bag supposedly still on the counter.
 *
 * The list is now the shared one, plus the one genuine difference between the two
 * audiences: the tracker can be cancelled, which is not a stage an order moves
 * *through*. Everything the two sides share — the keys, the words, which API value
 * each stage is stored as — comes from `@shared/lib/orderStatus`, so they cannot
 * drift apart again.
 */

export interface Stage {
  key: string;
  label: string;
  /** What this stage means, in the customer's words. */
  description: string;
}

/** What each shared stage is called on the tracking screen, and what it means. */
const CUSTOMER_DESCRIPTION: Record<StatusKey, string> = {
  placed: 'We have your order and your payment.',
  confirmed: 'The kitchen has accepted it and is cooking it now.',
  ready: 'Ready to collect at 329 Henley Beach Rd.',
  collected: 'Handed over at the counter — enjoy it.',
  cancelled: 'This order was cancelled.',
};

/**
 * The visible stages, in order.
 *
 * Built from the shared `STATUS_ORDER` rather than typed out again: a stage added
 * to the shop's journey appears here, and a stage removed from it disappears, with
 * no second list to update and forget.
 */
export const STAGES: Stage[] = STATUS_ORDER.map((key) => ({
  key,
  label: STATUS_META[key].label,
  description: CUSTOMER_DESCRIPTION[key],
}));

/** The stages a tracker distinguishes, including cancellation. */
export type CustomerStageKey = StatusKey;

/** The stage an order is in, or -1 when it was cancelled. */
export function stageIndex(status: string | null | undefined): number {
  if (isCancelled(status)) return -1;
  const index = STAGES.findIndex((stage) => stage.key === statusKey(status));
  return index === -1 ? 0 : index;
}

export function isCancelled(status: string | null | undefined): boolean {
  return statusKey(status) === 'cancelled';
}

/** The API's own value for a stage — re-exported so a screen never hardcodes one. */
export { apiStatusValue };
