import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CustomerInfo, CustomerProfile } from '@/api/customerApi';

interface CustomerAuthState {
  // Auth state
  isAuthenticated: boolean;
  token: string | null;
  customer: CustomerInfo | null;
  profile: CustomerProfile | null;

  // Loading/error states
  isLoading: boolean;
  error: string | null;

  // Actions
  setAuth: (token: string, customer: CustomerInfo) => void;
  setProfile: (profile: CustomerProfile) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateCustomerInfo: (info: Partial<CustomerInfo>) => void;
}

export const useCustomerAuthStore = create<CustomerAuthState>()(
  persist(
    (set) => ({
      // Initial state
      isAuthenticated: false,
      token: null,
      customer: null,
      profile: null,
      isLoading: false,
      error: null,

      // Actions
      setAuth: (token, customer) =>
        set({
          token,
          customer,
          isAuthenticated: true,
          error: null,
        }),

      setProfile: (profile) =>
        set({
          profile,
        }),

      clearAuth: () =>
        set({
          token: null,
          customer: null,
          profile: null,
          isAuthenticated: false,
          error: null,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      updateCustomerInfo: (info) =>
        set((state) => ({
          customer: state.customer
            ? { ...state.customer, ...info }
            : null,
        })),
    }),
    {
      name: 'asian-taste-customer-auth',
      // Only persist token and customer info, not loading/error states
      partialize: (state) => ({
        token: state.token,
        customer: state.customer,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Selectors
export const selectIsAuthenticated = (state: CustomerAuthState) => state.isAuthenticated;
export const selectCustomer = (state: CustomerAuthState) => state.customer;
export const selectAuthToken = (state: CustomerAuthState) => state.token;

// Helper to get auth header for API requests
export const getAuthHeader = () => {
  const state = useCustomerAuthStore.getState();
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
};
