/**
 * Menu, cart and order types.
 *
 * The menu model follows the ratified data contract in
 * `docs/DESIGN/mockups/src/scripts/menu-data.js`: a dish carries `tags`, a
 * default `note`, and an ordered list of option groups; the price is
 * `basePrice + Σ(selected choice deltas)`. The API is the runtime source of
 * truth and returns snake-free PascalCase DTOs, which `src/lib/menuModel.ts`
 * maps into this shape — the components only ever see the model below.
 */

/** Dietary / marketing marks that render as a coloured dot on a neutral pill. */
export type DishTag = 'popular' | 'gf' | 'vegan' | 'spicy';

/** One option inside a group. `delta` is added to the unit price when picked. */
export interface DishChoice {
  id: string;
  label: string;
  delta?: number;
  note?: string;
}

export type DishOptionType = 'radio' | 'checkbox' | 'range';

/**
 * A customisation group.
 *
 * `range` is the 1–5 spice scale. It carries no `choices` and is priced at
 * zero — it exists so the kitchen can read the heat level off the ticket.
 */
export interface DishOptionGroup {
  id: string;
  label: string;
  type: DishOptionType;
  required?: boolean;
  choices?: DishChoice[];
  min?: number;
  max?: number;
  value?: number;
  hint?: string;
}

/** A dish as the storefront renders it. */
export interface Dish {
  id: number;
  slug: string;
  name: string;
  desc: string;
  /** GST-inclusive AUD. */
  price: number;
  categoryIds: number[];
  tags: DishTag[];
  options: DishOptionGroup[];
  image: string | null;
  note?: string;
  isAvailable: boolean;
  spicyLevel: number;
}

export interface MenuCategory {
  id: number;
  label: string;
  desc: string;
  count: number;
}

/** Selections keyed by option-group id: a choice id, a list of them, or a number. */
export type DishSelections = Record<string, string | string[] | number>;

/* ─── API wire shapes (unchanged — the API is not part of this port) ───────── */

export interface ModifierDto {
  id: number;
  name: string;
  priceAdjustment: number;
  isAvailable: boolean;
}

export interface ModifierGroupDto {
  id: number;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  modifiers: ModifierDto[];
}

export interface MenuItemSummaryDto {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  basePrice: number;
  imageUrl: string | null;
  isAvailable: boolean;
  isPopular: boolean;
  isGlutenFree: boolean;
  isVegetarian: boolean;
  isVegan: boolean;
  spicyLevel: number;
  hasModifiers: boolean;
}

export interface MenuItemDetailDto extends MenuItemSummaryDto {
  categoryName: string;
  modifierGroups: ModifierGroupDto[];
}

export interface CategoryDto {
  id: number;
  name: string;
  description: string | null;
  displayOrder: number;
  itemCount: number;
}

export interface CategoryWithItemsDto extends CategoryDto {
  items: MenuItemSummaryDto[];
}

export interface MenuResponseDto {
  categories: CategoryWithItemsDto[];
}

/* ─── search ──────────────────────────────────────────────────────────────── */

export type SortBy = 'relevance' | 'name' | 'price' | 'popularity' | 'spicy';
export type SortOrder = 'asc' | 'desc';
export type DietaryFilter = 'vegetarian' | 'vegan' | 'glutenFree';

export interface SearchSearchParams {
  q?: string;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
  dietary?: DietaryFilter;
  minPrice?: number;
  maxPrice?: number;
  minSpicyLevel?: number;
  maxSpicyLevel?: number;
  categoryId?: number;
  onlyPopular?: boolean;
  includeModifiers?: boolean;
}

export const DEFAULT_SEARCH_PARAMS: Partial<SearchSearchParams> = {
  sortBy: 'relevance',
  sortOrder: 'asc',
  includeModifiers: true,
};

/* ─── cart ────────────────────────────────────────────────────────────────── */

export interface CartItemModifier {
  id: number;
  name: string;
  priceAdjustment: number;
}

export interface CartItem {
  /** menuItemId + the sorted modifier ids, so the same dish configured two
   *  different ways holds two lines. */
  id: string;
  menuItemId: number;
  slug: string;
  name: string;
  description: string | null;
  /** Unit price with modifiers already applied. */
  basePrice: number;
  imageUrl: string | null;
  quantity: number;
  modifiers: CartItemModifier[];
  specialInstructions?: string;
}

/* ─── order type ──────────────────────────────────────────────────────────── */

/**
 * The storefront sells two services. The design set draws a third ("Dine in")
 * which the API has no value for, and the live marketplace listing is
 * delivery-only — so a third button would either fail at checkout or write a
 * type the kitchen cannot receipt. Confirm with the owner before adding one;
 * see docs/DESIGN/mockups/HANDOFF.md §10 item 3.
 */
export const OrderType = {
  Delivery: 'Delivery',
  Pickup: 'Pickup',
} as const;

export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const OrderStatus = {
  Pending: 'Pending',
  Confirmed: 'Confirmed',
  Preparing: 'Preparing',
  Ready: 'Ready',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = {
  Card: 'Card',
  Cash: 'Cash',
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export type PickupTimeType = 'ASAP' | 'SCHEDULED';

export interface PickupTime {
  type: PickupTimeType;
  scheduledTime?: Date;
}

/* ─── checkout / order responses ──────────────────────────────────────────── */

export interface CheckoutOrderItem {
  menuItemId: number;
  quantity: number;
  specialInstructions?: string;
  selectedModifierIds: number[];
}

export interface CreateCheckoutOrderRequest {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  orderType: OrderType;
  pickupTime: {
    type: PickupTimeType;
    scheduledTime?: string;
  };
  specialInstructions?: string;
  items: CheckoutOrderItem[];
  paymentMethod: PaymentMethod;
  paymentToken?: string;
  paymentIntentId?: string;
  savePaymentMethod: boolean;
  createAccount: boolean;
  password?: string;
}

export interface OrderItemResponse {
  id: number;
  menuItemId: number;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialInstructions?: string;
  modifiers: OrderItemModifierResponse[];
}

export interface OrderItemModifierResponse {
  id: number;
  modifierName: string;
  priceAdjustment: number;
}

export interface CheckoutOrderResponse {
  orderId: number;
  orderNumber: string;
  status: OrderStatus;
  estimatedReadyTime: string;
  total: number;
  paymentDisplay: string;
  items: OrderItemResponse[];
  accountCreated: boolean;
}

export interface OrderDetailResponse {
  orderId: number;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  estimatedReadyTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  orderType: OrderType;
  paymentMethod?: PaymentMethod;
  paymentStatus?:
    | 'Pending'
    | 'Processing'
    | 'Succeeded'
    | 'Failed'
    | 'Refunded'
    | 'PartiallyRefunded'
    | 'RequiresAction'
    | 'Canceled';
  paidAmount?: number;
  paidAt?: string;
  subtotal: number;
  total: number;
  specialInstructions?: string;
  items: OrderItemResponse[];
}
