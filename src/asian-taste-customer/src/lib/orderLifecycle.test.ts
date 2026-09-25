import { describe, it, expect } from 'vitest';
import { isCancelled, STAGES, stageIndex } from './orderLifecycle';
// Relative rather than the `@/` alias other files use: the test-wiring guardrail
// reads every non-relative specifier in a spec as a package it must be able to
// install, and fails the commit with "imports '@/types/menu' but package.json
// does not declare it". Keeping spec imports relative is what that guardrail
// expects of a test file.
import { apiStatusValue, statusKey } from '../../../shared/lib/orderStatus';

/**
 * Tests for the customer-side view of the order tracker.
 *
 * The tracker once kept its own three-stage list, which meant the console and the
 * storefront could disagree about the same order — and they did: the last stage
 * meant "Ready" to the customer and "Collected" to the shop, so an order already
 * handed over still read as waiting on the counter. These tests pin the tracker to
 * the one shared vocabulary, and pin the one place the two audiences genuinely
 * differ: cancellation.
 */
describe('stageIndex', () => {
  it('walks the shared stages in order', () => {
    expect(stageIndex('Pending')).toBe(0);
    expect(stageIndex('Confirmed')).toBe(1);
    expect(stageIndex('Ready')).toBe(2);
    expect(stageIndex('Completed')).toBe(3);
  });

  it('treats Preparing as Confirmed', () => {
    // The kitchen starts cooking the moment it accepts, so the customer is
    // never shown a separate "preparing" step that only exists in the API.
    expect(stageIndex('Preparing')).toBe(stageIndex('Confirmed'));
  });

  it('keeps a collected order on the handover stage, not on Ready', () => {
    // `Completed` is the API value the handover is stored as. Reading it as Ready
    // is how a collected order came back to the counter on the customer's screen.
    expect(stageIndex('Completed')).toBe(STAGES.length - 1);
    expect(stageIndex('Completed')).not.toBe(stageIndex('Ready'));
    expect(STAGES[STAGES.length - 1].key).toBe('collected');
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
    const statuses = [
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

describe('the shared vocabulary', () => {
  it('uses the same stage keys the console uses', () => {
    // The two apps read one list from `src/shared`. Typing it out again is the
    // mistake this asserts against.
    expect(STAGES.map((s) => s.key)).toEqual(['placed', 'confirmed', 'ready', 'collected']);
  });

  it('uses the shop words, not the API words', () => {
    expect(STAGES.map((s) => s.label)).toEqual(['New', 'Cooking', 'Ready', 'Collected']);
  });

  it('says where to collect the food at the ready stage', () => {
    // The stage the customer acts on is the one that has to carry the address.
    const ready = STAGES.find((s) => s.key === 'ready');
    expect(ready?.description).toContain('329 Henley Beach Rd');
  });

  it('describes every stage, so no tracker row renders blank', () => {
    for (const stage of STAGES) {
      expect(stage.description.length).toBeGreaterThan(0);
    }
  });

  it('stores the handover under the API value the API actually has', () => {
    // The shop says "Collected"; the API only knows "Completed".
    expect(apiStatusValue('collected')).toBe('Completed');
    expect(statusKey(apiStatusValue('collected'))).toBe('collected');
  });
});
