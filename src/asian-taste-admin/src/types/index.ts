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
  subtotal: number
  tax: number
  total: number
  notes?: string
  createdAt: string
  updatedAt?: string
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
 * Daily statistics.
 */
export interface DailyStats {
  date: string
  revenue: number
  totalOrders: number
  averageOrderValue: number
  ordersByStatus: Record<string, number>
  hourlyDistribution: Record<number, number>
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
