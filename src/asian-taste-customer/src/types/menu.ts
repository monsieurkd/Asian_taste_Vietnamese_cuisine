/**
 * Menu types matching the API DTOs
 */

/**
 * Search and filter types
 */
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

export interface SearchFilters extends SearchSearchParams {
  // Convenience computed fields
  hasFilters: boolean;
}

export const DEFAULT_SEARCH_PARAMS: Partial<SearchSearchParams> = {
  sortBy: 'relevance',
  sortOrder: 'asc',
  includeModifiers: true,
};

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

/**
 * Cart types
 */

export interface CartItemModifier {
  id: number;
  name: string;
  priceAdjustment: number;
}

export interface CartItem {
  id: string; // Unique ID for cart item (menuItemId + selected modifiers hash)
  menuItemId: number;
  name: string;
  description: string | null;
  basePrice: number;
  imageUrl: string | null;
  quantity: number;
  modifiers: CartItemModifier[];
  specialInstructions?: string;
}

export interface CartState {
  items: CartItem[];
  subtotal: number;
  itemCount: number;
}

/**
 * Order types
 */

export const OrderType = {
  Pickup: 'Pickup',
  DineIn: 'DineIn',
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

/**
 * Checkout types
 */

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
  paymentStatus?: 'Pending' | 'Processing' | 'Succeeded' | 'Failed' | 'Refunded' | 'PartiallyRefunded' | 'RequiresAction' | 'Canceled';
  paidAmount?: number;
  paidAt?: string;
  subtotal: number;
  total: number;
  specialInstructions?: string;
  items: OrderItemResponse[];
}
