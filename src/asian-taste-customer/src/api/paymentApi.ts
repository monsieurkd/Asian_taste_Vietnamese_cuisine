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
};
