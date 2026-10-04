import apiClient from "./client"
import type {
  OrderType,
  PaymentMethod,
  SetPickupTimeRequest,
  UpdateOrderItemsRequest,
  UpdateOrderItemsResult,
} from "@/types"

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
  /**
   * When the order is promised. Omitted for a walk-in with no promise, and the server
   * defaults it to ASAP — so the ordinary counter order is unchanged.
   */
  pickupTime?: SetPickupTimeRequest["pickupTime"]
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

/** An order that could be the one the staff member is adding to. */
export interface CounterOrderCandidate {
  id: number
  orderNumber: string
  customerName: string
  customerPhone: string
  status: string
  total: number
  itemsDone: { done: number; total: number }
  createdAt: string
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

  /**
   * Find an order to add to, by its docket number or its id.
   *
   * Deliberately narrow: this is the "the customer came back for one more" path, and the
   * staff member has the docket in front of them. A general search would be the Orders
   * screen, which is a different job (finding an order) from this one (adding to the one
   * somebody is holding).
   *
   * Returns the open orders that match, so the caller can offer a choice rather than
   * guessing — a partial docket number is common when it is read out loud.
   */
  async findExisting(term: string): Promise<CounterOrderCandidate[]> {
    const trimmed = term.trim()
    if (!trimmed) return []

    const response = await apiClient.get<CounterOrderCandidate[]>("/admin/orders", {
      params: { orderNumber: trimmed, limit: 20, includeItems: false },
    })
    return response.data
  },

  /**
   * Replace an existing order's dishes.
   *
   * The SAME endpoint the phone-edit path uses, on purpose: adding a dish at the counter
   * and swapping one over the phone are the same act on the same data, and a second
   * implementation would be a second set of pricing rules. The server re-prices from the
   * current menu, so this sends dishes and quantities only.
   */
  async replaceItems(orderId: number, request: UpdateOrderItemsRequest): Promise<UpdateOrderItemsResult> {
    const response = await apiClient.put<UpdateOrderItemsResult>(`/admin/orders/${orderId}/items`, request)
    return response.data
  },
}
