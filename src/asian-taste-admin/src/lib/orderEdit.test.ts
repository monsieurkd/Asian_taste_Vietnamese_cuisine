import { describe, it, expect } from 'vitest';
// Relative rather than the `@shared` alias, per the test-wiring guardrail.
import { editMoney } from './orderEdit';

/**
 * Tests for what an order edit says about the money.
 *
 * The edit itself is the server's job — it re-prices from the menu, so the client
 * cannot set a total. What is tested here is the WARNING: an edit that moves the total
 * of an already-charged order leaves money owed one way or the other, and the operator
 * has to be told while the customer is still on the phone.
 */
describe('editMoney — an order that was charged', () => {
  it('flags the extra to collect when the total goes up', () => {
    // 17.00 was taken; the order now costs 38.50. Nothing in this app will collect the
    // difference, so silence here is how a shop under-charges.
    const money = editMoney(
      [{ unitPrice: 15, quantity: 2 }, { unitPrice: 8.5, quantity: 1 }],
      17,
      'Succeeded',
      17,
    );

    expect(money.newTotal).toBe(38.5);
    expect(money.shortfall).toBe(21.5);
    expect(money.collectAtCounter).toBe(true);
  });

  it('flags money owed back when the total goes down', () => {
    const money = editMoney([{ unitPrice: 8.5, quantity: 1 }], 17, 'Succeeded', 17);

    expect(money.overpaid).toBe(8.5);
    expect(money.shortfall).toBe(0);
    // The customer is owed money, not owing it: this must NOT read as "collect".
    expect(money.collectAtCounter).toBe(false);
  });

  it('says nothing about a difference when the total is unchanged', () => {
    const money = editMoney([{ unitPrice: 17, quantity: 1 }], 17, 'Succeeded', 17);

    expect(money.shortfall).toBe(0);
    expect(money.overpaid).toBe(0);
    expect(money.collectAtCounter).toBe(false);
  });

  it('compares against what was PAID, not the order total', () => {
    // A cart can be priced differently from what was captured — a partial refund, a
    // corrected amount. The money that moved is the fact.
    const money = editMoney([{ unitPrice: 10, quantity: 1 }], 17, 'Succeeded', 12);

    // 12 was taken and the order now costs 10, so 2 is owed back — not 7.
    expect(money.overpaid).toBe(2);
  });

  it('still works when no paid amount was recorded', () => {
    // Older rows have no paid_amount. Falling back to the order total is the honest
    // read, and it must not produce NaN.
    const money = editMoney([{ unitPrice: 20, quantity: 1 }], 17, 'Succeeded', null);

    expect(money.shortfall).toBe(3);
    expect(Number.isNaN(money.shortfall)).toBe(false);
  });
});

describe('editMoney — an order that was never charged', () => {
  it('says to collect at the counter, whatever the total', () => {
    // A declined card the counter still fulfils. The food will be cooked, so the counter
    // must collect the new total — implying it was handled online sends it out unpaid.
    for (const status of ['Failed', 'RequiresAction', 'Pending', 'Canceled', null, undefined]) {
      const money = editMoney([{ unitPrice: 15, quantity: 1 }], 17, status, null);
      expect(money.collectAtCounter).toBe(true);
      expect(money.shortfall).toBe(0);
    }
  });

  it('does not claim a difference on money that never moved', () => {
    const money = editMoney([{ unitPrice: 8.5, quantity: 1 }], 17, 'Failed', null);
    expect(money.overpaid).toBe(0);
  });
});

describe('editMoney — arithmetic', () => {
  it('multiplies quantity by unit price', () => {
    expect(editMoney([{ unitPrice: 8.5, quantity: 4 }], 0, 'Failed', null).newTotal).toBe(34);
  });

  it('sums several lines', () => {
    const money = editMoney(
      [{ unitPrice: 15, quantity: 1 }, { unitPrice: 8.5, quantity: 2 }, { unitPrice: 4, quantity: 3 }],
      0,
      'Failed',
      null,
    );
    expect(money.newTotal).toBe(15 + 17 + 12);
  });

  it('treats an emptied order as costing nothing', () => {
    // The server refuses an empty order; the screen shows 0.00 rather than NaN while the
    // operator is mid-edit, and its Save button is disabled separately.
    expect(editMoney([], 17, 'Succeeded', 17).newTotal).toBe(0);
  });
});

describe('the case the operator is about to have', () => {
  // `case` exists because a caller inferred it from the amounts and got it wrong: a screen
  // testing only `shortfall === 0 && overpaid === 0` read an UNPAID order whose total rose
  // from $9 to $22 as "the total has not changed". Both are 0 when nothing was charged, so
  // the distinction is not derivable from the numbers and is decided here instead.

  const lines = (p: number) => [{ unitPrice: p, quantity: 1 }];

  it('names a card order whose total rose as paid-more', () => {
    const m = editMoney(lines(22), 9, 'Succeeded', 9);
    expect(m.case).toBe('paid-more');
    expect(m.shortfall).toBe(13);
  });

  it('names a card order whose total fell as paid-less', () => {
    const m = editMoney(lines(5), 9, 'Succeeded', 9);
    expect(m.case).toBe('paid-less');
    expect(m.overpaid).toBe(4);
  });

  it('names an UNPAID order whose total rose as nothing-taken, not unchanged', () => {
    // The regression. $9 -> $22 with no charge: shortfall and overpaid are BOTH 0, which is
    // exactly the shape of "nothing happened" — and it is nothing of the sort.
    const m = editMoney(lines(22), 9, 'Pending', null);
    expect(m.case).toBe('nothing-taken');
    expect(m.collectAtCounter).toBe(true);
    expect(m.shortfall).toBe(0);
    expect(m.overpaid).toBe(0);
  });

  it('names an unchanged paid order as unchanged', () => {
    expect(editMoney(lines(9), 9, 'Succeeded', 9).case).toBe('unchanged');
  });

  it('treats a declined card as nothing-taken, not as a paid order', () => {
    const m = editMoney(lines(22), 9, 'Failed', null);
    expect(m.case).toBe('nothing-taken');
  });

  it('is case-insensitive about the payment status', () => {
    expect(editMoney(lines(22), 9, 'succeeded', 9).case).toBe('paid-more');
    expect(editMoney(lines(22), 9, 'SUCCEEDED', 9).case).toBe('paid-more');
  });

  it('falls back to the order total when no paid amount was recorded', () => {
    // An older order with a Succeeded status and no paid_amount: the total it was charged
    // is the only figure available.
    const m = editMoney(lines(20), 9, 'Succeeded', null);
    expect(m.case).toBe('paid-more');
    expect(m.shortfall).toBe(11);
  });
});
