import { describe, it, expect } from 'vitest';
import {
  formatAud,
  gstComponentCents,
  subtotalCents,
  totalCents,
  type PricedLine,
} from './money';

/**
 * Tests for the customer-facing money module.
 *
 * Money is the one thing in this app that must be provable without a browser,
 * and the failure it guards against is specific: a total that disagrees with the
 * lines the customer just read, or a GST amount that gets *added* to an
 * already-inclusive price.
 *
 * Relative import rather than the `@/` alias, matching the convention in
 * `orderLifecycle.test.ts`: the test-wiring guardrail reads every non-relative
 * specifier in a spec as a package that must be declared.
 */
const line = (unitPrice: number, quantity: number): PricedLine => ({ unitPrice, quantity });

describe('subtotalCents', () => {
  it('multiplies unit price by quantity', () => {
    expect(subtotalCents([line(1250, 2)])).toBe(2500);
  });

  it('sums several lines', () => {
    expect(subtotalCents([line(1250, 2), line(800, 1), line(1999, 3)])).toBe(2500 + 800 + 5997);
  });

  it('is zero for an empty cart', () => {
    expect(subtotalCents([])).toBe(0);
  });

  it('treats a non-positive quantity as zero, not as a discount', () => {
    // A malformed cart must never be able to *reduce* the total. A negative
    // quantity read as a discount is how a cart totals to less than its items.
    expect(subtotalCents([line(1250, -3)])).toBe(0);
    expect(subtotalCents([line(1250, 0)])).toBe(0);
  });

  it('floors a fractional quantity rather than charging for a fraction', () => {
    // 2.7 of something is not orderable; 2 is the safe reading.
    expect(subtotalCents([line(1000, 2.7)])).toBe(2000);
  });
});

describe('totalCents', () => {
  it('does NOT add GST — prices are already inclusive', () => {
    // The single most important assertion in this file. If someone "fixes" the
    // total by adding 10%, every order overcharges by 10% and the printed menu
    // no longer matches the checkout.
    const lines = [line(1250, 2)];
    expect(totalCents(lines)).toBe(2500);
    expect(totalCents(lines)).toBe(subtotalCents(lines));
  });

  it('returns a whole number of cents', () => {
    expect(Number.isInteger(totalCents([line(1000, 3)]))).toBe(true);
  });
});

describe('formatAud', () => {
  it('formats cents as dollars with two decimals', () => {
    expect(formatAud(1250)).toBe('$12.50');
  });

  it('always shows cents, even when they are zero', () => {
    // A price rendered without cents reads as a different price on a food menu,
    // so the decimals are always present rather than implicit.
    expect(formatAud(1200)).toBe('$12.00');
  });

  it('pads a single-digit cent value', () => {
    expect(formatAud(1205)).toBe('$12.05');
  });

  it('formats zero as $0.00', () => {
    expect(formatAud(0)).toBe('$0.00');
  });

  it('groups thousands', () => {
    expect(formatAud(123456)).toBe('$1,234.56');
  });

  it('renders a negative amount with a leading minus', () => {
    // Refunds and adjustments are real; a negative that renders as "$12.50"
    // would be read as a charge.
    expect(formatAud(-1250)).toBe('-$12.50');
  });

  it('rounds a fractional cent instead of rendering it', () => {
    expect(formatAud(1250.4)).toBe('$12.50');
    expect(formatAud(1249.6)).toBe('$12.50');
  });

  it('falls back to $0.00 for a non-finite value', () => {
    // NaN in a total is a data bug; "$NaN" on a checkout button is worse.
    expect(formatAud(Number.NaN)).toBe('$0.00');
    expect(formatAud(Number.POSITIVE_INFINITY)).toBe('$0.00');
  });
});

describe('gstComponentCents', () => {
  it('derives the GST from an inclusive total at 10%', () => {
    // At 10% GST, an inclusive total T contains T/11 of tax.
    expect(gstComponentCents(1100)).toBe(100);
  });

  it('is a component of the total, never an addition to it', () => {
    const total = 2500;
    const gst = gstComponentCents(total);
    expect(gst).toBeLessThan(total);
    expect(gst).toBe(Math.round(2500 / 11));
  });

  it('is zero for zero or negative totals', () => {
    expect(gstComponentCents(0)).toBe(0);
    expect(gstComponentCents(-500)).toBe(0);
  });

  it('respects a non-default rate', () => {
    // At 0% there is no tax component at all.
    expect(gstComponentCents(1100, 0)).toBe(0);
  });
});
