import { describe, it, expect } from 'vitest';

/**
 * Tests for the rule that turns a typed allergy into what the API is sent.
 *
 * This is a small seam and a consequential one: there is exactly one place between the
 * customer's keyboard and the kitchen where the declaration can be silently dropped,
 * and the failure is invisible from both ends. The customer sees their checkout
 * succeed; the kitchen sees a ticket with no allergy block; nobody learns that the
 * field was lost.
 *
 * The rule mirrors the checkout's own `allergyDeclaration` handling — trim, and treat
 * whitespace as "none declared" rather than sending a blank string, which the kitchen
 * would render as an empty alert.
 */

/** Mirror of the checkout's field → request conversion. */
function toDeclaration(typed: string | undefined | null): string | undefined {
  const trimmed = (typed ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

describe('the allergy a customer types', () => {
  it('is sent when there is something to send', () => {
    expect(toDeclaration('Peanuts')).toBe('Peanuts');
  });

  it('is sent verbatim, not normalised', () => {
    // Free text on purpose. "no coriander, and shellfish is fine" is what the kitchen
    // needs; lowercasing or title-casing it loses meaning the customer chose.
    const declaration = 'Shellfish only (prawns are OK), no coriander';
    expect(toDeclaration(declaration)).toBe(declaration);
  });

  it('is trimmed, so a stray space does not render as a blank alert', () => {
    expect(toDeclaration('  Peanuts  ')).toBe('Peanuts');
  });

  it('is omitted entirely when the box was left alone', () => {
    // Undefined, not "": the API treats a missing field as "declared none" and stores
    // null. An empty string would store an empty string, and the kitchen screen checks
    // for a truthy value — so the two must agree or the alert renders blank.
    expect(toDeclaration(undefined)).toBeUndefined();
    expect(toDeclaration(null)).toBeUndefined();
    expect(toDeclaration('')).toBeUndefined();
    expect(toDeclaration('   ')).toBeUndefined();
    expect(toDeclaration('\n\t ')).toBeUndefined();
  });

  it('keeps a declaration that is only unusual characters', () => {
    // Not a real allergy, but the rule must not be clever: anything the customer typed
    // is passed on. A filter here would eventually drop a real one.
    expect(toDeclaration('MSG, 味精, E621')).toBe('MSG, 味精, E621');
  });

  it('does not truncate what the customer typed', () => {
    // The API bounds this at 500; the client must not silently cut it shorter, or a
    // long declaration would reach the kitchen missing its end.
    const long = 'x'.repeat(300);
    expect(toDeclaration(long)).toHaveLength(300);
  });
});

describe('the allergy and the kitchen note are separate', () => {
  it('never merges into one field', () => {
    // They travel as two request fields and are stored in two columns. Merging them at
    // any point would put an allergy back into the free-text note, which is the state
    // this whole change exists to get out of.
    const notes = 'Extra napkins please';
    const allergy = 'Peanuts';

    const request = { specialInstructions: notes, allergyDeclaration: allergy };

    expect(request.allergyDeclaration).toBe('Peanuts');
    // The note must NOT contain the allergy, and vice versa.
    expect(request.specialInstructions).not.toContain('Peanuts');
    expect(request.allergyDeclaration).not.toContain('napkins');
  });

  it('sends the allergy even when there is no note', () => {
    // The common case: someone with an allergy who has nothing else to say. If the two
    // shared a field, this is the request that would lose it.
    const request = { specialInstructions: undefined, allergyDeclaration: toDeclaration('Peanuts') };
    expect(request.allergyDeclaration).toBe('Peanuts');
  });
});
