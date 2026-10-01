import { describe, it, expect } from 'vitest';
import {
  canTickItems,
  isOutstanding,
  lineDetail,
  progressFraction,
  progressLabel,
  progressOf,
} from './itemProgress';
import type { Order, OrderItem } from '../types';

/**
 * Tests for what the kitchen board says about a ticket's dishes.
 *
 * The number on the ticket is the only thing telling a cook how much of an order is
 * left, and the two ways it can lie are both silent:
 *
 *   * **It reads "0 of 0"** when the lines were never fetched — which looks like an
 *     order with no food, not a missing field.
 *   * **It counts the wrong thing** because it was derived from whatever page happened
 *     to be fetched rather than from what the kitchen has actually ticked.
 *
 * So the count comes from the server, the label says nothing when there is nothing to
 * say, and these tests pin both.
 */

/**
 * A line, in the DETAIL shape (money included), because that is what `Order.items` is
 * typed as. The list endpoint sends a narrower object with the same fields the ticket
 * reads — which is the point of the shared `TicketLine` subset these tests exercise.
 */
function line(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 1,
    menuItemId: 1,
    menuItemName: 'Pho',
    quantity: 1,
    unitPrice: 17,
    totalPrice: 17,
    isCompleted: false,
    modifiers: [],
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    orderNumber: 'AT-010100-0001',
    customerName: 'Mai',
    customerPhone: '0400000000',
    customerEmail: 'mai@example.com',
    orderType: 'Pickup',
    requestedTime: '2026-09-30T10:00:00Z',
    status: 'Confirmed',
    subtotal: 17,
    total: 17,
    itemsDone: { done: 0, total: 0 },
    createdAt: '2026-09-30T09:45:00Z',
    ...overrides,
  };
}

describe('progressOf — where the number comes from', () => {
  it('uses the server count when the API sent one', () => {
    const o = order({ itemsDone: { done: 2, total: 4 }, items: [line({ isCompleted: true })] });

    // The server wins even though the fetched lines disagree. The lines on this page are
    // whatever was fetched; the count is what the kitchen has ticked.
    expect(progressOf(o)).toEqual({ done: 2, total: 4 });
  });

  it('falls back to counting the lines when the server field is missing', () => {
    // An older API, or a cached response. Rendering "undefined of undefined" on a
    // kitchen screen is worse than counting what is actually on the page.
    const o = order({
      itemsDone: undefined as never,
      items: [line({ id: 1, isCompleted: true }), line({ id: 2 }), line({ id: 3 })],
    });

    expect(progressOf(o)).toEqual({ done: 1, total: 3 });
  });

  it('reports no lines as zero of zero rather than throwing', () => {
    const o = order({ itemsDone: undefined as never, items: null });
    expect(progressOf(o)).toEqual({ done: 0, total: 0 });
  });
});

describe('progressLabel — what the ticket says', () => {
  it('says nothing when the order has no lines to count', () => {
    // Not "0 of 0": a ticket whose lines were not fetched is not a ticket with no food,
    // and the kitchen must not be told an order is empty when it is not.
    expect(progressLabel(order({ itemsDone: { done: 0, total: 0 } }))).toBeNull();
  });

  it('names the dishes still to cook', () => {
    expect(progressLabel(order({ itemsDone: { done: 0, total: 3 } }))).toBe('3 to cook');
  });

  it('counts down as the ticks land', () => {
    expect(progressLabel(order({ itemsDone: { done: 1, total: 3 } }))).toBe('1 of 3 done');
    expect(progressLabel(order({ itemsDone: { done: 2, total: 3 } }))).toBe('2 of 3 done');
  });

  it('says "all done" rather than "3 of 3"', () => {
    // The moment the order moves to Ready, the useful fact is that nothing is left —
    // not that the two numbers happen to be equal.
    expect(progressLabel(order({ itemsDone: { done: 3, total: 3 } }))).toBe('All 3 done');
  });
});

describe('progressFraction — the bar', () => {
  it('is a fraction of the dishes, not of the money', () => {
    expect(progressFraction(order({ itemsDone: { done: 1, total: 4 } }))).toBe(0.25);
  });

  it('is zero for an order with no lines, so the bar does not vanish on a NaN', () => {
    // `width: NaN%` is ignored by CSS, so a division by zero here would make the bar
    // disappear — which reads as a styling bug rather than as a missing count.
    expect(progressFraction(order({ itemsDone: { done: 0, total: 0 } }))).toBe(0);
  });

  it('never exceeds one, even if a stale count says more done than exist', () => {
    expect(progressFraction(order({ itemsDone: { done: 5, total: 3 } }))).toBe(1);
  });
});

describe('canTickItems — which tickets can be ticked', () => {
  it('allows a live order', () => {
    expect(canTickItems(order({ status: 'Confirmed' }))).toBe(true);
    expect(canTickItems(order({ status: 'Pending' }))).toBe(true);
    expect(canTickItems(order({ status: 'Ready' }))).toBe(true);
  });

  it('refuses a collected or cancelled order', () => {
    // The food was not made for these orders. The API refuses the tick too, so showing
    // the control would offer a press whose only outcome is an error message.
    expect(canTickItems(order({ status: 'Completed' }))).toBe(false);
    expect(canTickItems(order({ status: 'Cancelled' }))).toBe(false);
  });

  it('accepts the casing the API may send', () => {
    expect(canTickItems(order({ status: 'completed' as never }))).toBe(false);
  });
});

describe('lineDetail and isOutstanding', () => {
  it('joins the options and the note into one line', () => {
    // The list endpoint's shape, which is what the board actually receives: options
    // already joined to a string in SQL. Cast because `Order.items` is typed as the
    // detail's shape, and this test is deliberately exercising the other one.
    const listShaped = line({
      modifiers: 'Extra spicy' as never,
      specialInstructions: 'No onion',
    });

    expect(lineDetail(listShaped)).toBe('Extra spicy · Note: No onion');
  });

  it('reads the detail endpoint shape too, where modifiers are objects', () => {
    // Both endpoints feed the same renderer; a ticket that only understood one of them
    // would show options on the board and none on the ticket page, or the reverse.
    const detailShaped = line({
      modifiers: [
        { id: 1, modifierId: 5, modifierName: 'Extra spicy', priceAdjustment: 0 },
        { id: 2, modifierId: 6, modifierName: 'No onion', priceAdjustment: 0 },
      ],
    });

    expect(lineDetail(detailShaped)).toBe('Extra spicy, No onion');
  });

  it('says nothing about an empty option list', () => {
    expect(lineDetail(line({ modifiers: [] }))).toBeNull();
  });

  it('says nothing when there is nothing to say', () => {
    expect(lineDetail(line())).toBeNull();
  });

  it('treats an unticked dish as outstanding and a ticked one as not', () => {
    expect(isOutstanding(line({ isCompleted: false }))).toBe(true);
    expect(isOutstanding(line({ isCompleted: true }))).toBe(false);
  });
});
