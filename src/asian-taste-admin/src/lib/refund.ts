/**
 * Whether an order can be refunded from the console, and what the confirmation says.
 *
 * This rule exists because the refund BUTTON is the dangerous part, not the endpoint:
 * the endpoint has worked and been tested for a while, and offering it on the wrong
 * order is what costs money. Two ways to get it wrong, both silent:
 *
 *  - **Refunding something that was never captured.** A declined card, an unfinished
 *    3-D Secure step, a cash order — there is no charge to reverse. Stripe would
 *    refuse, so the failure is loud; offering the button at all still teaches staff
 *    that the app does not know what it is doing.
 *  - **Refunding an order whose payment id we never stored.** The refund is issued
 *    AGAINST that id, so without it the call cannot find the order and the order stays
 *    reading as paid while the money sits at the gateway. That one is quiet.
 *
 * So eligibility requires evidence of a captured charge AND the identifier needed to
 * reverse it. Anything less hides the control rather than offering one that cannot work.
 */

/** Payment statuses where a charge exists that a refund could reverse. */
const REFUNDABLE = new Set(['succeeded', 'partiallyrefunded']);

export interface RefundEligibility {
  canRefund: boolean;
  /** Already fully refunded — show the state, not a button. */
  alreadyRefunded: boolean;
  /** Why not, when the reason is worth showing. Empty when refundable. */
  reason: string;
}

export function refundEligibility(
  paymentStatus: string | null | undefined,
  paymentMethod: string | null | undefined,
  paymentIntentId: string | null | undefined,
): RefundEligibility {
  const status = (paymentStatus ?? '').toLowerCase();
  const method = (paymentMethod ?? '').toLowerCase();

  if (status === 'refunded') {
    return { canRefund: false, alreadyRefunded: true, reason: '' };
  }

  if (!REFUNDABLE.has(status)) {
    return {
      canRefund: false,
      alreadyRefunded: false,
      reason:
        method === 'cash'
          ? 'Cash orders are refunded at the counter, not through the card gateway.'
          : 'There is no captured card payment on this order to refund.',
    };
  }

  if (!paymentIntentId) {
    // The quiet one. Without the id the endpoint cannot find the order, so the money
    // would move at Stripe while the order kept reading as paid.
    return {
      canRefund: false,
      alreadyRefunded: false,
      reason: 'This order has no payment reference recorded, so a refund cannot be matched to it. Refund it from Stripe.',
    };
  }

  return { canRefund: true, alreadyRefunded: false, reason: '' };
}
