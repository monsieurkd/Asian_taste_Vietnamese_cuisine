import apiClient from './client';

/**
 * Customer types
 */
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
  marketingConsent?: boolean;
  linkOrderNumber?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateAccountFromOrderRequest {
  email: string;
  password: string;
  orderNumber: string;
  marketingConsent?: boolean;
}

export interface CustomerAuthResponse {
  success: boolean;
  token?: string;
  customer?: CustomerInfo;
  error?: string;
}

export interface CustomerInfo {
  id: number;
  customerNumber: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}

export interface CustomerPaymentMethod {
  id: number;
  cardLastFour?: string;
  cardBrand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

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
  paymentMethods: CustomerPaymentMethod[];
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  marketingConsent?: boolean;
}

/**
 * Customer API endpoints
 */
export const customerApi = {
  /**
   * Register a new customer account
   */
  register: async (request: RegisterRequest): Promise<CustomerAuthResponse> => {
    const response = await apiClient.post<CustomerAuthResponse>('/customers/register', request);
    return response.data;
  },

  /**
   * Login with email and password
   */
  login: async (request: LoginRequest): Promise<CustomerAuthResponse> => {
    const response = await apiClient.post<CustomerAuthResponse>('/customers/login', request);
    return response.data;
  },

  /**
   * Create an account from an existing order
   */
  createFromOrder: async (request: CreateAccountFromOrderRequest): Promise<CustomerAuthResponse> => {
    const response = await apiClient.post<CustomerAuthResponse>('/customers/create-from-order', request);
    return response.data;
  },

  /**
   * Get current customer profile (requires auth)
   */
  getProfile: async (): Promise<CustomerProfile> => {
    const response = await apiClient.get<CustomerProfile>('/customers/profile');
    return response.data;
  },

  /**
   * Update customer profile (requires auth)
   */
  updateProfile: async (request: UpdateProfileRequest): Promise<CustomerProfile> => {
    const response = await apiClient.put<CustomerProfile>('/customers/profile', request);
    return response.data;
  },

  /**
   * Validate current token
   */
  validateToken: async (): Promise<{ customerId: number; email: string; customerNumber: string }> => {
    const response = await apiClient.post('/customers/validate');
    return response.data;
  },
};
