import axios from 'axios';
import { useCustomerAuthStore } from '@/stores/customerAuthStore';

// API base URL.
// Defaults to the relative '/api' path, which goes through the Vite dev proxy
// (see vite.config.ts). Set VITE_API_BASE_URL to point at a deployed API,
// e.g. https://api.asiantaste.com.au/api
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Create axios instance with default config
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token if available
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = useCustomerAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle common errors
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.error || error.message || 'An error occurred';
      console.error('API Error:', error.response.data);
      return Promise.reject(new Error(message));
    } else if (error.request) {
      // Request made but no response
      console.error('Network Error:', error.message);
      return Promise.reject(new Error('Network error. Please check your connection.'));
    } else {
      // Error in setting up request
      console.error('Request Error:', error.message);
      return Promise.reject(error);
    }
  }
);

export default apiClient;
