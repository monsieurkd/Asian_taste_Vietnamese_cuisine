/**
 * Payment types matching backend API models
 * Re-exports common types from paymentApi for convenience
 */

import type { PaymentMethod } from './menu';

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
 * Extended order details with payment info
 */
export interface OrderWithPayment {
  orderId: number;
  orderNumber: string;
  status: string;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  externalPaymentId?: string;
  paidAmount?: number;
  paidAt?: string;
  total: number;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  estimatedReadyTime: string;
  createdAt: string;
}

/**
 * Order item in order details
 */
export interface OrderItem {
  id: number;
  menuItemId: number;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialInstructions?: string;
  modifiers?: OrderItemModifier[];
}

/**
 * Order item modifier
 */
export interface OrderItemModifier {
  id: number;
  modifierName: string;
  priceAdjustment: number;
}

/**
 * Helper function to get display text for payment status
 */
export const getPaymentStatusDisplay = (status: PaymentStatus): string => {
  switch (status) {
    case PaymentStatus.Pending:
      return 'Pending';
    case PaymentStatus.Processing:
      return 'Processing...';
    case PaymentStatus.Succeeded:
      return 'Paid';
    case PaymentStatus.Failed:
      return 'Failed';
    case PaymentStatus.Refunded:
      return 'Refunded';
    case PaymentStatus.PartiallyRefunded:
      return 'Partially Refunded';
    case PaymentStatus.RequiresAction:
      return 'Action Required';
    case PaymentStatus.Canceled:
      return 'Canceled';
    default:
      return 'Unknown';
  }
};

/**
 * Helper function to get color classes for payment status
 */
export const getPaymentStatusColor = (status: PaymentStatus): { bg: string; text: string; icon: string } => {
  switch (status) {
    case PaymentStatus.Pending:
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', icon: '⏳' };
    case PaymentStatus.Processing:
      return { bg: 'bg-blue-50', text: 'text-blue-700', icon: '⟳' };
    case PaymentStatus.Succeeded:
      return { bg: 'bg-green-50', text: 'text-green-700', icon: '✓' };
    case PaymentStatus.Failed:
      return { bg: 'bg-red-50', text: 'text-red-700', icon: '✗' };
    case PaymentStatus.Refunded:
      return { bg: 'bg-gray-50', text: 'text-gray-700', icon: '↩' };
    case PaymentStatus.PartiallyRefunded:
      return { bg: 'bg-orange-50', text: 'text-orange-700', icon: '↩' };
    case PaymentStatus.RequiresAction:
      return { bg: 'bg-purple-50', text: 'text-purple-700', icon: '⚠' };
    case PaymentStatus.Canceled:
      return { bg: 'bg-gray-50', text: 'text-gray-700', icon: '✗' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-700', icon: '?' };
  }
};
