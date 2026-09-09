import apiClient from './client';
import type { PaymentMethod } from '@/types/menu';

/**
 * Payment status enum from backend
 */
export const PaymentStatus = {
  Pending: 'Pending',
  Processing: 'Processing',
  Succeeded: 'Succeeded',
  Failed: 'Failed',
  Refunded: 'Refunded',
  PartiallyRefunded: 'PartiallyRefunded',
  RequiresAction: 'RequiresAction',
  Canceled: 'Canceled'
} as const;

export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus];

/**
 * Payment initiation request
 */
export interface InitiatePaymentRequest {
  orderId: number;
  paymentMethodType: PaymentMethod;
}

/**
 * Payment initiation response
 */
export interface PaymentInitiationResult {
  success: boolean;
  paymentId: string;
  clientSecret?: string;
  redirectUrl?: string;
  requiresAction: boolean;
  errorMessage?: string;
  paymentStatus?: PaymentStatus;
}

/**
 * Payment status response
 */
export interface PaymentStatusResponse {
  status: PaymentStatus;
  paidAmount?: number;
  paidAt?: string;
  currency?: string;
  paymentMethod?: string;
  errorMessage?: string;
}

/**
 * Create payment intent request (before order creation for Stripe)
 */
export interface CreatePaymentIntentRequest {
  amount: number; // Amount in dollars (will be converted to cents)
  currency?: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

/**
 * Create payment intent response
 */
export interface CreatePaymentIntentResult {
  success: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  errorMessage?: string;
}

/**
 * Payment API endpoints
 * Handles all payment-related API calls
 */
export const paymentApi = {
  /**
   * Creates a Stripe payment intent before order creation
   * POST /api/payments/create-intent
   */
  createPaymentIntent: async (request: CreatePaymentIntentRequest): Promise<CreatePaymentIntentResult> => {
    const response = await apiClient.post<CreatePaymentIntentResult>('/payments/create-intent', {
      amount: Math.round(request.amount * 100), // Convert to cents
      currency: request.currency || 'aud',
      customerEmail: request.customerEmail,
      metadata: request.metadata,
    });
    return response.data;
  },

  /**
   * Initiates payment for an order
   * POST /api/payments/initiate
   */
  initiatePayment: async (request: InitiatePaymentRequest): Promise<PaymentInitiationResult> => {
    const response = await apiClient.post<PaymentInitiationResult>('/payments/initiate', request);
    return response.data;
  },

  /**
   * Gets payment status
   * GET /api/payments/{paymentId}/status
   */
  getPaymentStatus: async (paymentId: string): Promise<PaymentStatusResponse> => {
    const response = await apiClient.get<PaymentStatusResponse>(`/payments/${paymentId}/status`);
    return response.data;
  },

  /**
   * Captures a payment (for dine-in orders that were authorized)
   * POST /api/payments/{paymentId}/capture
   */
  capturePayment: async (paymentId: string, amount: number): Promise<{ success: boolean; captureId: string; amount: number }> => {
    const response = await apiClient.post(`/payments/${paymentId}/capture`, { amount: Math.round(amount * 100) }); // Convert to cents
    return response.data;
  },

  /**
   * Refunds a payment (full or partial)
   * POST /api/payments/{paymentId}/refund
   */
  refundPayment: async (paymentId: string, amount?: number): Promise<{ success: boolean; refundId: string; amount: number }> => {
    const response = await apiClient.post(`/payments/${paymentId}/refund`, {
      amount: amount ? Math.round(amount * 100) : null // Convert to cents
    });
    return response.data;
  },

  /**
   * Gets payment details for an order
   * GET /api/payments/order/{orderId}
   */
  getOrderPaymentDetails: async (orderId: number): Promise<{
    orderId: number;
    orderNumber: string;
    total: number;
    paymentMethod?: PaymentMethod;
    paymentStatus?: PaymentStatus;
    paidAmount?: number;
    paidAt?: string;
    externalPaymentId?: string;
    lightspeedSyncStatus?: string;
    lightspeedOrderId?: string;
  }> => {
    const response = await apiClient.get(`/payments/order/${orderId}`);
    return response.data;
  },

  /**
   * Polls payment status until completion (with timeout)
   * @param paymentId Payment ID to poll
   * @param maxAttempts Maximum number of polling attempts (default: 30)
   * @param intervalMs Polling interval in milliseconds (default: 1000)
   */
  pollPaymentStatus: async (
    paymentId: string,
    maxAttempts: number = 30,
    intervalMs: number = 1000
  ): Promise<PaymentStatusResponse> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await paymentApi.getPaymentStatus(paymentId);

      // Return if payment is in a final state
      if (
        status.status === PaymentStatus.Succeeded ||
        status.status === PaymentStatus.Failed ||
        status.status === PaymentStatus.Canceled ||
        status.status === PaymentStatus.Refunded
      ) {
        return status;
      }

      // Wait before next poll (skip after last attempt)
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    throw new Error('Payment status polling timeout');
  }
};
