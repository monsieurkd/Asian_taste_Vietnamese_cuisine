/* ==========================================================================
   Money, as the shop actually shows it.

   Two rules from the Australian retail convention shape this file:

   1. **Prices are GST-inclusive.** The menu's printed price IS the price the
      customer pays. Nothing here adds GST — a checkout that silently adds 10%
      at the last step is both a legal problem and the single fastest way to
      lose a customer.

   2. **Rounding happens once, on the total.** Rounding each line and then
      rounding the sum produces a total that disagrees with the sum of the
      lines the customer just read, which reads as a bug even when the code is
      "correct". So lines keep their exact value and only the total is rounded.

   This is a pure module on purpose: money arithmetic is the one thing in the
   customer app that must be testable without a browser.
   ========================================================================== */

/** Prices are stored in cents to avoid float drift. */
export type Cents = number;

export interface PricedLine {
  /** Unit price in cents, as printed on the menu (GST already included). */
  unitPrice: Cents;
  quantity: number;
}

/**
 * The exact (unrounded) total of a set of lines, in cents.
 *
 * Kept separate from `formatAud` because the two have different jobs: this is
 * arithmetic, that is presentation. Mixing them is how a rounded value gets
 * multiplied by a quantity.
 */
export function subtotalCents(lines: readonly PricedLine[]): Cents {
  return lines.reduce((total, line) => {
    // A negative quantity is a data bug, not a discount. Treating it as a
    // discount would let a malformed cart reduce the total.
    const qty = line.quantity > 0 ? Math.floor(line.quantity) : 0;
    return total + line.unitPrice * qty;
  }, 0);
}

/**
 * The total to charge, in whole cents.
 *
 * No GST is added — the line prices already include it. This exists so callers
 * have one function to reach for, rather than each doing its own arithmetic.
 */
export function totalCents(lines: readonly PricedLine[]): Cents {
  return Math.round(subtotalCents(lines));
}

/**
 * Format cents for display: `1250` -> `"$12.50"`.
 *
 * Cents are always shown (a price rendered as "$12" reads as a different price
 * from "$12.00" on a menu, and this is a food menu).
 */
export function formatAud(cents: Cents): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const body = `$${dollars.toLocaleString('en-AU')}.${String(remainder).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/**
 * The amount of the total that is GST, for a tax invoice.
 *
 * Australia displays GST-inclusive prices, so this is derived from the total
 * rather than added to it: at 10%, the GST component of an inclusive total is
 * `total / 11`. It is for the receipt's breakdown only — never for adding.
 */
export function gstComponentCents(total: Cents, ratePercent = 10): Cents {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const rate = ratePercent / (100 + ratePercent);
  return Math.round(total * rate);
}
