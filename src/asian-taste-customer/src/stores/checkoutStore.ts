import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrderType, PaymentMethod, PickupTime } from '@/types/menu';

// Snapshot of cart items at time of order
export interface PendingOrderItem {
  menuItemId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialInstructions?: string;
  selectedModifierIds: number[];
}

export interface PendingOrderData {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  orderType: OrderType;
  pickupTime: PickupTime;
  specialInstructions?: string;
  items: PendingOrderItem[];
  orderTotal: number;
  paymentMethod: PaymentMethod;
  createAccount: boolean;
  password?: string;
}

interface CheckoutState {
  // Customer info
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;

  // Order preferences
  orderType: OrderType;
  pickupTime: PickupTime;
  specialInstructions: string | null;

  // Payment
  paymentMethod: PaymentMethod;

  // Account creation
  createAccount: boolean;
  password?: string;

  // Pending order (for optimistic UI)
  pendingOrder: PendingOrderData | null;

  // State
  isLoading: boolean;
  error: string | null;
  lastOrderNumber: string | null;
  stripeClientSecret: string | null;
  stripePaymentIntentId: string | null;

  // Actions
  setCustomerInfo: (name: string, phone: string, email: string) => void;
  setOrderPreferences: (orderType: OrderType, pickupTime: PickupTime, instructions?: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setAccountCreation: (create: boolean, password?: string) => void;
  setPendingOrder: (order: PendingOrderData) => void;
  clearPendingOrder: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastOrderNumber: (orderNumber: string) => void;
  setStripeClientSecret: (clientSecret: string, paymentIntentId: string) => void;
  clearStripeInfo: () => void;
  reset: () => void;
}

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      // Initial state
      customerName: null,
      customerPhone: null,
      customerEmail: null,
      orderType: 'Pickup',
      pickupTime: { type: 'ASAP' },
      specialInstructions: null,
      paymentMethod: 'Card',
      createAccount: false,
      password: undefined,
      pendingOrder: null,
      isLoading: false,
      error: null,
      lastOrderNumber: null,
      stripeClientSecret: null,
      stripePaymentIntentId: null,

      // Actions
      setCustomerInfo: (name, phone, email) =>
        set({ customerName: name, customerPhone: phone, customerEmail: email }),

      setOrderPreferences: (orderType, pickupTime, instructions) =>
        set({ orderType, pickupTime, specialInstructions: instructions || null }),

      setPaymentMethod: (method) => set({ paymentMethod: method }),


      setAccountCreation: (create, password) =>
        set({ createAccount: create, password }),

      setPendingOrder: (order) => set({ pendingOrder: order }),

      clearPendingOrder: () => set({ pendingOrder: null }),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      setLastOrderNumber: (orderNumber) => set({ lastOrderNumber: orderNumber }),

      setStripeClientSecret: (clientSecret, paymentIntentId) =>
        set({ stripeClientSecret: clientSecret, stripePaymentIntentId: paymentIntentId }),

      clearStripeInfo: () =>
        set({ stripeClientSecret: null, stripePaymentIntentId: null }),

      reset: () =>
        set({
          customerName: null,
          customerPhone: null,
          customerEmail: null,
          orderType: 'Pickup',
          pickupTime: { type: 'ASAP' },
          specialInstructions: null,
          paymentMethod: 'Card',
              createAccount: false,
          password: undefined,
          pendingOrder: null,
          isLoading: false,
          error: null,
          lastOrderNumber: null,
          stripeClientSecret: null,
          stripePaymentIntentId: null,
        }),
    }),
    {
      name: 'asian-taste-checkout',
      // Only persist customer info, not loading/error states
      partialize: (state) => ({
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        customerEmail: state.customerEmail,
        orderType: state.orderType,
      }),
    }
  )
);

// Selectors
export const selectCustomerInfo = (state: CheckoutState) => ({
  name: state.customerName,
  phone: state.customerPhone,
  email: state.customerEmail,
});

export const selectOrderPreferences = (state: CheckoutState) => ({
  orderType: state.orderType,
  pickupTime: state.pickupTime,
  specialInstructions: state.specialInstructions,
});
