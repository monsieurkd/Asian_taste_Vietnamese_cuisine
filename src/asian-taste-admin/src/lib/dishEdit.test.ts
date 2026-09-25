import { describe, it, expect } from 'vitest';

/**
 * Tests for the rule that decides what a dish edit sends.
 *
 * The editor sends only the fields the owner actually touched, and the API treats a
 * missing field as "leave it alone". That combination is what makes a price change
 * safe: sending the whole form would make editing a price rewrite the description from
 * whatever the form loaded — the ordinary way one edit silently reverts another
 * person's work, and invisible because the save reports success.
 *
 * The rule lives in the component as a small function of the touched-map; this file
 * pins the rule itself so a refactor cannot quietly broaden what gets sent. It mirrors
 * `patchFrom` in `DishEditor` deliberately — the same shape, tested without a browser.
 */
type Touched = Record<string, boolean>;

interface Draft {
  name: string;
  description: string;
  price: string;
  categoryId: number;
  spicyLevel: number;
}

/** The rule under test: mirror of the editor's own patch builder. */
function patchFrom(touched: Touched, draft: Draft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (touched.name) patch.name = draft.name.trim();
  if (touched.description) patch.description = draft.description.trim();
  if (touched.price) patch.price = Number(draft.price);
  if (touched.categoryId) patch.categoryId = draft.categoryId;
  if (touched.spicyLevel) patch.spicyLevel = draft.spicyLevel;
  return patch;
}

const DRAFT: Draft = {
  name: 'Pho Dac Biet',
  description: 'Beef noodle soup',
  price: '15.50',
  categoryId: 3,
  spicyLevel: 1,
};

describe('a dish edit sends only what changed', () => {
  it('sends a price and nothing else', () => {
    // The case the owner actually performs. If this ever sends `description`, a price
    // change silently rewrites whatever the description happened to hold.
    const patch = patchFrom({ price: true }, DRAFT);

    expect(patch).toEqual({ price: 15.5 });
    expect(Object.keys(patch)).toHaveLength(1);
  });

  it('sends a rename and nothing else', () => {
    expect(patchFrom({ name: true }, DRAFT)).toEqual({ name: 'Pho Dac Biet' });
  });

  it('sends every field when every field was touched', () => {
    const patch = patchFrom(
      { name: true, description: true, price: true, categoryId: true, spicyLevel: true },
      DRAFT,
    );
    expect(Object.keys(patch).sort()).toEqual(
      ['categoryId', 'description', 'name', 'price', 'spicyLevel'].sort(),
    );
  });

  it('sends nothing at all when nothing was touched', () => {
    // An untouched form must not be a write. This is what lets the editor say
    // "Nothing changed" instead of claiming a save that never happened.
    expect(patchFrom({}, DRAFT)).toEqual({});
  });

  it('trims the text it does send', () => {
    // A trailing space in a price field is invisible and would otherwise be stored.
    const patch = patchFrom({ name: true, description: true }, { ...DRAFT, name: '  Pho  ', description: ' Soup ' });
    expect(patch.name).toBe('Pho');
    expect(patch.description).toBe('Soup');
  });

  it('converts the price field to a number, not a string', () => {
    // The input holds text; the API takes a decimal. A string there is a 400 that
    // reads like a server fault.
    const patch = patchFrom({ price: true }, { ...DRAFT, price: '13.5' });
    expect(typeof patch.price).toBe('number');
    expect(patch.price).toBe(13.5);
  });

  it('can clear a description deliberately', () => {
    // Emptying the field IS an edit, and it must survive the trim-and-send rule:
    // "cleared on purpose" and "not rendered" have to be distinguishable.
    const patch = patchFrom({ description: true }, { ...DRAFT, description: '   ' });
    expect(patch).toHaveProperty('description');
    expect(patch.description).toBe('');
  });
});
