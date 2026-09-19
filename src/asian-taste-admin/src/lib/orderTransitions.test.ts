import { describe, it, expect } from 'vitest';
// Relative rather than the `@shared` alias: the test-wiring guardrail reads every
// non-relative specifier in a spec as a package the app must declare, and `@shared`
// is a path alias, not a dependency. `orderStatus.test.ts` follows the same rule by
// importing ./orderStatus.
import { canTransition, allowedTransitions } from '../../../shared/lib/orderTransitions';
import { STATUS_ORDER, isClosed } from './orderStatus';

/**
 * Tests for the console's status-move guard.
 *
 * `nextStatus` answers "what comes next?" on the happy path. These tests cover
 * the different question the buttons need — may this order move there at all? —
 * because the illegal moves are the ones that corrupt the board: the board's
 * numbers are this app's only record of the trading day.
 */
describe('canTransition — allowed moves', () => {
  it('advances one stage at a time', () => {
    expect(canTransition('Pending', 'Confirmed').allowed).toBe(true);
    expect(canTransition('Confirmed', 'Ready').allowed).toBe(true);
    expect(canTransition('Ready', 'Completed').allowed).toBe(true);
  });

  it('allows cancelling a live order', () => {
    // Staff cancel for reasons the app cannot see — the customer rang, the
    // kitchen ran out. Blocking that would be worse than allowing it.
    expect(canTransition('Pending', 'Cancelled').allowed).toBe(true);
    expect(canTransition('Confirmed', 'Cancelled').allowed).toBe(true);
    expect(canTransition('Ready', 'Cancelled').allowed).toBe(true);
  });

  it('accepts API values that fold onto a canonical stage', () => {
    // `Preparing` reads as `Confirmed`, so Pending -> Preparing is one step.
    expect(canTransition('Pending', 'Preparing').allowed).toBe(true);
    // `Completed` is stored for the collected stage.
    expect(canTransition('Ready', 'Completed').allowed).toBe(true);
  });
});

describe('canTransition — the moves that must be refused', () => {
  it('refuses to advance a cancelled order', () => {
    // The important one: a cancelled order is finished. Cooking it means
    // producing food nobody is paying for, and re-opens a ticket the owner
    // closed deliberately.
    const check = canTransition('Cancelled', 'Confirmed');
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/cancelled/i);
  });

  it('refuses every move out of cancelled', () => {
    for (const to of STATUS_ORDER) {
      expect(canTransition('Cancelled', to).allowed, `Cancelled -> ${to}`).toBe(false);
    }
  });

  it('refuses every move out of a collected order', () => {
    // Pinned as a loop over ALL stages rather than one specific pair. A mutation
    // check found that removing the `collected` guard inside `canAdvance` did
    // not fail the suite, because `collected` is the last stage and the index
    // arithmetic already blocks forward moves. Asserting every target keeps the
    // behaviour pinned even if the stage order changes later.
    for (const to of [...STATUS_ORDER, 'Cancelled', 'Preparing'] as string[]) {
      expect(canTransition('Completed', to).allowed, `Completed -> ${to}`).toBe(false);
    }
  });

  it('offers no forward path from the final stage', () => {
    // The invariant, stated directly: the last entry of STATUS_ORDER is terminal.
    const finalKey = STATUS_ORDER[STATUS_ORDER.length - 1];
    expect(allowedTransitions(finalKey)).toEqual([]);
  });

  it('treats every closed status as terminal, whichever way it is spelled', () => {
    for (const spelling of ['Completed', 'Collected', 'PickedUp', 'Cancelled', 'Canceled']) {
      expect(isClosed(spelling), `${spelling} should be closed`).toBe(true);
      expect(canTransition(spelling, 'Ready').allowed, `${spelling} -> Ready`).toBe(false);
      expect(canTransition(spelling, 'Confirmed').allowed, `${spelling} -> Confirmed`).toBe(false);
    }
  });

  it('refuses to move a collected order backwards', () => {
    expect(canTransition('Completed', 'Ready').allowed).toBe(false);
    expect(canTransition('Completed', 'Pending').allowed).toBe(false);
  });

  it('refuses to skip a stage', () => {
    // placed -> collected would mark food handed over that was never marked
    // cooked, which corrupts the day's numbers.
    const check = canTransition('Pending', 'Completed');
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/one stage at a time/i);
  });

  it('refuses to move backwards', () => {
    const check = canTransition('Ready', 'Confirmed');
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/backwards/i);
  });

  it('refuses a no-op move', () => {
    expect(canTransition('Confirmed', 'Confirmed').allowed).toBe(false);
    expect(canTransition('Pending', 'Pending').allowed).toBe(false);
  });

  it('refuses cancelling an already-collected order', () => {
    expect(canTransition('Completed', 'Cancelled').allowed).toBe(false);
  });

  it('refuses cancelling twice', () => {
    expect(canTransition('Cancelled', 'Cancelled').allowed).toBe(false);
  });

  it('refuses an empty or missing target', () => {
    expect(canTransition('Pending', '').allowed).toBe(false);
    expect(canTransition('Pending', null).allowed).toBe(false);
    expect(canTransition('Pending', undefined).allowed).toBe(false);
  });

  it('always explains a refusal in words staff can read', () => {
    // A disabled button with no reason is how staff ring the owner instead.
    const refusals = [
      canTransition('Cancelled', 'Ready'),
      canTransition('Pending', 'Completed'),
      canTransition('Ready', 'Confirmed'),
      canTransition('Completed', 'Cancelled'),
      canTransition('Pending', 'Pending'),
    ];
    for (const check of refusals) {
      expect(check.allowed).toBe(false);
      expect(check.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('canTransition — unknown input', () => {
  it('normalises a missing current status rather than throwing', () => {
    // A WebSocket frame or an older order can arrive without a status; it must
    // be judged by the same rules, not crash the board.
    expect(() => canTransition(null, 'Confirmed')).not.toThrow();
    expect(canTransition(null, 'Confirmed').allowed).toBe(true);
  });

  it('treats an unrecognised status as the first stage', () => {
    expect(canTransition('WAT', 'Confirmed').allowed).toBe(true);
  });
});

describe('allowedTransitions', () => {
  it('offers exactly the legal moves from a live order', () => {
    const allowed = allowedTransitions('Pending');
    expect(allowed).toContain('confirmed');
    expect(allowed).toContain('cancelled');
    expect(allowed).not.toContain('ready');
    expect(allowed).not.toContain('collected');
    expect(allowed).not.toContain('placed');
  });

  it('offers nothing forward for a cancelled order', () => {
    expect(allowedTransitions('Cancelled')).toEqual([]);
  });

  it('offers nothing at all for a collected order', () => {
    expect(allowedTransitions('Completed')).toEqual([]);
  });

  it('offers exactly the next stage plus cancel for a ready order', () => {
    expect(allowedTransitions('Ready').sort()).toEqual(['cancelled', 'collected']);
  });

  it('never offers a move that canTransition refuses', () => {
    for (const from of ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled']) {
      for (const to of allowedTransitions(from)) {
        expect(canTransition(from, to).allowed, `${from} -> ${to}`).toBe(true);
      }
    }
  });
});
