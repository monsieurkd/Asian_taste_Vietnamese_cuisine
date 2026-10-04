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
  /** Allergies declared for the order — flagged on the board, not only in the detail. */
  allergyDeclaration?: string | null
  /**
   * How many dishes are ticked off.
   *
   * On the list rather than derived from `items`, because the Orders table does not fetch
   * lines and would otherwise have to render progress it cannot see.
   */
  itemsDone: OrderItemProgress
  /**
   * The order's dishes, when the caller asked for them (`includeItems`).
   *
   * Typed as the DETAIL's richer item shape, and used by the board's ticket for name,
   * quantity, options and tick state. The list endpoint happens to send a narrower object
   * (no money), which is a subset of this one — so one type describes both without the
   * board having to know which endpoint its data came from.
   */
  items?: OrderItem[] | null
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
  /** Whether a cook has ticked this dish off on the kitchen board. */
  isCompleted: boolean
  completedAt?: string | null
  modifiers: OrderItemModifier[]
}

/**
 * One line of an order as the kitchen board's ticket receives it.
 *
 * The list endpoint's shape, which is NARROWER than the detail's `OrderItem` — no money.
 * That is deliberate: the ticket exists to say what to cook, and a price competes for the
 * attention the dish name needs. Kept as its own type so the difference is visible rather
 * than implied by which endpoint the data came from.
 */
export interface OrderListLine {
  id: number
  menuItemName: string
  quantity: number
  /** Selected options, already joined for display. */
  modifiers?: string | null
  specialInstructions?: string | null
  isCompleted: boolean
}

/**
 * The fields the board's ticket reads off a line, whichever endpoint sent it.
 *
 * Structural, not nominal: the list sends `OrderListLine` and the detail sends
 * `OrderItem`, and both are usable on the board. Naming the subset the ticket actually
 * touches means neither one has to be bent to fit the other.
 *
 * `modifiers` is the one genuinely different field — a joined string from the list, an
 * array of modifier objects from the detail — so it is left out and read by the two
 * callers separately where it differs.
 */
export interface TicketLine {
  id: number
  menuItemName: string
  quantity: number
  specialInstructions?: string | null
  isCompleted: boolean
}

/**
 * How many of an order's lines are ticked.
 */
export interface OrderItemProgress {
  done: number
  total: number
}

/**
 * What ticking a dish did to its order.
 *
 * `orderMarkedReady` and `customerNotified` are separate because they are different
 * facts: the food is ready whether or not there was anybody to email (a counter order
 * has no address), and a send can fail. The board says which, so a cook knows whether
 * to call the number out or ring the customer.
 */
export interface ItemCompletionResult {
  orderId: number
  orderItemId: number
  isCompleted: boolean
  doneLines: number
  totalLines: number
  orderStatus: OrderStatus
  orderMarkedReady: boolean
  customerNotified: boolean
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
  /** Allergies the customer declared, verbatim. Null when they declared none. */
  allergyDeclaration?: string | null
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
 * Move an order's promised pickup time, and nothing else.
 *
 * Deliberately carries no items: the items-edit endpoint replaces the lines wholesale,
 * which wipes the kitchen's per-dish ticks. Moving a time must not cost the ticket its
 * place on the line.
 */
export interface SetPickupTimeRequest {
  pickupTime: { type: "ASAP" | "SCHEDULED"; scheduledTime?: string }
  reason?: string
}

/** The stored result of moving a pickup time. */
export interface SetPickupTimeResult {
  orderId: number
  orderNumber: string
  requestedTime: string
  isScheduled: boolean
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
