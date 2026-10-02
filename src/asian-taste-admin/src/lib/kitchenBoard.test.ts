import { describe, it, expect } from 'vitest';
import {
  LATE_MINUTES,
  WARNING_MINUTES,
  canAdvance,
  cookActionLabel,
  cookStateLabel,
  groupForCooking,
  hasWorkLeft,
  itemsOf,
  minutesUntilWanted,
  nextCookState,
  progressPhrase,
  urgencyOf,
  wantedLabel,
} from './kitchenBoard';
import type { KitchenItem, KitchenTicket } from '../api/kitchenApi';

/**
 * Tests for what the kitchen board decides for itself.
 *
 * The rules here are the ones a cook reads at a glance during service, and every one of them
 * can be wrong in a way that is invisible from the screen:
 *
 *   * **A dish advances ONE state at a time.** A tap that jumped Queued straight to Done
 *     would let food be marked ready that was never picked up, defeating the middle state.
 *   * **A scheduled order is not late for existing early.** Judging a 7pm order by how long
 *     ago it was placed flags it as overdue from 4pm, and a board whose warnings are always
 *     on is a board whose warnings are never read.
 *   * **An order with no dishes is not the same as one whose dishes were not loaded.**
 */

function item(overrides: Partial<KitchenItem> = {}): KitchenItem {
  return {
    id: 1,
    menuItemName: 'Pho Bo',
    quantity: 1,
    cookState: 'Queued',
    isCompleted: false,
    ...overrides,
  };
}

function ticket(overrides: Partial<KitchenTicket> = {}): KitchenTicket {
  return {
    id: 1,
    orderNumber: 'AT-010100-0001',
    customerName: 'Mai',
    customerPhone: '0400000000',
    customerEmail: 'mai@example.com',
    orderType: 'Pickup',
    requestedTime: new Date().toISOString(),
    status: 'Confirmed',
    subtotal: 17,
    total: 17,
    createdAt: new Date().toISOString(),
    isHeld: false,
    remainingLines: 0,
    cookingLines: 0,
    ageMinutes: 0,
    isScheduled: false,
    itemsDone: { done: 0, total: 0 },
    ...overrides,
  };
}

describe('advancing a dish', () => {
  it('moves one state at a time, never skipping the middle', () => {
    // Skipping Cooking would let a cook mark food Done that was never picked up.
    expect(nextCookState('Queued')).toBe('Cooking');
    expect(nextCookState('Cooking')).toBe('Done');
    expect(nextCookState('Done')).toBeNull();
  });

  it('names the tap in the kitchen verbs, not the stored state', () => {
    expect(cookActionLabel('Queued')).toBe('Start');
    expect(cookActionLabel('Cooking')).toBe('Done');
    expect(cookActionLabel('Done')).toBeNull();
  });

  it('says nothing can be advanced on a finished dish', () => {
    expect(canAdvance(item({ cookState: 'Queued' }))).toBe(true);
    expect(canAdvance(item({ cookState: 'Cooking' }))).toBe(true);
    expect(canAdvance(item({ cookState: 'Done' }))).toBe(false);
  });

  it('labels the states as work rather than as data', () => {
    // "To cook" is a thing to do; "Queued" is how it is stored and what nobody says aloud.
    expect(cookStateLabel('Queued')).toBe('To cook');
    expect(cookStateLabel('Cooking')).toBe('Cooking');
    expect(cookStateLabel('Done')).toBe('Done');
  });
});

describe('ordering the dishes for a cook', () => {
  it('puts what is on the wok first, because that is what burns', () => {
    const items = [
      item({ id: 1, cookState: 'Queued' }),
      item({ id: 2, cookState: 'Done' }),
      item({ id: 3, cookState: 'Cooking' }),
    ];

    const g = groupForCooking(items);

    expect(g.cooking.map((i) => i.id)).toEqual([3]);
    expect(g.queued.map((i) => i.id)).toEqual([1]);
    expect(g.done.map((i) => i.id)).toEqual([2]);
  });

  it('keeps the customer order inside each group', () => {
    const items = [
      item({ id: 1, cookState: 'Queued' }),
      item({ id: 2, cookState: 'Queued' }),
      item({ id: 3, cookState: 'Queued' }),
    ];

    // The order within a group follows the customer's own list, which is how the food was
    // ordered — re-sorting it would make the ticket disagree with the docket.
    expect(groupForCooking(items).queued.map((i) => i.id)).toEqual([1, 2, 3]);
  });
});

describe('urgency', () => {
  it('is normal for a fresh order', () => {
    expect(urgencyOf(ticket({ ageMinutes: 2 }))).toBe('normal');
  });

  it('warns, then goes late, as an immediate order sits', () => {
    expect(urgencyOf(ticket({ ageMinutes: WARNING_MINUTES }))).toBe('warning');
    expect(urgencyOf(ticket({ ageMinutes: LATE_MINUTES }))).toBe('late');
    expect(urgencyOf(ticket({ ageMinutes: 90 }))).toBe('late');
  });

  it('does NOT call a scheduled order late just for being placed early', () => {
    // A 7pm order placed at 4pm is three hours old by 7pm and perfectly on time. Judging it
    // by age would flag it from 4pm and make every warning on the board unreadable.
    const future = new Date(Date.now() + 120 * 60_000).toISOString();
    const t = ticket({ isScheduled: true, ageMinutes: 180, requestedTime: future });

    expect(urgencyOf(t)).toBe('normal');
  });

  it('calls a scheduled order late once its own time has passed', () => {
    const past = new Date(Date.now() - 10 * 60_000).toISOString();
    const t = ticket({ isScheduled: true, requestedTime: past });

    expect(urgencyOf(t)).toBe('late');
  });

  it('warns when a scheduled order is nearly due', () => {
    const soon = new Date(Date.now() + 3 * 60_000).toISOString();
    expect(urgencyOf(ticket({ isScheduled: true, requestedTime: soon }))).toBe('warning');
  });
});

describe('the wanted time', () => {
  it('says ASAP for an immediate order', () => {
    expect(wantedLabel(ticket({ isScheduled: false }))).toBe('ASAP');
  });

  it('counts up to a scheduled time', () => {
    const inTwenty = new Date(Date.now() + 20 * 60_000).toISOString();
    expect(wantedLabel(ticket({ isScheduled: true, requestedTime: inTwenty }))).toBe('in 20 min');
  });

  it('says how late once the time has passed', () => {
    const tenAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(wantedLabel(ticket({ isScheduled: true, requestedTime: tenAgo }))).toBe('10 min late');
  });

  it('reads a far-off time as a clock time rather than a count of minutes', () => {
    const inThreeHours = new Date(Date.now() + 180 * 60_000).toISOString();
    const label = wantedLabel(ticket({ isScheduled: true, requestedTime: inThreeHours }));

    expect(label).not.toContain('min');
    expect(label).toMatch(/\d/);
  });

  it('reports nothing rather than NaN for an unreadable time', () => {
    expect(minutesUntilWanted(ticket({ requestedTime: 'not-a-date' }))).toBeNull();
  });
});

describe('what is left', () => {
  it('knows a ticket with dishes still to cook', () => {
    expect(hasWorkLeft(ticket({ remainingLines: 3 }))).toBe(true);
    expect(hasWorkLeft(ticket({ remainingLines: 0 }))).toBe(false);
  });

  it('does not confuse "no lines sent" with "no food on the order"', () => {
    // A ticket whose items are null was simply not asked for them. Returning [] would make
    // the two cases indistinguishable, which is the ambiguity that made an earlier version
    // of this look broken.
    expect(itemsOf(ticket({ items: null }))).toEqual([]);
    expect(itemsOf(ticket({ items: [item()] }))).toHaveLength(1);
  });

  it('says nothing when the order has no dishes at all', () => {
    expect(progressPhrase(ticket({ itemsDone: { done: 0, total: 0 } }))).toBeNull();
  });

  it('mentions what is cooking when something is', () => {
    const t = ticket({ itemsDone: { done: 1, total: 4 }, cookingLines: 2 });
    // A cook's first question is "what is on", so the phrase answers it rather than only
    // counting what is finished.
    expect(progressPhrase(t)).toBe('1 of 4 done · 2 cooking');
  });

  it('counts down, then says all done', () => {
    expect(progressPhrase(ticket({ itemsDone: { done: 0, total: 3 } }))).toBe('3 to cook');
    expect(progressPhrase(ticket({ itemsDone: { done: 2, total: 3 } }))).toBe('2 of 3 done');
    expect(progressPhrase(ticket({ itemsDone: { done: 3, total: 3 } }))).toBe('All 3 done');
  });
});
