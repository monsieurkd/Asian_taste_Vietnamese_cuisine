import type { OrderStatus } from '@/types/menu';

/* ==========================================================================
   The order lifecycle, as the shop actually works it.

   Two decisions from the owner collapse the design set's six stages:

   1. **Confirmed and Preparing are one state.** Once the restaurant accepts an
      order it is being cooked — there is no separate moment where someone
      presses "start cooking", so a stage that only ever gets set by hand would
      be a button nobody presses and a tracker that stalls.
   2. **"Out for delivery" and "Completed" are gone.** v1 is pickup, so the
      journey ends at Ready: the customer collects, and there is no further state
      the kitchen records.

   So: Placed → Confirmed → Ready, plus Cancelled. The API still stores the
   finer values; `stageIndex` folds them in so an older order reads correctly.
   ========================================================================== */

export interface Stage {
  key: string;
  label: string;
  /** Every API value that belongs to this stage. */
  statuses: OrderStatus[];
  /** What this stage means, in the customer's words. */
  description: string;
}

export const STAGES: Stage[] = [
  {
    key: 'placed',
    label: 'Placed',
    statuses: ['Pending'],
    description: 'We have your order and your payment.',
  },
  {
    key: 'confirmed',
    label: 'Confirmed',
    statuses: ['Confirmed', 'Preparing'],
    description: 'The kitchen has accepted it and is cooking it now.',
  },
  {
    key: 'ready',
    label: 'Ready',
    statuses: ['Ready', 'Completed'],
    description: 'Ready to collect at 329 Henley Beach Rd.',
  },
];

/** The stage an order is in, or -1 when it was cancelled. */
export function stageIndex(status: OrderStatus | undefined): number {
  if (!status) return 0;
  if (status === 'Cancelled') return -1;
  const index = STAGES.findIndex((s) => s.statuses.includes(status));
  return index === -1 ? 0 : index;
}

export function isCancelled(status: OrderStatus | undefined): boolean {
  return status === 'Cancelled';
}
