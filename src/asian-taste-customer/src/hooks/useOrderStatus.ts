import { useState, useEffect, useRef, useCallback } from 'react';
import { checkoutApi } from '@/api/checkoutApi';
import type { OrderDetailResponse } from '@/types/menu';

interface UseOrderStatusOptions {
  orderNumber: string;
  enabled?: boolean;
  onStatusChange?: (status: string) => void;
  pollInterval?: number; // Default: 5000ms
}

interface UseOrderStatusReturn {
  order: OrderDetailResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for polling order status updates
 * Falls back to polling for customer-facing updates
 * (WebSocket is reserved for admin dashboard with JWT auth)
 */
export function useOrderStatus({
  orderNumber,
  enabled = true,
  onStatusChange,
  pollInterval = 5000
}: UseOrderStatusOptions): UseOrderStatusReturn {
  const [order, setOrder] = useState<OrderDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousStatusRef = useRef<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderNumber) return;

    try {
      const data = await checkoutApi.getOrderByNumber(orderNumber);
      setOrder(data);
      setError(null);

      // Trigger callback when status changes
      if (previousStatusRef.current && previousStatusRef.current !== data.status) {
        onStatusChange?.(data.status);
      }
      previousStatusRef.current = data.status;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch order status';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [orderNumber, onStatusChange]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return; // Already polling

    // Initial fetch
    fetchOrder();

    // Set up interval
    intervalRef.current = setInterval(() => {
      fetchOrder();
    }, pollInterval);
  }, [fetchOrder, pollInterval]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchOrder();
  }, [fetchOrder]);

  // Stop polling if order reaches terminal state
  useEffect(() => {
    if (order && (order.status === 'Completed' || order.status === 'Cancelled')) {
      stopPolling();
    }
  }, [order, stopPolling]);

  // Start/stop polling based on enabled flag
  useEffect(() => {
    if (enabled && orderNumber) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [enabled, orderNumber, startPolling, stopPolling]);

  return {
    order,
    isLoading,
    error,
    refresh
  };
}
