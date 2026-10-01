import {
  type Order,
  type OrderDetail,
  type DashboardSummary,
  type ItemCompletionResult,
  type UpdateOrderItemsRequest,
  type UpdateOrderItemsResult,
  type UpdateOrderStatusRequest,
} from "@/types"
import apiClient from "./client"

/**
 * Orders API calls.
 */

export const ordersApi = {
  /**
   * Get all orders with optional filters.
   */
  async getOrders(params?: {
    status?: string
    fromDate?: string
    toDate?: string
    /** Partial order-number match — the docket's short form or the full number. */
    orderNumber?: string
    limit?: number
    offset?: number
    /**
     * Include each order's dishes and their ticked state.
     *
     * The kitchen board needs them (its ticket renders what to cook); the Orders table
     * does not, and asking for them there ships a page of lines nobody reads.
     */
    includeItems?: boolean
  }): Promise<Order[]> {
    const response = await apiClient.get<Order[]>("/admin/orders", { params })
    return response.data
  },

  /**
   * Mark one dish on an order as done, or take the mark back.
   *
   * Ticking the LAST outstanding dish finishes the order — it moves to Ready and the
   * customer is emailed — but that is decided on the server, not here. The response says
   * whether it happened, so the board can tell the cook.
   *
   * Sends the state the line should be in rather than asking for a toggle, so a doubled
   * tap on a tablet settles on the same answer instead of flipping twice.
   */
  async setItemCompleted(
    orderId: number,
    itemId: number,
    isCompleted: boolean,
  ): Promise<ItemCompletionResult> {
    const response = await apiClient.put<ItemCompletionResult>(
      `/admin/orders/${orderId}/items/${itemId}/completed`,
      { isCompleted },
    )
    return response.data
  },

  /**
   * Get order details by ID.
   */
  async getOrderDetail(id: number): Promise<OrderDetail> {
    const response = await apiClient.get<OrderDetail>(`/admin/orders/${id}`)
    return response.data
  },

  /**
   * Get dashboard summary statistics.
   */
  async getDashboardSummary(): Promise<DashboardSummary> {
    const response = await apiClient.get<DashboardSummary>("/admin/orders/summary")
    return response.data
  },

  /**
   * Update order status.
   */
  async updateOrderStatus(id: number, request: UpdateOrderStatusRequest): Promise<void> {
    await apiClient.put(`/admin/orders/${id}/status`, request)
  },

  /**
   * Replace an order's contents.
   *
   * Sends dishes and quantities only — the server re-prices from the current menu, so
   * this cannot set its own total. Returns the recomputed figures plus a note about the
   * money when it differs from what was charged.
   */
  async updateOrderItems(
    id: number,
    request: UpdateOrderItemsRequest,
  ): Promise<UpdateOrderItemsResult> {
    const response = await apiClient.put<UpdateOrderItemsResult>(`/admin/orders/${id}/items`, request)
    return response.data
  },

  /**
   * Refund a card payment, in full or in part.
   *
   * `amount` is in DOLLARS, and the API converts to cents — the same convention the
   * checkout uses. Getting the units wrong here refunds a hundredth or a hundred times
   * what was intended, and a refund cannot be undone from this app.
   */
  async refundPayment(
    paymentIntentId: string,
    amount?: number,
  ): Promise<{ success: boolean; refundId: string; amount: number; errorMessage?: string }> {
    const response = await apiClient.post(`/payments/${paymentIntentId}/refund`, {
      amount: amount === undefined ? undefined : Math.round(amount * 100),
    })
    return response.data
  },
}
