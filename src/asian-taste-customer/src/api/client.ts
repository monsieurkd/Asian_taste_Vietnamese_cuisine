import axios from 'axios';
import { useCustomerAuthStore } from '@/stores/customerAuthStore';

// API base URL.
//
// Defaults to the relative '/api' path, which goes through the Vite dev proxy
// (see vite.config.ts). For a deployed API this MUST be a full origin including
// the /api segment, e.g. https://asian-taste-api.fly.dev/api.
//
// Two guards, both from real outages:
//
// 1. An env value of just an origin (http://localhost:5070) silently drops the
//    /api prefix, so every request 404s while the app still renders.
//
// 2. THIS ONE TOOK THE SITE DOWN. The customer app reads VITE_API_BASE_URL, but
//    the Vercel project was only ever given VITE_API_URL — the name the ADMIN app
//    uses. With no value, this fell back to the relative '/api', so the browser
//    requested https://asian-taste-customer.vercel.app/api/menu (its own domain,
//    404) and the menu rendered "No items found". The API was healthy the whole
//    time and it reproduced on every load.
//
//    What made it hard to see: no request to the API host appears in the network
//    tab at all, because the request never leaves the frontend's own origin. It
//    looks like an empty database rather than a missing env var. The app's own
//    .env.example documented VITE_API_URL, contradicting this file, which is how
//    the wrong name got set in the first place.
//
//    Both names are now accepted; whichever is configured wins, and using the
//    wrong one warns instead of failing silently.
//
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

/**
 * Reads the configured API base URL, accepting either variable name.
 *
 * VITE_API_BASE_URL is the correct name for this app. VITE_API_URL is accepted
 * because it was the only name configured on the Vercel project, where rejecting
 * it produced a silent 404 on every request rather than a visible error.
 * Supporting both turns a misnamed variable into "works, with a warning".
 */
export function resolveConfiguredApiBaseUrl(env: {
  VITE_API_BASE_URL?: string;
  VITE_API_URL?: string;
}): string {
  if (env.VITE_API_BASE_URL) {
    return resolveApiBaseUrl(env.VITE_API_BASE_URL);
  }

  if (env.VITE_API_URL) {
    console.warn(
      'VITE_API_BASE_URL is not set; falling back to VITE_API_URL. This works, but note ' +
        "VITE_API_URL is the ADMIN app's variable name. Set VITE_API_BASE_URL to the same " +
        'value (including /api) on this project.'
    );
    return resolveApiBaseUrl(env.VITE_API_URL);
  }

  return resolveApiBaseUrl(undefined);
}

export const API_BASE_URL = resolveConfiguredApiBaseUrl({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_API_URL: import.meta.env.VITE_API_URL,
});

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
      // Server responded with error status.
      //
      // `message` is preferred over `error`, because the API distinguishes an error
      // CODE from the sentence a customer should read: a closed kitchen answers
      // `{ error: "kitchen_closed", message: "The kitchen opens at 10:00." }`, and
      // showing the code would tell the customer "kitchen_closed" instead of when to
      // come back. `error` remains the fallback for the endpoints that only send it.
      const body = error.response.data;
      const message = body?.message || body?.error || error.message || 'An error occurred';
      console.error('API Error:', body);
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
