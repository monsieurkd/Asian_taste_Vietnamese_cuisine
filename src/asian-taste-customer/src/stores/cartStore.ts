import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, CartItemModifier, MenuItemDetailDto, MenuItemSummaryDto } from '../types/menu';

interface CartStore {
  items: CartItem[];
  addItem: (item: MenuItemSummaryDto | MenuItemDetailDto, modifiers?: CartItemModifier[], specialInstructions?: string) => void;
  updateItem: (cartItemId: string, item: MenuItemSummaryDto | MenuItemDetailDto, modifiers?: CartItemModifier[], specialInstructions?: string, quantity?: number) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
  getItemQuantity: (menuItemId: number) => number;
  getItem: (cartItemId: string) => CartItem | undefined;
}

// Helper function to generate a unique cart item ID based on menu item and modifiers
const generateCartItemId = (menuItemId: number, modifiers: CartItemModifier[] = []): string => {
  const modifierIds = modifiers.map((m) => m.id).sort().join(',');
  return `${menuItemId}-${modifierIds}`;
};

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item, modifiers = [], specialInstructions) => {
        const cartItemId = generateCartItemId(item.id, modifiers);
        const existingItem = get().items.find((i) => i.id === cartItemId);

        const modifierPrice = modifiers.reduce((sum, m) => sum + m.priceAdjustment, 0);
        const totalPrice = item.basePrice + modifierPrice;

        if (existingItem) {
          set({
            items: get().items.map((i) =>
              i.id === cartItemId
                ? { ...i, quantity: i.quantity + 1 }
                : i
            ),
          });
        } else {
          const cartItem: CartItem = {
            id: cartItemId,
            menuItemId: item.id,
            name: item.name,
            description: item.description,
            basePrice: totalPrice,
            imageUrl: item.imageUrl,
            quantity: 1,
            modifiers,
            specialInstructions,
          };
          set({ items: [...get().items, cartItem] });
        }
      },

      removeItem: (cartItemId) => {
        set({
          items: get().items.filter((i) => i.id !== cartItemId),
        });
      },

      updateQuantity: (cartItemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(cartItemId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.id === cartItemId ? { ...i, quantity } : i
          ),
        });
      },

      clearCart: () => {
        set({ items: [] });
      },

      getSubtotal: () => {
        return get().items.reduce((sum, item) => sum + item.basePrice * item.quantity, 0);
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getItemQuantity: (menuItemId) => {
        return get().items
          .filter((i) => i.menuItemId === menuItemId)
          .reduce((sum, item) => sum + item.quantity, 0);
      },

      getItem: (cartItemId) => {
        return get().items.find((i) => i.id === cartItemId);
      },

      updateItem: (cartItemId, item, modifiers = [], specialInstructions, quantity = 1) => {
        const newCartItemId = generateCartItemId(item.id, modifiers);

        const modifierPrice = modifiers.reduce((sum, m) => sum + m.priceAdjustment, 0);
        const totalPrice = item.basePrice + modifierPrice;

        const updatedItem: CartItem = {
          id: newCartItemId,
          menuItemId: item.id,
          name: item.name,
          description: item.description,
          basePrice: totalPrice,
          imageUrl: item.imageUrl,
          quantity,
          modifiers,
          specialInstructions,
        };

        // Remove the old item and add the updated one
        set({
          items: get().items
            .filter((i) => i.id !== cartItemId)
            .concat(updatedItem),
        });
      },
    }),
    {
      name: 'asian-taste-cart',
      version: 1,
    }
  )
);
