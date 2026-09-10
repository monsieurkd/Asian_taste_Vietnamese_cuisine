import axios from 'axios';
import { useCustomerAuthStore } from '@/stores/customerAuthStore';

// API base URL.
// Defaults to the relative '/api' path, which goes through the Vite dev proxy
// (see vite.config.ts). VITE_API_BASE_URL may point at a deployed API, e.g.
// https://api.asiantaste.com.au/api — it MUST include the /api segment.
//
// Guard: an env value of just an origin (http://localhost:5070) silently drops
// the /api prefix, so every request 404s while the app still renders. That cost
// us a real bug, so normalise it here rather than trusting the env file.
// Exported for tests (src/api/client.test.ts).
export function resolveApiBaseUrl(raw?: string): string {
  if (!raw) return '/api';

  const trimmed = raw.replace(/\/+$/, '');
  if (trimmed.endsWith('/api')) return trimmed;

  // Looks like a bare origin (or a path that forgot /api) — append it.
  if (/^https?:\/\/[^/]+$/.test(trimmed)) {
    console.warn(
      `VITE_API_BASE_URL is "${raw}" but is missing the "/api" segment; using "${trimmed}/api". ` +
        `Requests would otherwise 404. Fix .env.development (see README.md).`
    );
    return `${trimmed}/api`;
  }

  return trimmed;
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

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
