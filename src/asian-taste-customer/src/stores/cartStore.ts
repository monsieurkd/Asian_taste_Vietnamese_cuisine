import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, CartItemModifier, Dish, DishSelections } from '@/types/menu';
import { describeSelections, priceOf } from '@/lib/menuModel';

/**
 * The cart.
 *
 * A line's id is the dish plus its exact configuration, so the same dish built
 * two ways holds two lines — and adding an identical configuration increments
 * the existing line rather than stacking duplicates the customer has to tidy up.
 */
interface CartStore {
  items: CartItem[];
  /** Adds a configured dish; returns the resulting line's id. */
  addConfigured: (
    dish: Dish,
    options: { selections: DishSelections; quantity?: number; note?: string }
  ) => string;
  /** Replaces the configuration of an existing line. */
  replaceLine: (
    lineId: string,
    dish: Dish,
    options: { selections: DishSelections; quantity: number; note?: string }
  ) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
  getItem: (lineId: string) => CartItem | undefined;
}

/** The modifier ids that uniquely identify a configuration. */
function keyFor(dish: Dish, selections: DishSelections): string {
  const parts = dish.options
    .filter((g) => g.type !== 'range')
    .map((g) => {
      const value = selections[g.id];
      const ids = Array.isArray(value) ? value : value != null ? [String(value)] : [];
      return ids.slice().sort().join('+');
    })
    .filter(Boolean);
  return `${dish.id}-${parts.join('|')}`;
}

/**
 * Modifier rows for the API payload.
 *
 * Only numeric ids can be sent, and the printed option groups use string ids —
 * so a dish configured from the printed groups adds with no modifier rows and
 * carries its choices in `specialInstructions` instead, which is what the
 * kitchen ticket shows either way. Once modifier tables are seeded, `modifierGroups`
 * returns numeric ids and this starts populating.
 */
function modifiersFor(dish: Dish, selections: DishSelections): CartItemModifier[] {
  const out: CartItemModifier[] = [];

  for (const group of dish.options) {
    if (group.type === 'range') continue;
    const value = selections[group.id];
    if (value == null) continue;
    const ids = Array.isArray(value) ? value : [String(value)];

    for (const id of ids) {
      const numeric = Number(id);
      if (!Number.isFinite(numeric)) continue;
      const choice = group.choices?.find((c) => c.id === id);
      out.push({
        id: numeric,
        name: choice ? `${group.label}: ${choice.label}` : group.label,
        priceAdjustment: choice?.delta ?? 0,
      });
    }
  }

  return out;
}

function lineFrom(
  dish: Dish,
  selections: DishSelections,
  quantity: number,
  note?: string
): CartItem {
  const summary = describeSelections(dish, selections);
  const modifiers = modifiersFor(dish, selections);

  return {
    id: keyFor(dish, selections),
    menuItemId: dish.id,
    slug: dish.slug,
    name: dish.name,
    description: dish.desc || null,
    basePrice: priceOf(dish, selections),
    imageUrl: dish.image,
    quantity,
    modifiers,
    // The configuration and the customer's own note are kept apart as well as being
    // joined: the summary is the only place the chosen extras exist, so a screen that
    // shows only the note would hide every choice the customer paid for.
    choicesSummary: summary.join(' · ') || undefined,
    note: note?.trim() || undefined,
    // Carries the readable configuration to the kitchen whether or not the
    // API accepted modifier rows.
    specialInstructions: [summary.join(' · '), note?.trim() ? `Note: ${note.trim()}` : '']
      .filter(Boolean)
      .join(' · ') || undefined,
  };
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addConfigured: (dish, { selections, quantity = 1, note }) => {
        const line = lineFrom(dish, selections, quantity, note);
        const existing = get().items.find((i) => i.id === line.id);

        if (existing) {
          set({
            items: get().items.map((i) =>
              i.id === line.id ? { ...i, quantity: i.quantity + quantity } : i
            ),
          });
        } else {
          set({ items: [...get().items, line] });
        }

        return line.id;
      },

      replaceLine: (lineId, dish, { selections, quantity, note }) => {
        const line = lineFrom(dish, selections, quantity, note);
        set({
          items: get()
            .items.filter((i) => i.id !== lineId && i.id !== line.id)
            .concat(line),
        });
      },

      updateQuantity: (lineId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(lineId);
          return;
        }
        set({
          items: get().items.map((i) => (i.id === lineId ? { ...i, quantity } : i)),
        });
      },

      removeItem: (lineId) => set({ items: get().items.filter((i) => i.id !== lineId) }),

      clearCart: () => set({ items: [] }),

      getSubtotal: () => get().items.reduce((sum, i) => sum + i.basePrice * i.quantity, 0),

      getItemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      getItem: (lineId) => get().items.find((i) => i.id === lineId),
    }),
    { name: 'asian-taste-cart', version: 2 }
  )
);
