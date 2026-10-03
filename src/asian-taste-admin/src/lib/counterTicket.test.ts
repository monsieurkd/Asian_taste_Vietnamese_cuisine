import { describe, it, expect } from 'vitest';
import {
  MAX_QUANTITY,
  addLine,
  clearTicket,
  hasOptions,
  loadOrder,
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

describe('loading an existing order onto the counter', () => {
  // "Add a dish to an order" is the same screen as "take an order": once an existing order
  // is a ticket, the dish grid, the options panel and the quantity rules all apply
  // unchanged, and only the save endpoint differs. This is the conversion that makes that
  // true, so a mistake here is a wrong bill for a customer who is standing there.

  it('turns each order line into a ticket line', () => {
    const ticket = loadOrder({
      items: [
        { id: 7, menuItemId: 17, menuItemName: 'Pho Bo', quantity: 2, unitPrice: 15.5 },
      ],
    });
    expect(ticket).toHaveLength(1);
    expect(ticket[0]).toMatchObject({ menuItemId: 17, name: 'Pho Bo', quantity: 2, unitPrice: 15.5 });
    expect(ticket[0].note).toBe('');
    expect(ticket[0].modifiers).toEqual([]);
  });

  it('keeps the STORED unit price rather than recomputing it', () => {
    // The customer was quoted this figure. Re-pricing on load would show a total nobody
    // agreed to before a single dish had been added.
    const ticket = loadOrder({
      items: [{ id: 1, menuItemId: 5, menuItemName: 'Laksa', quantity: 1, unitPrice: 12.34 }],
    });
    expect(ticket[0].unitPrice).toBe(12.34);
  });

  it('rebuilds modifiers so the line can be re-priced and re-sent', () => {
    const ticket = loadOrder({
      items: [
        {
          id: 3,
          menuItemId: 9,
          menuItemName: 'Pho',
          quantity: 1,
          unitPrice: 19.5,
          modifiers: [
            { modifierId: 65, modifierName: 'Extra protein', priceAdjustment: 4 },
            { modifierId: 66, modifierName: 'Extra soup', priceAdjustment: 3 },
          ],
        },
      ],
    });
    expect(ticket[0].modifiers.map((m) => m.id)).toEqual([65, 66]);
    expect(ticket[0].modifiers.map((m) => m.name)).toEqual(['Extra protein', 'Extra soup']);
    expect(modifierTotal(ticket[0].modifiers)).toBe(7);
  });

  it('carries the customer instruction across', () => {
    const ticket = loadOrder({
      items: [
        { id: 1, menuItemId: 1, menuItemName: 'Banh Mi', quantity: 1, unitPrice: 9, specialInstructions: 'no coriander' },
      ],
    });
    expect(ticket[0].note).toBe('no coriander');
  });

  it('gives every line a unique, stable key', () => {
    const order = {
      items: [
        { id: 11, menuItemId: 1, menuItemName: 'A', quantity: 1, unitPrice: 5 },
        { id: 12, menuItemId: 2, menuItemName: 'B', quantity: 1, unitPrice: 6 },
      ],
    };
    const first = loadOrder(order).map((l) => l.key);
    const second = loadOrder(order).map((l) => l.key);
    expect(new Set(first).size).toBe(2);
    // Stable across loads, so a re-render does not reset quantities the operator typed.
    expect(first).toEqual(second);
  });

  it('handles an order with no lines', () => {
    expect(loadOrder({ items: [] })).toEqual([]);
  });

  it('handles a null modifiers array, which the API sends for an unmodified dish', () => {
    const ticket = loadOrder({
      items: [{ id: 1, menuItemId: 1, menuItemName: 'A', quantity: 1, unitPrice: 5, modifiers: null }],
    });
    expect(ticket[0].modifiers).toEqual([]);
  });

  it('round-trips: an order loaded and sent back unchanged keeps its dishes and quantities', () => {
    // The cheapest possible guard against loading something that cannot be saved again.
    const order = {
      items: [
        { id: 1, menuItemId: 17, menuItemName: 'Pho', quantity: 2, unitPrice: 15.5, modifiers: [{ modifierId: 65, modifierName: 'Extra protein', priceAdjustment: 4 }] },
        { id: 2, menuItemId: 16, menuItemName: 'Banh Mi', quantity: 1, unitPrice: 9 },
      ],
    };
    const ticket = loadOrder(order);
    const request = toRequest(ticket, {});
    expect(request.items).toEqual([
      { menuItemId: 17, quantity: 2, specialInstructions: undefined, modifierIds: [65] },
      { menuItemId: 16, quantity: 1, specialInstructions: undefined, modifierIds: [] },
    ]);
  });

  it('adds a dish to a loaded order without disturbing the lines already on it', () => {
    const ticket = loadOrder({
      items: [{ id: 1, menuItemId: 17, menuItemName: 'Pho', quantity: 1, unitPrice: 15.5 }],
    });
    const grown = addLine(ticket, dish({ id: 30, name: 'Spring roll', price: 6 }));

    expect(grown).toHaveLength(2);
    expect(grown[0]).toMatchObject({ menuItemId: 17, quantity: 1 });
    expect(grown[1]).toMatchObject({ menuItemId: 30, name: 'Spring roll', quantity: 1 });
    expect(ticketTotal(grown)).toBe(21.5);
  });

  it('bumps an existing line when the dish is already on the order', () => {
    // Adding "one more pho" must read as two pho to the kitchen, not two lines of pho.
    const ticket = loadOrder({
      items: [{ id: 1, menuItemId: 17, menuItemName: 'Pho Bo', quantity: 1, unitPrice: 15.5 }],
    });
    const grown = addLine(ticket, dish({ id: 17, name: 'Pho Bo', price: 15.5 }));
    expect(grown).toHaveLength(1);
    expect(grown[0].quantity).toBe(2);
  });

  it('removing a line from a loaded order leaves the rest intact', () => {
    const ticket = loadOrder({
      items: [
        { id: 1, menuItemId: 17, menuItemName: 'Pho', quantity: 1, unitPrice: 15.5 },
        { id: 2, menuItemId: 16, menuItemName: 'Banh Mi', quantity: 1, unitPrice: 9 },
      ],
    });
    const trimmed = removeLine(ticket, ticket[0].key);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0].menuItemId).toBe(16);
  });
});

describe('re-pricing a line when its options are edited', () => {
  // Editing a line's options must price from the DISH, not from the line's current total.
  // Pricing on top of a total that already contains the old options would charge for them
  // twice — the same money bug the phone-edit path had to avoid (§26).

  it('records the dish price on a line when it is added', () => {
    const t = addLine([], dish({ id: 5, price: 15.5 }), [modifier({ id: 1, priceAdjustment: 4 })]);
    expect(t[0].basePrice).toBe(15.5);
    expect(t[0].unitPrice).toBe(19.5);
  });

  it('re-prices from the base when an option is REMOVED', () => {
    const line = addLine([], dish({ price: 15.5 }), [modifier({ id: 1, priceAdjustment: 4 })])[0];
    const updated = { ...line, modifiers: [], unitPrice: pricedUnit(line.basePrice!, []) };
    expect(updated.unitPrice).toBe(15.5);
  });

  it('re-prices from the base when an option is REPLACED, not compounded', () => {
    // The regression this exists for: 15.50 + 4.00 = 19.50, then swapping to +3.00 must be
    // 18.50 — NOT 19.50 + 3.00 = 22.50, which is what pricing off unitPrice would give.
    const line = addLine([], dish({ price: 15.5 }), [modifier({ id: 1, priceAdjustment: 4 })])[0];
    const updated = { ...line, unitPrice: pricedUnit(line.basePrice!, [modifier({ id: 2, priceAdjustment: 3 })]) };
    expect(updated.unitPrice).toBe(18.5);
    expect(updated.unitPrice).not.toBe(22.5);
  });

  it('derives a base price when loading an existing order that has modifiers', () => {
    const t = loadOrder({
      items: [
        {
          id: 1, menuItemId: 17, menuItemName: 'Pho', quantity: 1, unitPrice: 19.5,
          modifiers: [{ modifierId: 65, modifierName: 'Extra protein', priceAdjustment: 4 }],
        },
      ],
    });
    // 19.50 charged, 4.00 of it the option -> the dish itself is 15.50.
    expect(t[0].basePrice).toBe(15.5);
    expect(t[0].unitPrice).toBe(19.5);
  });

  it('derives the same base for a loaded line with no modifiers', () => {
    const t = loadOrder({ items: [{ id: 1, menuItemId: 16, menuItemName: 'Banh Mi', quantity: 1, unitPrice: 9 }] });
    expect(t[0].basePrice).toBe(9);
  });

  it('rounds the derived base to cents', () => {
    // A float artefact here becomes a wrong number on a bill the customer reads.
    const t = loadOrder({
      items: [{ id: 1, menuItemId: 1, menuItemName: 'X', quantity: 1, unitPrice: 20.15, modifiers: [{ modifierId: 1, modifierName: 'Y', priceAdjustment: 0.1 }] }],
    });
    expect(t[0].basePrice).toBe(20.05);
  });
});
