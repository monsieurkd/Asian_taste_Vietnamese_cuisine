import { describe, it, expect } from 'vitest';
import { refundEligibility } from './refund';

/**
 * Tests for when the console offers a refund.
 *
 * The endpoint is not the risk here — offering it on the wrong order is. Every case
 * below is a way to move money that should not move, or to leave an order reading as
 * paid after the money has gone back.
 */
describe('refundEligibility — when a refund is offered', () => {
  it('offers it for a captured card charge', () => {
    const result = refundEligibility('Succeeded', 'Card', 'pi_abc123');
    expect(result.canRefund).toBe(true);
    expect(result.reason).toBe('');
  });

  it('still offers it when part has already gone back', () => {
    // A partial refund leaves a refundable remainder, so the button must stay.
    expect(refundEligibility('PartiallyRefunded', 'Card', 'pi_abc123').canRefund).toBe(true);
  });
});

describe('refundEligibility — when it is withheld', () => {
  it('does not offer a button for an already-refunded order', () => {
    const result = refundEligibility('Refunded', 'Card', 'pi_abc123');
    expect(result.canRefund).toBe(false);
    expect(result.alreadyRefunded).toBe(true);
  });

  it('does not offer one for a card charge that never captured', () => {
    // Declined, unfinished 3-D Secure, still pending, cancelled. There is no charge to
    // reverse, and offering the button says the app cannot tell.
    for (const status of ['Failed', 'RequiresAction', 'Pending', 'Canceled', 'Processing', null, undefined, '']) {
      expect(refundEligibility(status, 'Card', 'pi_abc123').canRefund).toBe(false);
    }
  });

  it('does not offer one for a cash order, and says why', () => {
    const result = refundEligibility(null, 'Cash', null);
    expect(result.canRefund).toBe(false);
    expect(result.reason).toMatch(/counter/i);
  });

  it('withholds the button when the payment reference is missing', () => {
    // The quiet failure: the refund is issued against this id, so without it the call
    // cannot match the order — the money moves at Stripe and the order keeps reading as
    // paid, so the day's takings stay overstated.
    const result = refundEligibility('Succeeded', 'Card', null);
    expect(result.canRefund).toBe(false);
    expect(result.reason).toMatch(/Stripe/);
  });

  it('withholds it for an empty reference, not just a missing one', () => {
    // An empty string is what a nullable column returns through JSON in some shapes,
    // and it must not read as "has a reference".
    expect(refundEligibility('Succeeded', 'Card', '').canRefund).toBe(false);
  });

  it('explains the withholding rather than leaving staff guessing', () => {
    // A hidden button with no explanation is the thing that sends someone to the Stripe
    // dashboard not knowing why they had to.
    for (const [status, method, id] of [
      [null, 'Cash', null],
      ['Failed', 'Card', 'pi_x'],
      ['Succeeded', 'Card', null],
    ] as const) {
      const result = refundEligibility(status, method, id);
      if (!result.canRefund && !result.alreadyRefunded) {
        expect(result.reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('refundEligibility — casing', () => {
  it('accepts the status however the API spells it', () => {
    expect(refundEligibility('succeeded', 'card', 'pi_x').canRefund).toBe(true);
    expect(refundEligibility('REFUNDED', 'CARD', 'pi_x').alreadyRefunded).toBe(true);
  });
});
