import { describe, it, expect } from 'vitest';
import { readPayment } from './payment';

/**
 * Tests for how the console reads the money.
 *
 * The defect these exist for: the ticket printed "Paid online" for every order whose
 * payment METHOD was Card, because the API never sent the payment status at all. A
 * declined card therefore read as a completed sale, and the kitchen had no signal
 * that the customer at the counter still owed for their food.
 *
 * The tests are written as "what must the counter believe", so each one names the
 * consequence rather than the mapping.
 */
describe('readPayment — money that has been taken', () => {
  it('reads a captured charge as paid', () => {
    const reading = readPayment('Succeeded', 'Card');
    expect(reading.label).toBe('Paid online');
    expect(reading.attention).toBe(false);
  });

  it('reads a refund as a refund, not as a sale', () => {
    expect(readPayment('Refunded', 'Card').label).toBe('Refunded');
    expect(readPayment('PartiallyRefunded', 'Card').label).toBe('Partly refunded');
    // A refunded order must not be flagged as needing attention at the counter:
    // the customer is owed money, not owing it.
    expect(readPayment('Refunded', 'Card').attention).toBe(false);
  });
});

describe('readPayment — money that has not', () => {
  it('flags a declined card, and repeats the bank\'s reason', () => {
    const reading = readPayment('Failed', 'Card', 'Card was declined.');
    expect(reading.label).toBe('Payment declined');
    expect(reading.detail).toContain('Card was declined.');
    expect(reading.detail).toContain('Take payment at the counter');
    expect(reading.attention).toBe(true);
  });

  it('still flags a declined card when the bank gave no reason', () => {
    const reading = readPayment('Failed', 'Card', null);
    expect(reading.attention).toBe(true);
    expect(reading.detail).toContain('Take payment at the counter');
  });

  it('flags a charge whose 3-D Secure step was never finished', () => {
    // Otherwise this looks like an ordinary card order and the bag goes out unpaid.
    expect(readPayment('RequiresAction', 'Card').attention).toBe(true);
    expect(readPayment('Canceled', 'Card').attention).toBe(true);
  });

  it('does NOT claim a card order with no recorded payment was paid', () => {
    // The old behaviour, stated as the thing that must not happen.
    for (const status of [null, undefined, '', 'Pending']) {
      const reading = readPayment(status, 'Card');
      expect(reading.label).not.toBe('Paid online');
      expect(reading.attention).toBe(true);
    }
  });
});

describe('readPayment — cash', () => {
  it('reads a cash order as pay-at-counter with nothing to chase', () => {
    const reading = readPayment(null, 'Cash');
    expect(reading.label).toBe('Pay at counter');
    expect(reading.attention).toBe(false);
  });

  it('prefers the recorded outcome over the method when both exist', () => {
    // A cash order that was somehow charged shows what happened, because the
    // outcome is the fact and the method is only the intent.
    expect(readPayment('Succeeded', 'Cash').label).toBe('Paid online');
  });
});

describe('readPayment — unknown values', () => {
  it('treats an unrecognised status as unpaid rather than as paid', () => {
    // Failing towards "check the money" is the safe direction: the other way
    // sends food out of the shop for free.
    const reading = readPayment('SomethingNew', 'Card');
    expect(reading.label).toBe('Payment not taken');
    expect(reading.attention).toBe(true);
  });
});
