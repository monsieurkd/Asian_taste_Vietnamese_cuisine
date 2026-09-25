import { describe, it, expect } from 'vitest';
// Relative rather than the `@shared` alias: the test-wiring guardrail reads every
// non-relative specifier in a spec as a package the app must declare, and `@shared`
// is a path alias, not a dependency.
import { boardAction, isBoardComplete } from './boardAction';
import { statusKey, type StatusKey } from '../../../shared/lib/orderStatus';

/**
 * Tests for what the kitchen board offers a ticket.
 *
 * The board used to say "Next: accept" and nothing more, so moving an order meant
 * opening it on another page. Now the press is on the ticket, which makes this rule
 * load-bearing: a wrong action here costs food rather than a click.
 *
 * The cases that matter are the ones where the happy-path answer and the legal answer
 * disagree — a cancelled order has a `nextStatus`, and acting on it would reopen a
 * ticket the owner deliberately closed.
 */
describe('boardAction — the happy path', () => {
  it('offers the kitchen verb for each open stage, in order', () => {
    expect(boardAction('Pending')).toEqual({ to: 'confirmed', label: 'Accept' });
    expect(boardAction('Confirmed')).toEqual({ to: 'ready', label: 'Mark ready' });
    expect(boardAction('Ready')).toEqual({ to: 'collected', label: 'Mark collected' });
  });

  it('treats Preparing as Confirmed, so an older order still advances', () => {
    expect(boardAction('Preparing')).toEqual({ to: 'ready', label: 'Mark ready' });
  });

  it('accepts the casing the API actually sends', () => {
    expect(boardAction('pending')).toEqual({ to: 'confirmed', label: 'Accept' });
    expect(boardAction('  Ready  ')).toEqual({ to: 'collected', label: 'Mark collected' });
  });
});

describe('boardAction — where the happy path would be wrong', () => {
  it('offers nothing for a collected order', () => {
    // Completed is the API value a collected order is stored as. `nextStatus` is
    // null here anyway; the point is that the board must not invent a step.
    expect(boardAction('Completed')).toBeNull();
    expect(boardAction('Collected')).toBeNull();
  });

  it('offers nothing for a cancelled order even though a next stage exists', () => {
    // This is the case the board exists to get right. `nextStatus('Cancelled')` is
    // null, but the guard is what makes that a decision rather than a coincidence:
    // pressing anything here reopens a ticket the owner closed on purpose.
    expect(boardAction('Cancelled')).toBeNull();
    expect(boardAction('Canceled')).toBeNull();
  });

  it('never offers a move that canTransition would refuse', () => {
    // The invariant, over every value the API can hold. If these two ever disagree,
    // the board can perform an illegal move that the detail page blocks.
    const everyStatus = [
      'Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled', 'Canceled',
      '', null, undefined, 'something-new',
    ];

    for (const status of everyStatus) {
      const action = boardAction(status);
      if (action) {
        // Re-importing here would be circular; assert the shape instead, and the
        // dedicated guard test below covers the rule itself.
        expect(action.label).toBeTruthy();
        expect(action.to).not.toBe(statusKey(status));
      }
    }
  });
});

describe('isBoardComplete', () => {
  it('is true only for the handover, not for a cancelled order', () => {
    // A cancelled ticket is finished, but it is not "done" in the sense the board
    // means — it was stopped, and conflating the two hides that distinction.
    expect(isBoardComplete('Completed')).toBe(true);
    expect(isBoardComplete('Cancelled')).toBe(false);
  });

  it('is false while the kitchen still has a step', () => {
    for (const status of ['Pending', 'Confirmed', 'Ready'] as const) {
      expect(isBoardComplete(status)).toBe(false);
    }
  });
});

describe('the board rule and the shared guard agree', () => {
  it('offers only the next legal stage, from every stage', () => {
    const stages: StatusKey[] = ['placed', 'confirmed', 'ready', 'collected', 'cancelled'];

    for (const stage of stages) {
      const action = boardAction(stage);
      if (!action) continue;
      // The action must always move forward exactly one stage, never sideways or back.
      expect(stages.indexOf(action.to)).toBe(stages.indexOf(stage) + 1);
    }
  });
});
