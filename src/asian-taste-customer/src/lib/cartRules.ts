/* ==========================================================================
   Cart validation — the last thing between a customer and a payment.

   Everything here runs *before* a payment intent is created. The reason is
   economic rather than tidy: once Stripe has a charge, a rejected cart becomes a
   refund, and a refund is a fee plus a support conversation. A cart that cannot
   be fulfilled must be refused while it is still free to refuse it.

   The rules come from how the shop actually trades (pickup only, GST-inclusive
   prices, one kitchen):
   ========================================================================== */

import { OrderType } from '../types/menu';
import type { OrderType as OrderTypeValue } from '../types/menu';

export interface CartLine {
  menuItemId: string;
  name: string;
  quantity: number;
  /** Cents, GST-inclusive. */
  unitPrice: number;
  available?: boolean;
}

export interface Cart {
  lines: readonly CartLine[];
  orderType: OrderTypeValue;
}

export interface CartProblem {
  code:
    | 'empty'
    | 'quantity'
    | 'unavailable'
    | 'line_limit'
    | 'order_type'
    | 'pickup_only';
  message: string;
  /** The offending menu item, when the problem belongs to one line. */
  menuItemId?: string;
}

/** One kitchen, one pickup window: a cart this large is a catering order. */
export const MAX_QUANTITY_PER_LINE = 20;
export const MAX_DISTINCT_LINES = 30;

/**
 * Every problem with this cart, not just the first.
 *
 * Returning all of them matters: the customer fixes the cart once instead of
 * discovering the next problem after each attempt.
 */
export function validateCart(cart: Cart): CartProblem[] {
  const problems: CartProblem[] = [];

  if (!cart.lines || cart.lines.length === 0) {
    problems.push({ code: 'empty', message: 'Your cart is empty.' });
    return problems;
  }

  if (cart.orderType !== OrderType.Pickup) {
    // v1 is pickup only. `Delivery` still exists in the type because the API
    // stores it, but this app cannot fulfil it — and letting a Delivery cart
    // reach payment would take money for food nobody is going to deliver.
    problems.push({
      code: 'pickup_only',
      message: 'We are pickup only right now. Please choose pickup to continue.',
    });
  }

  if (cart.lines.length > MAX_DISTINCT_LINES) {
    problems.push({
      code: 'line_limit',
      message: `A single order can hold ${MAX_DISTINCT_LINES} different dishes. Please split this into two orders.`,
    });
  }

  for (const line of cart.lines) {
    if (line.available === false) {
      problems.push({
        code: 'unavailable',
        menuItemId: line.menuItemId,
        message: `${line.name} has sold out. Please remove it to continue.`,
      });
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      problems.push({
        code: 'quantity',
        menuItemId: line.menuItemId,
        message: `${line.name} needs a whole number of at least 1.`,
      });
    } else if (line.quantity > MAX_QUANTITY_PER_LINE) {
      problems.push({
        code: 'quantity',
        menuItemId: line.menuItemId,
        message: `${line.name} is limited to ${MAX_QUANTITY_PER_LINE} per order.`,
      });
    }
  }

  return problems;
}

/** Can this cart be paid for? */
export function isPayable(cart: Cart): boolean {
  return validateCart(cart).length === 0;
}

/**
 * Whether the cart needs the customer's attention before the pay button works.
 *
 * Separate from `isPayable` only so the UI can distinguish "empty, and that is
 * fine — nothing to show yet" from "broken, and the customer must act".
 */
export function needsAttention(cart: Cart): boolean {
  return validateCart(cart).some((p) => p.code !== 'empty');
}
