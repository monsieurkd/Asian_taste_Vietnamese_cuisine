import { type Order, type OrderDetail, type DashboardSummary, type DailyStats, type UpdateOrderStatusRequest } from "@/types"
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
  }): Promise<Order[]> {
    const response = await apiClient.get<Order[]>("/admin/orders", { params })
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
   * Get daily statistics.
   */
  async getDailyStats(date?: string): Promise<DailyStats> {
    const params = date ? { date } : {}
    const response = await apiClient.get<DailyStats>("/admin/orders/stats/daily", { params })
    return response.data
  },

  /**
   * Update order status.
   */
  async updateOrderStatus(id: number, request: UpdateOrderStatusRequest): Promise<void> {
    await apiClient.put(`/admin/orders/${id}/status`, request)
  },
}
