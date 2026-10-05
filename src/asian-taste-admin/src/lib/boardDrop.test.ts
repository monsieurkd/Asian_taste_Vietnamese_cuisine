import { describe, it, expect } from 'vitest';
// Relative rather than the `@shared` alias: the test-wiring guardrail reads every
// non-relative specifier in a spec as a package the app must declare, and `@shared`
// is a path alias, not a dependency.
import { dropCheck } from './boardDrop';
import { STATUS_ORDER, type StatusKey } from '../../../shared/lib/orderStatus';

/**
 * Tests for what a DRAG across the board's columns may do.
 *
 * The board's button walks forward one stage and refuses everything else. The drag is the
 * deliberate correction gesture: the owner asked for backwards moves and column reordering,
 * while keeping the forward skip that would mark food handed over before it was cooked.
 */
describe('dropCheck — forward', () => {
  it('allows one stage forward', () => {
    expect(dropCheck('placed', 'confirmed').allowed).toBe(true);
    expect(dropCheck('confirmed', 'ready').allowed).toBe(true);
  });

  it('refuses a skip, with the same reason the button guard gives', () => {
    const check = dropCheck('placed', 'ready');
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/one stage at a time/i);
  });

  it('normalises the API casing before judging', () => {
    expect(dropCheck('Pending', 'Confirmed').allowed).toBe(true);
    expect(dropCheck('pending', 'ready').allowed).toBe(false);
  });
});

describe('dropCheck — backwards', () => {
  it('allows one stage back', () => {
    expect(dropCheck('confirmed', 'placed').allowed).toBe(true);
    expect(dropCheck('ready', 'confirmed').allowed).toBe(true);
  });

  it('allows stepping back more than one stage', () => {
    // A ticket marked ready that was never accepted is dragged straight back to New. The
    // dishes are untouched, so the move is safe however many columns it crosses.
    expect(dropCheck('ready', 'placed').allowed).toBe(true);
  });
});

describe('dropCheck — edges', () => {
  it('treats a drop on the same column as allowed (it is a reorder)', () => {
    for (const stage of ['placed', 'confirmed', 'ready'] as StatusKey[]) {
      expect(dropCheck(stage, stage).allowed).toBe(true);
    }
  });

  it('refuses to move a finished order', () => {
    expect(dropCheck('collected', 'confirmed').allowed).toBe(false);
    expect(dropCheck('cancelled', 'placed').allowed).toBe(false);
  });

  it('refuses a drop onto a closed stage', () => {
    expect(dropCheck('placed', 'collected').allowed).toBe(false);
    expect(dropCheck('placed', 'cancelled').allowed).toBe(false);
  });

  it('is the button guard, relaxed only for backwards moves', () => {
    const stages = ['placed', 'confirmed', 'ready'] as StatusKey[];
    for (const from of stages) {
      for (const to of stages) {
        const forwardSkip = STATUS_ORDER.indexOf(to) > STATUS_ORDER.indexOf(from) + 1;
        expect(dropCheck(from, to).allowed).toBe(!forwardSkip);
      }
    }
  });
});
