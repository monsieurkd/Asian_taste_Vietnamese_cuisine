import type { MenuItemDetail, Modifier } from "@/api/menuApi"
import type { CounterOrderItem } from "@/api/counterOrderApi"

/**
 * The running ticket on the counter screen.
 *
 * This is the logic half of a face-to-face order, kept out of the component so the rules
 * can be tested without a browser. What it has to get right is narrow but load-bearing:
 * the person using it is standing in front of a customer, so every rule that would
 * otherwise be a dialog is a rule that should have been decided here.
 *
 * Two decisions worth naming:
 *
 *   * **Prices are shown, never sent.** The screen needs a running total because the
 *     customer asks for one. The REQUEST carries dishes and quantities only — the server
 *     re-prices from the current menu (the same rule the phone-edit path uses), so a
 *     tampered request cannot set its own total. The local total is a courtesy to the
 *     person at the counter, not an input to the bill.
 *   * **Options add to the line, not to the dish.** The same dish twice with different
 *     options is two lines, and merging them would lose one set of options — which is
 *     how a customer gets the wrong bowl.
 */

/** One line of the ticket as the counter screen holds it. */
export interface TicketLineDraft {
  /** Local id, unique per line. Never sent — the server creates its own rows. */
  key: string
  menuItemId: number
  name: string
  quantity: number
  /** The chosen modifiers, held so the line can be re-rendered and re-priced. */
  modifiers: Modifier[]
  note: string
  /** Unit price WITH the modifiers applied. Display only. */
  unitPrice: number
  /**
   * The dish's price BEFORE modifiers.
   *
   * Kept so editing a line's options can re-price from the dish rather than from its
   * current total: adding a modifier to a line priced with `unitPrice` would charge for
   * every option it already had, again. Optional because a loaded order only stores the
   * final unit price — see `loadOrder`.
   */
  basePrice?: number
}

/** A modifier priced onto a dish. */
export function modifierTotal(modifiers: Modifier[]): number {
  return modifiers.reduce((sum, m) => sum + (m.priceAdjustment ?? 0), 0)
}

/**
 * The unit price of a dish with its options.
 */
export function pricedUnit(basePrice: number, modifiers: Modifier[]): number {
  // Rounded to cents because this is a GST-inclusive retail price that will be shown to a
  // customer as a figure to hand over. A float artefact here is a wrong number on screen.
  return Math.round((basePrice + modifierTotal(modifiers)) * 100) / 100
}

/** What the whole ticket comes to. */
export function ticketTotal(lines: TicketLineDraft[]): number {
  return Math.round(
    lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100,
  ) / 100
}

export function ticketItemCount(lines: TicketLineDraft[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0)
}

/**
 * Add one dish, merging into an identical line when there is one.
 *
 * Merging is done on DISH + OPTIONS + NOTE, not on dish alone. Two portions of the same
 * pho with the same options is one line of two, which is what the kitchen wants to read;
 * the same pho with different spice levels is two lines, because merging would silently
 * drop a choice the customer made.
 */
export function addLine(
  lines: TicketLineDraft[],
  dish: MenuItemDetail,
  selected: Modifier[] = [],
  note = "",
  quantity = 1,
): TicketLineDraft[] {
  const optionsKey = selectionKey(selected)
  const signature = `${dish.id}|${optionsKey}|${note.trim()}`

  const existing = lines.find((l) => lineSignature(l) === signature)
  if (existing) {
    return lines.map((l) =>
      l.key === existing.key ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + quantity) } : l,
    )
  }

  return [
    ...lines,
    {
      key: nextKey(lines),
      menuItemId: dish.id,
      name: dish.name,
      quantity: Math.min(MAX_QUANTITY, quantity),
      modifiers: selected,
      note: note.trim(),
      unitPrice: pricedUnit(dish.price, selected),
      basePrice: dish.price,
    },
  ]
}

/** Change one line's quantity. Zero or less removes it. */
export function setQuantity(lines: TicketLineDraft[], key: string, quantity: number): TicketLineDraft[] {
  if (quantity < 1) return removeLine(lines, key)
  return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QUANTITY, quantity) } : l))
}

export function removeLine(lines: TicketLineDraft[], key: string): TicketLineDraft[] {
  return lines.filter((l) => l.key !== key)
}

export function clearTicket(): TicketLineDraft[] {
  return []
}

/**
 * An order that already exists, reduced to what the counter needs to load it.
 *
 * Structurally a subset of the detail DTO, so no conversion is needed at the call site.
 */
export interface OrderToLoad {
  items: Array<{
    id: number
    menuItemId: number
    menuItemName: string
    quantity: number
    unitPrice: number
    specialInstructions?: string | null
    modifiers?: Array<{ modifierId: number; modifierName: string; priceAdjustment: number }> | null
  }>
}

/**
 * Turn an EXISTING order into a ticket the counter screen can carry on editing.
 *
 * This is what makes "add a dish to an order" the same screen as "take a new order". Once
 * the order is a ticket, every rule already written for a new order applies unchanged —
 * the dish grid, the options panel, required-choice refusal, quantities — and the only
 * difference is which endpoint the save button calls.
 *
 * Two deliberate choices:
 *
 *   * **The order's OWN unit prices are kept, not re-read from the menu.** The customer
 *     was quoted this figure. Re-pricing the existing lines on load would show a total the
 *     customer never agreed to, before a single dish had been added — and the server
 *     re-prices on save anyway, where a change is announced rather than sprung.
 *   * **The line keys are derived from the order item id.** They must be unique and stable
 *     across a re-render; the item id already is both, so generating fresh ones would only
 *     add a way for two loads of the same order to disagree.
 *
 * Modifiers are reconstructed from the stored rows: the id and the price adjustment are
 * what the request needs, and the name is what the line renders. If a modifier has since
 * been retired from the menu it still loads, because it is already on the order.
 */
export function loadOrder(order: OrderToLoad): TicketLineDraft[] {
  return (order.items ?? []).map((item) => {
    const modifiers: Modifier[] = (item.modifiers ?? []).map((m) => ({
      id: m.modifierId,
      modifierGroupId: 0,
      name: m.modifierName,
      priceAdjustment: m.priceAdjustment,
      displayOrder: 0,
      isDefault: false,
    }))

    return {
      key: `order-item-${item.id}`,
      menuItemId: item.menuItemId,
      name: item.menuItemName,
      quantity: item.quantity,
      modifiers,
      note: item.specialInstructions ?? "",
      // The STORED unit price, which already includes whatever the modifiers cost — see
      // the note above. Recomputing it from a freshly-fetched dish would double-count the
      // options if the modifier prices have moved since the order was placed.
      unitPrice: item.unitPrice,
      // Back out the options to get the dish's own price. Without this, editing the options
      // on a loaded line would price them on top of a total that already contained them.
      basePrice: Math.round((item.unitPrice - modifierTotal(modifiers)) * 100) / 100,
    }
  })
}

/**
 * The request body for the counter order.
 *
 * Deliberately carries no prices and no line keys: the server prices from the menu, and a
 * local key is an artefact of this screen.
 */
export function toRequest(
  lines: TicketLineDraft[],
  fields: {
    customerName?: string
    customerPhone?: string
    orderType?: "Pickup" | "DineIn"
    tableNumber?: string
    notes?: string
    allergyDeclaration?: string
    markedPaid?: boolean
    /**
     * When the order is promised.
     *
     * Only meaningful on the create path: an addition to an existing order goes through
     * the items-edit endpoint, which does not carry a time (see `ordersApi.setPickupTime`
     * for the one field that does). Omitted for a walk-in with no promise, and the server
     * defaults it to ASAP.
     */
    pickupTime?: { type: "ASAP" | "SCHEDULED"; scheduledTime?: string }
  },
): { items: CounterOrderItem[] } & Record<string, unknown> {
  return {
    ...fields,
    items: lines.map((l) => ({
      menuItemId: l.menuItemId,
      quantity: l.quantity,
      specialInstructions: l.note || undefined,
      modifierIds: l.modifiers.map((m) => m.id),
    })),
  }
}

/**
 * Whether this dish has anything to choose.
 *
 * The single decision behind two things the screen does differently: a dish with options
 * opens a panel before it can be added, and a dish without one goes straight onto the
 * ticket with the same tap. It lives here rather than being written twice because the two
 * copies disagreed with each other and with the server — both read `g.isActive`/`m.isActive`,
 * fields the API does not send, so the answer was always "no options".
 *
 * A group with no choices does NOT count. The seeded menu has a "Spice level" range group
 * that carries no modifier rows by design, and treating that as "has options" would open a
 * panel containing nothing to tap.
 */
export function hasOptions(dish: MenuItemDetail): boolean {
  return (dish.modifierGroups ?? []).some((g) => (g.modifiers ?? []).length > 0)
}

/**
 * Whether this dish can be added as it stands.
 *
 * A required option group with nothing selected is the one thing the screen must refuse,
 * and it refuses it by showing WHICH group is unanswered rather than by disabling the
 * button and leaving the staff member to hunt for it.
 */
export function unmetRequiredGroup(dish: MenuItemDetail, selected: Modifier[]): string | null {
  const chosenIds = new Set(selected.map((m) => m.id))

  for (const group of dish.modifierGroups ?? []) {
    // `minRequired`, not a validity flag. This line used to read `if (!group.isActive)
    // continue` and the server has never sent an `isActive` on a group — so the guard
    // skipped EVERY group, this function always returned null, and a dish whose required
    // choice had not been picked was added silently. A group with no minimum is the
    // optional case and is skipped for the reason the next line gives.
    if (group.minRequired <= 0) continue

    // No `m.isActive` either: modifiers are filtered server-side, so anything in this
    // list is selectable. The old check compared against `undefined` and counted zero.
    const chosen = group.modifiers.filter((m) => chosenIds.has(m.id)).length
    if (chosen < group.minRequired) return group.name
  }

  return null
}

/** Whether a group has had as many options chosen as it allows. */
export function groupFull(group: { maxAllowed: number }, selected: Modifier[]): boolean {
  const count = selected.filter((m) => (group as { modifiers?: Modifier[] }).modifiers?.some((g) => g.id === m.id)).length
  return count >= group.maxAllowed
}

/**
 * Toggle an option, respecting the group's own maximum.
 *
 * A single-select group replaces rather than adds: tapping a second spice level on a group
 * that allows one means "that one instead", which is what the customer just said out loud.
 */
export function toggleModifier(
  dish: MenuItemDetail,
  selected: Modifier[],
  modifier: Modifier,
): Modifier[] {
  const group = (dish.modifierGroups ?? []).find((g) => g.modifiers.some((m) => m.id === modifier.id))

  if (!group) return selected

  const isChosen = selected.some((m) => m.id === modifier.id)

  if (isChosen) {
    // Removing an option is always allowed, even below a group's minimum: the minimum is
    // checked when the dish is added, and refusing to let someone undo a choice traps them
    // on a screen they cannot get out of.
    return selected.filter((m) => m.id !== modifier.id)
  }

  const inGroup = selected.filter((m) => group.modifiers.some((g) => g.id === m.id))

  if (inGroup.length >= group.maxAllowed) {
    // At the limit: this one replaces the oldest choice in the group, which for a
    // single-select group IS the choice it should replace.
    const drop = group.maxAllowed === 1 ? inGroup : inGroup.slice(0, inGroup.length - group.maxAllowed + 1)
    const dropIds = new Set(drop.map((m) => m.id))
    return [...selected.filter((m) => !dropIds.has(m.id)), modifier]
  }

  return [...selected, modifier]
}

/** The max quantity one line may carry — matches the API's own bound. */
export const MAX_QUANTITY = 10

/** A stable key for a set of options, order-insensitive. */
function selectionKey(modifiers: Modifier[]): string {
  return modifiers
    .map((m) => m.id)
    .sort((a, b) => a - b)
    .join(",")
}

/**
 * A stable identity for a line, from the three things that make it distinct.
 *
 * Exported so the screen can ask "is THIS the line I just added" without reproducing the
 * rule — the pulse that confirms a tap has to match on the same dish, options and note the
 * merge in `addLine` uses, or a tapped dish that merged into an existing line would never
 * light up.
 */
export function lineSignature(
  line: Pick<TicketLineDraft, "menuItemId" | "modifiers" | "note">,
): string {
  return `${line.menuItemId}|${selectionKey(line.modifiers)}|${line.note.trim()}`
}

function nextKey(lines: TicketLineDraft[]): string {
  // A counter rather than a random id, so a key is readable in a test failure. It only has
  // to be unique within one ticket.
  return `line-${lines.length + 1}-${Date.now()}`
}
