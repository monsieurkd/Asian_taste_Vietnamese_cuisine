import apiClient from './client';
import type {
  CreateCheckoutOrderRequest,
  CheckoutOrderResponse,
  OrderDetailResponse,
} from '@/types/menu';

/**
 * Checkout and Order API endpoints
 */
export const checkoutApi = {
  /**
   * Create a new order via checkout flow
   */
  createOrder: async (request: CreateCheckoutOrderRequest): Promise<CheckoutOrderResponse> => {
    const response = await apiClient.post<CheckoutOrderResponse>('/orders', request);
    return response.data;
  },

  /**
   * Get order details by order number
   */
  getOrderByNumber: async (orderNumber: string): Promise<OrderDetailResponse> => {
    const response = await apiClient.get<OrderDetailResponse>(`/orders/${orderNumber}`);
    return response.data;
  },

  /**
   * Get order history for a customer by email
   */
  getCustomerOrders: async (email: string): Promise<OrderDetailResponse[]> => {
    const response = await apiClient.get<OrderDetailResponse[]>(`/orders/customer/${email}`);
    return response.data;
  },
};
