/**
 * Admin user type.
 */
export interface AdminUser {
  id: number
  username: string
  email: string
  role: string
}

/**
 * Authentication response from API.
 */
export interface AuthResponse {
  token: string
  tokenType: string
  expiresIn: number
  user: AdminUser
}

/**
 * Login request payload.
 */
export interface LoginRequest {
  username: string
  password: string
}

/**
 * Order status enum.
 */
export type OrderStatus = "Pending" | "Confirmed" | "Preparing" | "Ready" | "Completed" | "Cancelled"

/**
 * Order type enum.
 */
export type OrderType = "Pickup" | "DineIn"

/**
 * Payment method enum.
 */
export type PaymentMethod = "Card" | "Cash"

/**
 * Payment status enum.
 *
 * Needed by the console to tell a declined card from a paid one. Inferring it from
 * the method is what made every card order read as a sale.
 */
export type PaymentStatus =
  | "Pending"
  | "Processing"
  | "Succeeded"
  | "Failed"
  | "Refunded"
  | "PartiallyRefunded"
  | "RequiresAction"
  | "Canceled"

/**
 * Order entity.
 */
export interface Order {
  id: number
  orderNumber: string
  customerName: string
  customerPhone: string
  customerEmail: string
  orderType: OrderType
  requestedTime: string
  status: OrderStatus
  paymentMethod?: PaymentMethod
  /** What happened to the money, or null when nothing was ever taken. */
  paymentStatus?: PaymentStatus | null
  subtotal: number
  total: number
  notes?: string
  createdAt: string
}

/**
 * Order item.
 */
export interface OrderItem {
  id: number
  menuItemId: number
  menuItemName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  specialInstructions?: string
  modifiers: OrderItemModifier[]
}

/**
 * Order item modifier.
 */
export interface OrderItemModifier {
  id: number
  modifierId: number
  modifierName: string
  priceAdjustment: number
}

/**
 * Detailed order with items.
 */
export interface OrderDetail extends Order {
  paymentFailureReason?: string | null
  /** The Stripe PaymentIntent id — what a refund is issued against. */
  paymentIntentId?: string | null
  /** Present on the detail endpoint only; the list omits the breakdown. */
  tax?: number
  paidAmount?: number | null
  paidAt?: string | null
  updatedAt?: string
  items: OrderItem[]
}

/**
 * Dashboard summary statistics.
 */
export interface DashboardSummary {
  todayRevenue: number
  revenueChangePercent?: number
  activeOrders: number
  completedOrdersToday: number
  averageOrderValue: number
  ordersByStatus: Record<string, number>
  recentOrders: RecentOrder[]
}

/**
 * Recent order summary.
 */
export interface RecentOrder {
  id: number
  orderNumber: string
  customerName: string
  status: OrderStatus
  total: number
  createdAt: string
  orderType: OrderType
}

/**
 * One line of a replacement order. Deliberately has no price: the server computes the
 * money from the current menu, so a request cannot set its own total.
 */
export interface UpdateOrderItemInput {
  menuItemId: number
  quantity: number
  specialInstructions?: string
  modifierIds?: number[]
}

/**
 * Replace an order's contents. The whole order is sent, because that is what the screen
 * shows — a sequence of deltas would apply differently depending on arrival order.
 */
export interface UpdateOrderItemsRequest {
  items: UpdateOrderItemInput[]
  pickupTime?: { type: "ASAP" | "SCHEDULED"; scheduledTime?: string }
  reason?: string
}

/** What an edit did, including what it did to the money. */
export interface UpdateOrderItemsResult {
  orderId: number
  orderNumber: string
  subtotal: number
  total: number
  paymentNote: string
  amountDueAtCounter: boolean
}

/**
 * Update order status request.
 */
export interface UpdateOrderStatusRequest {
  status: OrderStatus
  reason?: string
}

/**
 * WebSocket message types.
 */
export type WebSocketMessageType =
  | "connected"
  | "new_order"
  | "status_update"
  | "dashboard_update"

/**
 * WebSocket message from server.
 */
export interface WebSocketMessage {
  type: WebSocketMessageType
  data?: unknown
  orderId?: number
  status?: string
  reason?: string
  connectionId?: string
  timestamp: string
}
