import { describe, it, expect } from 'vitest';
import { isCancelled, STAGES, stageIndex } from './orderLifecycle';
// Relative rather than the `@/` alias other files use: the test-wiring guardrail
// reads every non-relative specifier in a spec as a package it must be able to
// install, and fails the commit with "imports '@/types/menu' but package.json
// does not declare it". Keeping spec imports relative is what that guardrail
// expects of a test file.
import type { OrderStatus } from '../types/menu';

/**
 * Tests for the customer-side view of the order lifecycle.
 *
 * The customer's tracker is deliberately coarser than the console's: three
 * stages, because the shop works it that way. These tests exist because the
 * stages fold API values the customer never sees — and because `Completed`
 * means something different on each side (see `stageIndex` below), which is
 * exactly the kind of thing that breaks silently.
 */
describe('stageIndex', () => {
  it('walks the three customer stages', () => {
    expect(stageIndex('Pending')).toBe(0);
    expect(stageIndex('Confirmed')).toBe(1);
    expect(stageIndex('Ready')).toBe(2);
  });

  it('treats Preparing as Confirmed', () => {
    // The kitchen starts cooking the moment it accepts, so the customer is
    // never shown a separate "preparing" step that only exists in the API.
    expect(stageIndex('Preparing')).toBe(stageIndex('Confirmed'));
  });

  it('keeps a collected order on the last stage rather than past the end', () => {
    // `Completed` is the handover. An order in that state must still read as
    // Ready to collect — it must not fall off the tracker or show as unplaced.
    expect(stageIndex('Completed')).toBe(STAGES.length - 1);
    expect(stageIndex('Completed')).toBe(stageIndex('Ready'));
  });

  it('reports cancellation as its own thing, not as a stage', () => {
    expect(stageIndex('Cancelled')).toBe(-1);
    expect(isCancelled('Cancelled')).toBe(true);
  });

  it('defaults to the first stage when there is no status yet', () => {
    // The confirmation screen renders before the order has loaded.
    expect(stageIndex(undefined)).toBe(0);
  });

  it('covers every status the API can send', () => {
    const statuses: OrderStatus[] = [
      'Pending',
      'Confirmed',
      'Preparing',
      'Ready',
      'Completed',
      'Cancelled',
    ];
    for (const status of statuses) {
      const index = stageIndex(status);
      if (status === 'Cancelled') {
        expect(index).toBe(-1);
      } else {
        expect(STAGES[index]).toBeDefined();
      }
    }
  });
});

describe('the customer vocabulary', () => {
  it('uses the shop words, not the API words', () => {
    expect(STAGES.map((s) => s.label)).toEqual(['Placed', 'Confirmed', 'Ready']);
  });

  it('says where to collect the food at the end', () => {
    // The last stage is the one that has to carry the address.
    expect(STAGES[STAGES.length - 1].description).toContain('329 Henley Beach Rd');
  });
});
