import { describe, it, expect } from 'vitest';
import { useCheckoutStore } from '../stores/checkoutStore';
import type { PendingOrderData } from '../stores/checkoutStore';

/**
 * Guards against a silently-ignored checkout field returning.
 *
 * `savePaymentMethod` used to travel the whole length of the checkout — the
 * store state, a pending-order field, a request body field and an API DTO
 * property — and then be read by nothing. No code path wrote a row to
 * `customer_payment_methods`, so a customer who ticked "save my card" got no
 * saved card and no message. That is the worst of the three possible states:
 * worse than not offering it, because the customer believes it worked.
 *
 * It was removed rather than left in place. These tests are the tripwire for
 * re-adding it by halves: if the flag comes back without an implementation,
 * they fail first.
 *
 * Assertions are on runtime objects rather than on source text because this
 * app's tsconfig is a browser config (`types: ["vite/client"]`), so a test that
 * imported `node:fs` could not compile. Runtime shape is also the stronger
 * check — it fails wherever the value actually flows, not only where it is
 * spelled.
 */

/** A pending order built to the shape the checkout produces. */
const pendingOrder: PendingOrderData = {
  customerName: 'Test',
  customerPhone: '0400000000',
  customerEmail: 'test@example.com',
  orderType: 'Pickup',
  pickupTime: { type: 'ASAP' },
  items: [],
  orderTotal: 2500,
  paymentMethod: 'Card',
  createAccount: false,
};

describe('the checkout store carries no save-payment-method flag', () => {
  it('the store state exposes no save flag or setter', () => {
    const state = useCheckoutStore.getState() as unknown as Record<string, unknown>;
    expect(Object.keys(state)).not.toContain('savePaymentMethod');
    expect(Object.keys(state)).not.toContain('setSavePaymentMethod');
    expect(state.setSavePaymentMethod).toBeUndefined();
  });

  it('no part of the store state mentions saving a payment method', () => {
    // Catches the flag reappearing under a different casing or nesting.
    expect(JSON.stringify(useCheckoutStore.getState())).not.toMatch(/savepaymentmethod/i);
  });

  it('a pending order has no save field', () => {
    expect(Object.keys(pendingOrder)).not.toContain('savePaymentMethod');
    expect(JSON.stringify(pendingOrder)).not.toMatch(/savepayment/i);
  });

  it('the pending-order type has no save field to assign', () => {
    // A compile-time guard: if `savePaymentMethod` is re-added to
    // PendingOrderData, this assignment starts type-checking and the
    // `@ts-expect-error` below becomes an *unused* directive, which `tsc -b`
    // reports as an error. So re-adding the field breaks the build here rather
    // than silently shipping a dead flag.
    // @ts-expect-error PendingOrderData has no savePaymentMethod field.
    const forbidden: PendingOrderData = { ...pendingOrder, savePaymentMethod: true };
    expect(forbidden).toBeDefined();
  });
});
