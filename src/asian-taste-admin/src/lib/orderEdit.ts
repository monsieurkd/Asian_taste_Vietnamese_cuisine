/**
 * The arithmetic an order edit shows before it is saved.
 *
 * The server decides the real total — it re-prices from the current menu, so this
 * cannot set one. What this does is let the operator see the consequence of the change
 * while the customer is still on the phone, which is the whole reason the screen exists
 * rather than a "change the order" endpoint alone.
 *
 * The case worth spelling out is a PAID order whose total moves. Raising it leaves the
 * customer owing money that nothing in this app will collect; lowering it leaves money
 * owed back. Both are conversations, not surprises for the counter, so the screen says
 * which one it is.
 */

export interface EditLine {
  unitPrice: number
  quantity: number
}

export interface EditMoney {
  /** What the order will cost after the change, by this screen's arithmetic. */
  newTotal: number
  /** Extra to collect for an order that was already charged. */
  shortfall: number
  /** Money owed back for an order that was already charged. */
  overpaid: number
  /** Whether an order that was never settled still needs collecting. */
  collectAtCounter: boolean
  /**
   * Which conversation the operator is about to have.
   *
   * Named as a case rather than left to the caller to infer from the numbers, because the
   * caller got it wrong: a screen that tested only `shortfall === 0 && overpaid === 0` read
   * an UNPAID order whose total rose from $9 to $22 as "the total has not changed" — both
   * of those are 0 when nothing was ever charged. The distinction is not derivable from the
   * amounts alone, so it is decided once, here, and tested.
   */
  case: 'paid-more' | 'paid-less' | 'nothing-taken' | 'unchanged'
}

export function editMoney(
  lines: EditLine[],
  orderTotal: number,
  paymentStatus: string | null | undefined,
  paidAmount: number | null | undefined,
): EditMoney {
  const newTotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const settled = (paymentStatus ?? '').toLowerCase() === 'succeeded';
  const paid = paidAmount ?? orderTotal;

  if (!settled) {
    // Never charged online. The card may have declined, or the customer chose to pay at
    // the counter — either way the counter has to collect the NEW figure.
    return {
      newTotal,
      shortfall: 0,
      overpaid: 0,
      collectAtCounter: newTotal > 0,
      // `nothing-taken` even when the total happens to be unchanged: the operator still has
      // to collect it, which is not the same as "nothing to do".
      case: newTotal > 0 ? 'nothing-taken' : 'unchanged',
    };
  }

  if (newTotal > paid) {
    return { newTotal, shortfall: newTotal - paid, overpaid: 0, collectAtCounter: true, case: 'paid-more' };
  }
  if (newTotal < paid) {
    return { newTotal, shortfall: 0, overpaid: paid - newTotal, collectAtCounter: false, case: 'paid-less' };
  }
  return { newTotal, shortfall: 0, overpaid: 0, collectAtCounter: false, case: 'unchanged' };
}
