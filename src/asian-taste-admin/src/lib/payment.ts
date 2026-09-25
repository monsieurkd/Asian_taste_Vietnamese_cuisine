import type { PaymentStatus } from '@/types';

/**
 * The money, as the shop needs to read it — and where the customer's ticket ends.
 *
 * There are three genuinely different questions on the counter, and they used to be
 * answered by one wrong guess: the ticket said "Paid online" for every order whose
 * payment METHOD was Card. A declined card, a Stripe outage and a charge that never
 * happened all read as a completed sale, and the kitchen cooked on that basis.
 *
 * So the label comes from `payment_status`, which is what actually happened, and the
 * caller is told whether the order still needs money:
 *
 *   paid    — captured. Nothing to do.
 *   unpaid  — a card order that was declined or never captured. Take payment at the
 *             counter before the bag goes out.
 *   counter — a cash order. Nothing to collect now, and nothing to chase.
 *   voided  — cancelled or refunded. Do not take money for it.
 *
 * `attention` is the flag the ticket and the list use to make an unpaid order
 * impossible to miss while the customer is standing there.
 */
export interface PaymentReading {
  label: string;
  /** Extra wording for the detail screen; empty when the label says it all. */
  detail: string;
  attention: boolean;
}

/** An order with no payment recorded at all — treated as unpaid, never as paid. */
const UNKNOWN: PaymentReading = {
  label: 'Payment not taken',
  detail: 'No charge was captured. Take payment at the counter.',
  attention: true,
};

export function readPayment(
  paymentStatus: PaymentStatus | string | null | undefined,
  paymentMethod?: string | null,
  failureReason?: string | null,
): PaymentReading {
  const status = (paymentStatus ?? '').toLowerCase();
  const method = (paymentMethod ?? '').toLowerCase();

  switch (status) {
    case 'succeeded':
      return { label: 'Paid online', detail: '', attention: false };
    case 'refunded':
      return {
        label: 'Refunded',
        detail: 'This order was refunded in full.',
        attention: false,
      };
    case 'partiallyrefunded':
      return {
        label: 'Partly refunded',
        detail: 'Part of this order was refunded.',
        attention: false,
      };
    case 'failed':
      return {
        label: 'Payment declined',
        detail: failureReason
          ? `${failureReason} Take payment at the counter.`
          : 'The charge did not go through. Take payment at the counter.',
        attention: true,
      };
    case 'processing':
      return {
        label: 'Payment processing',
        detail: 'The bank has not finished with this charge yet.',
        attention: true,
      };
    case 'requiresaction':
      return {
        label: 'Payment unfinished',
        detail: 'The customer did not finish the card step. Take payment at the counter.',
        attention: true,
      };
    case 'canceled':
      return {
        label: 'Payment cancelled',
        detail: 'The charge was cancelled. Take payment at the counter.',
        attention: true,
      };
    default:
      break;
  }

  // Nothing recorded. A cash order is the expected reason; anything else is a card
  // order we have no evidence was ever charged, so it is flagged.
  if (method === 'cash') {
    return { label: 'Pay at counter', detail: 'Cash order — collect at handover.', attention: false };
  }

  return UNKNOWN;
}
