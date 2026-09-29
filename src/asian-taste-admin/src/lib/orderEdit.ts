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
    return { newTotal, shortfall: 0, overpaid: 0, collectAtCounter: newTotal > 0 };
  }

  return {
    newTotal,
    shortfall: newTotal > paid ? newTotal - paid : 0,
    overpaid: newTotal < paid ? paid - newTotal : 0,
    collectAtCounter: newTotal > paid,
  };
}
