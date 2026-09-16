import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrderType } from '@/types/menu';
import { DEFAULT_SERVICE, SERVICES, type ServiceId } from '@/lib/site';

interface ServiceState {
  /** Which service the customer is shopping for. */
  service: ServiceId;
  /** The order type the checkout API accepts. Only ever set for an orderable service. */
  orderType: () => OrderType;
  setService: (service: ServiceId) => void;
}

/**
 * Pickup, delivery or Uber Eats — chosen once and remembered.
 *
 * Only an orderable service can reach checkout, so `orderType` resolves to
 * Pickup for anything that is not delivery; that keeps a stale persisted value
 * from a future delivery flow from writing an order type the API cannot accept.
 */
export const useServiceStore = create<ServiceState>()(
  persist(
    (set, get) => ({
      service: DEFAULT_SERVICE,
      orderType: () => (get().service === 'delivery' ? 'Delivery' : 'Pickup'),
      setService: (service) => set({ service }),
    }),
    {
      name: 'asian-taste-service',
      version: 2,
      // A persisted value from an older build, or one whose service has since
      // stopped being orderable, would otherwise strand the cart on a service
      // that cannot complete.
      merge: (persisted, current) => {
        const saved = (persisted as Partial<ServiceState> | undefined)?.service;
        return {
          ...current,
          service: saved && SERVICES[saved] ? saved : DEFAULT_SERVICE,
        };
      },
    }
  )
);

/** True when the chosen service can complete a checkout today. */
export function isOrderable(service: ServiceId): boolean {
  return SERVICES[service].orderable;
}
