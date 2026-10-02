import { describe, it, expect } from 'vitest';
import {
  MAX_QUANTITY,
  addLine,
  clearTicket,
  hasOptions,
  modifierTotal,
  pricedUnit,
  removeLine,
  setQuantity,
  ticketItemCount,
  ticketTotal,
  toRequest,
  toggleModifier,
  unmetRequiredGroup,
} from './counterTicket';
import type { MenuItemDetail, Modifier, ModifierGroup } from '../api/menuApi';

/**
 * Tests for the counter screen's running ticket.
 *
 * The person using this has a customer in front of them, so the rules that matter are the
 * ones where a mistake costs money or sends the wrong food:
 *
 *   * **Prices.** The screen shows a total; the request must not carry one. If the total
 *     ever became an input, a tampered or clipped request could set its own bill.
 *   * **Options.** The same dish with different options is two lines. Merging them would
 *     drop a choice, and the customer gets the wrong bowl.
 *   * **Required groups.** A dish that needs a choice cannot be added without one, and
 *     the refusal has to name the group or the staff member hunts for it.
 */

function modifier(overrides: Partial<Modifier> = {}): Modifier {
  return {
    id: 1,
    modifierGroupId: 10,
    name: 'Extra spicy',
    priceAdjustment: 0,
    displayOrder: 0,
    isDefault: false,
    ...overrides,
  };
}

function group(overrides: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id: 10,
    name: 'Spice level',
    minRequired: 0,
    maxAllowed: 1,
    minSelect: 0,
    maxSelect: 1,
    isRequired: false,
    displayOrder: 0,
    modifiers: [],
    ...overrides,
  };
}

function dish(overrides: Partial<MenuItemDetail> = {}): MenuItemDetail {
  // The fields here mirror a REAL response from GET /admin/menu/items, field for field.
  //
  // This fixture used to carry `isActive`, `isSpicy` and a group-level `isActive` — none
  // of which that endpoint sends. So the suite was testing a shape that could not occur,
  // and it passed against code that could not work. A fixture that invents its own
  // contract is worse than no fixture: it is how a whole screen shipped empty with a
  // green suite. If this ever fails to match the API, fix the API or the type, never the
  // fixture.
  return {
    id: 100,
    name: 'Pho Bo',
    price: 17,
    basePrice: 17,
    categoryId: 1,
    categoryName: 'Noodles',
    isActive: true,
    isAvailable: true,
    isPopular: false,
    spicyLevel: 0,
    isVegetarian: false,
    isVegan: false,
    isGlutenFree: false,
    modifierGroups: [],
    ...overrides,
  };
}

describe('pricing', () => {
  it('adds the option prices to the dish', () => {
    expect(modifierTotal([modifier({ priceAdjustment: 1.5 }), modifier({ id: 2, priceAdjustment: 2 })])).toBe(3.5);
    expect(pricedUnit(17, [modifier({ priceAdjustment: 1.5 })])).toBe(18.5);
  });

  it('keeps the unit price to whole cents', () => {
    // These are GST-inclusive retail prices shown as a figure to hand over; a float
    // artefact here is a wrong number on a screen the customer is reading.
    expect(pricedUnit(0.1, [modifier({ priceAdjustment: 0.2 })])).toBe(0.3);
  });

  it('multiplies out across the lines', () => {
    const lines = addLine(addLine([], dish({ price: 17 })), dish({ id: 101, name: 'Laksa', price: 19.5 }));
    expect(ticketTotal(setQuantity(lines, lines[1].key, 2))).toBe(56);
  });

  it('counts units rather than lines for the item badge', () => {
    const lines = addLine(addLine([], dish()), dish({ id: 101, name: 'Laksa', price: 19.5 }));
    expect(ticketItemCount(setQuantity(lines, lines[0].key, 3))).toBe(4);
  });

  it('is zero for an empty ticket', () => {
    expect(ticketTotal(clearTicket())).toBe(0);
  });
});

describe('adding dishes', () => {
  it('adds a dish as its own line', () => {
    const lines = addLine([], dish());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ menuItemId: 100, name: 'Pho Bo', quantity: 1, unitPrice: 17 });
  });

  it('merges an identical dish rather than listing it twice', () => {
    // Two portions of the same pho with the same options is one line of two — which is
    // how the kitchen wants to read it.
    const lines = addLine(addLine([], dish()), dish());
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });

  it('keeps the same dish with different options as two lines', () => {
    // Merging these would drop one customer's choice, which is how the wrong bowl is made.
    const lines = addLine(
      addLine([], dish(), [modifier({ id: 1, name: 'Mild' })]),
      dish(),
      [modifier({ id: 2, name: 'Extra spicy' })],
    );

    expect(lines).toHaveLength(2);
    expect(lines[0].modifiers[0].name).toBe('Mild');
    expect(lines[1].modifiers[0].name).toBe('Extra spicy');
  });

  it('keeps the same dish with different notes as two lines', () => {
    const lines = addLine(addLine([], dish(), [], 'No onion'), dish(), [], 'Extra onion');
    expect(lines).toHaveLength(2);
  });

  it('never exceeds the quantity the API accepts', () => {
    // The API refuses a line above ten, so the screen must not be able to build one that
    // it will then be told off for.
    let lines = addLine([], dish(), [], '', 10);
    lines = addLine(lines, dish());
    expect(lines[0].quantity).toBe(MAX_QUANTITY);
  });
});

describe('changing the ticket', () => {
  it('sets a quantity, and removes the line at zero', () => {
    const lines = addLine([], dish());
    expect(setQuantity(lines, lines[0].key, 4)[0].quantity).toBe(4);
    expect(setQuantity(lines, lines[0].key, 0)).toHaveLength(0);
  });

  it('removes a line by key', () => {
    const lines = addLine(addLine([], dish()), dish({ id: 101, name: 'Laksa' }));
    expect(removeLine(lines, lines[0].key)).toHaveLength(1);
  });
});

describe('the request body', () => {
  it('sends dishes and options, and NO prices', () => {
    const lines = addLine([], dish({ price: 17 }), [modifier({ id: 7, priceAdjustment: 3 })]);

    const request = toRequest(lines, { customerName: 'Sam' });

    expect(request.items).toEqual([
      { menuItemId: 100, quantity: 1, specialInstructions: undefined, modifierIds: [7] },
    ]);

    // The whole point: the local total is a courtesy to the person at the counter, and
    // the server re-prices from the menu. Anything price-shaped here would be an input.
    const serialised = JSON.stringify(request);
    expect(serialised).not.toContain('unitPrice');
    expect(serialised).not.toContain('price');
    expect(serialised).not.toContain('total');
  });

  it('carries the note as the line instruction', () => {
    const lines = addLine([], dish(), [], 'No coriander');
    expect(toRequest(lines, {}).items[0].specialInstructions).toBe('No coriander');
  });

  it('passes through the counter fields it was given', () => {
    const request = toRequest(addLine([], dish()), { orderType: 'DineIn', tableNumber: '4', markedPaid: true });
    expect(request).toMatchObject({ orderType: 'DineIn', tableNumber: '4', markedPaid: true });
  });
});

describe('options', () => {
  const spice = group({
    id: 10,
    name: 'Spice level',
    minRequired: 1,
    maxAllowed: 1,
    modifiers: [modifier({ id: 1, name: 'Mild' }), modifier({ id: 2, name: 'Hot' })],
  });

  const extras = group({
    id: 11,
    name: 'Extras',
    minRequired: 0,
    maxAllowed: 2,
    modifiers: [modifier({ id: 3, name: 'Egg' }), modifier({ id: 4, name: 'Beansprouts' }), modifier({ id: 5, name: 'Chilli oil' })],
  });

  const withGroups = dish({ modifierGroups: [spice, extras] });

  it('refuses a dish whose required group is unanswered, and names the group', () => {
    // Naming it is the point: "choose an option" leaves the staff member hunting, and the
    // customer is watching them do it.
    expect(unmetRequiredGroup(withGroups, [])).toBe('Spice level');
  });

  it('accepts the dish once the required group has a choice', () => {
    expect(unmetRequiredGroup(withGroups, [modifier({ id: 1 })])).toBeNull();
  });

  it('ignores an OPTIONAL group, which is a group with no minimum', () => {
    // This case used to read "ignores an inactive required group" and passed by setting
    // `isActive: false` on the fixture. The API has never sent a group-level isActive, so
    // the assertion was true of a shape that does not exist — and the code it justified
    // skipped EVERY group and never refused anything.
    //
    // Optional-ness is `minRequired`, and a group with no minimum is genuinely ignored.
    const optional = dish({ modifierGroups: [group({ minRequired: 0, maxAllowed: 3 })] });
    expect(unmetRequiredGroup(optional, [])).toBeNull();
  });

  it('replaces the choice in a single-select group', () => {
    // Tapping a second spice level means "that one instead" — which is what the customer
    // just said out loud.
    const selected = toggleModifier(withGroups, [modifier({ id: 1, name: 'Mild' })], modifier({ id: 2, name: 'Hot' }));
    expect(selected.map((m) => m.id)).toEqual([2]);
  });

  it('adds up to the group maximum, then replaces the oldest', () => {
    let selected = toggleModifier(withGroups, [], modifier({ id: 3 }));
    selected = toggleModifier(withGroups, selected, modifier({ id: 4 }));
    expect(selected.map((m) => m.id)).toEqual([3, 4]);

    selected = toggleModifier(withGroups, selected, modifier({ id: 5 }));
    expect(selected).toHaveLength(2);
    expect(selected.map((m) => m.id)).toEqual([4, 5]);
  });

  it('lets a choice be undone even below a group minimum', () => {
    // The minimum is enforced when the dish is ADDED. Refusing to let someone undo here
    // would trap them on a screen they cannot get out of.
    const selected = toggleModifier(withGroups, [modifier({ id: 1 }), modifier({ id: 3 })], modifier({ id: 1 }));
    expect(selected.map((m) => m.id)).toEqual([3]);
  });

  it('leaves the selection alone for a modifier it does not recognise', () => {
    // A modifier from another dish — the API would price it, but it is not this dish's.
    const selected = [modifier({ id: 1 })];
    expect(toggleModifier(withGroups, selected, modifier({ id: 999 }))).toEqual(selected);
  });
});

describe('hasOptions — the rule behind the panel', () => {
  // The counter's grid was EMPTY because it filtered dishes on a field the API never
  // sends, and then every dish that survived looked option-less for the same reason.
  // These tests exist because the screen's whole behaviour hangs on this one predicate:
  // it decides whether a tap opens a panel or drops the dish straight onto the ticket.

  it('is true for a dish with a group that has choices', () => {
    expect(hasOptions(dish({ modifierGroups: [group({ modifiers: [modifier()] })] }))).toBe(true);
  });

  it('is false for a dish with no groups at all', () => {
    expect(hasOptions(dish())).toBe(false);
  });

  it('is false for a group that HAS no choices', () => {
    // The seeded menu's "Spice level" range group carries no modifier rows by design.
    // Counting it as options would open a panel with nothing in it to tap.
    expect(hasOptions(dish({ modifierGroups: [group({ modifiers: [] })] }))).toBe(false);
  });

  it('finds the options even when an empty group comes first', () => {
    const mixed = dish({
      modifierGroups: [group({ id: 9, name: 'Spice level', modifiers: [] }), group({ id: 11, modifiers: [modifier()] })],
    });
    expect(hasOptions(mixed)).toBe(true);
  });
});
