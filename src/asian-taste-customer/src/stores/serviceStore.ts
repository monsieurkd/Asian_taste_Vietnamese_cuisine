import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrderType } from '@/types/menu';
import { DEFAULT_SERVICE, SERVICES, type ServiceId } from '@/lib/services';

interface ServiceState {
  /** Which service the customer is shopping for. Only pickup, for now. */
  service: ServiceId;
  /** The order type the checkout API accepts. */
  orderType: () => OrderType;
  setService: (service: ServiceId) => void;
}

/**
 * How the customer wants their food — remembered between visits.
 *
 * There is one value today, and this store is kept rather than inlined for two
 * reasons: a persisted value from an older build may name a service that no longer
 * exists, and every screen that reads "the current service" should not each have to
 * know that. When delivery is real, the model gains an entry here and the screens
 * that already ask for the service keep working.
 *
 * `orderType` resolves to Pickup for anything the store does not recognise, so a
 * stale persisted value cannot write an order type the API has no pipeline for.
 */
export const useServiceStore = create<ServiceState>()(
  persist(
    (set, get) => ({
      service: DEFAULT_SERVICE,
      orderType: () => (get().service === 'pickup' ? 'Pickup' : 'Pickup'),
      setService: (service) => set({ service }),
    }),
    {
      name: 'asian-taste-service',
      version: 3,
      // A persisted value from an older build — including one of the services that
      // were removed — would otherwise strand the cart on a service that cannot
      // complete, which is exactly what the delivery option used to do.
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
