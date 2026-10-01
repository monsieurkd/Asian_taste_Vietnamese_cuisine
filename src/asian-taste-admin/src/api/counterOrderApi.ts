import apiClient from "./client"
import type { OrderType, PaymentMethod } from "@/types"

/**
 * The counter (face-to-face) order API.
 *
 * Separate from `ordersApi` because it is a different act: this creates an order for
 * somebody standing in front of you, with no payment provider involved and no contact
 * details required. It lives on the admin endpoint, so a counter order can never be
 * confused with a public checkout — which matters at exactly one point, the trading-hours
 * rule the public path enforces and this one deliberately does not.
 */

export interface CounterOrderItem {
  menuItemId: number
  quantity: number
  specialInstructions?: string
  modifierIds?: number[]
}

export interface CreateCounterOrderRequest {
  /** Optional: a customer who will not give a name still gets fed. Blank stores "Counter". */
  customerName?: string
  customerPhone?: string
  orderType?: OrderType
  /** Free text — the till number, folded into the kitchen note. */
  tableNumber?: string
  notes?: string
  allergyDeclaration?: string
  paymentMethod?: PaymentMethod
  /** True when the staff member already has the money. This app takes no counter payment. */
  markedPaid?: boolean
  items: CounterOrderItem[]
}

export interface CounterOrderResult {
  orderId: number
  orderNumber: string
  subtotal: number
  total: number
  status: string
  paid: boolean
  /** A line for the person at the counter — usually the amount still to collect. */
  counterNote: string
}

export const counterOrderApi = {
  /**
   * Create an order taken at the counter.
   *
   * Sends dishes and quantities only — the server prices them from the current menu, so
   * this cannot set its own total.
   */
  async create(request: CreateCounterOrderRequest): Promise<CounterOrderResult> {
    const response = await apiClient.post<CounterOrderResult>("/admin/orders", request)
    return response.data
  },
}
