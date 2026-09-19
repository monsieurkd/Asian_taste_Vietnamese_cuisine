import { describe, it, expect } from 'vitest';
import {
  validateCart,
  isPayable,
  needsAttention,
  MAX_DISTINCT_LINES,
  MAX_QUANTITY_PER_LINE,
  type Cart,
  type CartLine,
} from './cartRules';
import { OrderType } from '../types/menu';

/**
 * Tests for pre-payment cart validation.
 *
 * The economic reason this matters: once Stripe has taken a charge, a cart that
 * turns out to be unfulfillable becomes a refund — a fee plus a support
 * conversation. Every rule below has to fire *before* that point.
 *
 * Relative import for `../types/menu`, matching the convention the test-wiring
 * guardrail expects of a spec file.
 */
const line = (over: Partial<CartLine> = {}): CartLine => ({
  menuItemId: 'item-1',
  name: 'Pho',
  quantity: 1,
  unitPrice: 1500,
  ...over,
});

const cart = (over: Partial<Cart> = {}): Cart => ({
  lines: [line()],
  orderType: OrderType.Pickup,
  ...over,
});

describe('validateCart', () => {
  it('accepts a normal pickup cart', () => {
    expect(validateCart(cart())).toEqual([]);
  });

  it('reports an empty cart', () => {
    const problems = validateCart(cart({ lines: [] }));
    expect(problems).toHaveLength(1);
    expect(problems[0].code).toBe('empty');
  });

  it('rejects a Delivery cart — v1 is pickup only', () => {
    // The important one. Delivery still exists in the API's type, so a cart can
    // carry it; paying for food nobody will deliver is the worst outcome here.
    const problems = validateCart(cart({ orderType: OrderType.Delivery }));
    expect(problems.map((p) => p.code)).toContain('pickup_only');
    expect(isPayable(cart({ orderType: OrderType.Delivery }))).toBe(false);
  });

  it('flags a sold-out line by name', () => {
    const problems = validateCart(cart({ lines: [line({ name: 'Banh Mi', available: false })] }));
    expect(problems[0].code).toBe('unavailable');
    expect(problems[0].message).toContain('Banh Mi');
    expect(problems[0].menuItemId).toBe('item-1');
  });

  it('accepts a line that has no availability flag', () => {
    // `available` is optional; absent means "assume available", not "sold out".
    expect(validateCart(cart({ lines: [line({ available: undefined })] }))).toEqual([]);
  });

  it('rejects a zero quantity', () => {
    const problems = validateCart(cart({ lines: [line({ quantity: 0 })] }));
    expect(problems.map((p) => p.code)).toContain('quantity');
  });

  it('rejects a negative quantity', () => {
    expect(validateCart(cart({ lines: [line({ quantity: -2 })] })).length).toBeGreaterThan(0);
  });

  it('rejects a fractional quantity', () => {
    const problems = validateCart(cart({ lines: [line({ quantity: 1.5 })] }));
    expect(problems.map((p) => p.code)).toContain('quantity');
  });

  it('accepts exactly the per-line limit', () => {
    expect(validateCart(cart({ lines: [line({ quantity: MAX_QUANTITY_PER_LINE })] }))).toEqual([]);
  });

  it('rejects one over the per-line limit', () => {
    const problems = validateCart(cart({ lines: [line({ quantity: MAX_QUANTITY_PER_LINE + 1 })] }));
    expect(problems.map((p) => p.code)).toContain('quantity');
  });

  it('reports EVERY problem, not just the first', () => {
    // The customer should fix the cart once, not discover problems one attempt
    // at a time.
    const problems = validateCart(
      cart({
        lines: [
          line({ menuItemId: 'a', name: 'A', available: false }),
          line({ menuItemId: 'b', name: 'B', quantity: 0 }),
        ],
      }),
    );
    expect(problems.map((p) => p.code).sort()).toEqual(['quantity', 'unavailable']);
  });

  it('rejects a cart with too many distinct lines', () => {
    const lines = Array.from({ length: MAX_DISTINCT_LINES + 1 }, (_, i) =>
      line({ menuItemId: `item-${i}` }),
    );
    expect(validateCart(cart({ lines })).map((p) => p.code)).toContain('line_limit');
  });

  it('accepts exactly the distinct-line limit', () => {
    const lines = Array.from({ length: MAX_DISTINCT_LINES }, (_, i) =>
      line({ menuItemId: `item-${i}` }),
    );
    expect(validateCart(cart({ lines }))).toEqual([]);
  });

  it('returns only "empty" for an empty cart, not a pile of other noise', () => {
    // An empty cart is not an error — it is the starting state. Returning early
    // is what keeps the UI from showing "choose a pickup type" to someone who
    // has not shopped yet.
    expect(validateCart(cart({ lines: [], orderType: OrderType.Delivery }))).toHaveLength(1);
  });
});

describe('isPayable', () => {
  it('is true only for a fully valid cart', () => {
    expect(isPayable(cart())).toBe(true);
    expect(isPayable(cart({ lines: [] }))).toBe(false);
    expect(isPayable(cart({ orderType: OrderType.Delivery }))).toBe(false);
  });
});

describe('needsAttention', () => {
  it('is false for an empty cart — nothing to fix yet', () => {
    expect(needsAttention(cart({ lines: [] }))).toBe(false);
  });

  it('is true when the customer must act', () => {
    expect(needsAttention(cart({ lines: [line({ available: false })] }))).toBe(true);
  });

  it('is false for a healthy cart', () => {
    expect(needsAttention(cart())).toBe(false);
  });
});
