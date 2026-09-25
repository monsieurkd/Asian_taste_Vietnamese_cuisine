import apiClient from './client';

export interface CustomerProfile {
  id: number;
  customerNumber: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  emailVerified: boolean;
  createdAt: string;
  lastOrderAt?: string;
  orderCount: number;
}

/** The signed-in customer, as the auth store holds it. */
export interface CustomerInfo {
  id: number;
  customerNumber: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  marketingConsent?: boolean;
}

/**
 * Customer account endpoints.
 *
 * Two methods, because two are reachable. Register, login, create-from-order and
 * token-validation were all defined here and called from nowhere: accounts are made
 * through the checkout's own path, and the auth store validates by reading its own
 * stored token. A client method with no caller reads as a feature that exists.
 */
export const customerApi = {
  /**
   * Get current customer profile (requires auth).
   */
  getProfile: async (): Promise<CustomerProfile> => {
    const response = await apiClient.get<CustomerProfile>('/customers/profile');
    return response.data;
  },

  /**
   * Update customer profile (requires auth).
   */
  updateProfile: async (request: UpdateProfileRequest): Promise<CustomerProfile> => {
    const response = await apiClient.put<CustomerProfile>('/customers/profile', request);
    return response.data;
  },
};
