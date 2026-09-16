import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrderType } from '@/types/menu';
import type { ServiceId } from '@/lib/site';

interface ServiceState {
  /** Which service the customer is shopping for. */
  service: ServiceId;
  /** The order type the checkout API accepts. */
  orderType: () => OrderType;
  setService: (service: ServiceId) => void;
}

/**
 * Delivery or pickup, chosen once and remembered.
 *
 * This used to live in a 230-line "searchStore" and a checkout store, so the
 * drawer, the cart and the checkout each read it from somewhere different and
 * could disagree. One store, one answer.
 */
export const useServiceStore = create<ServiceState>()(
  persist(
    (set, get) => ({
      service: 'pickup',
      orderType: () => (get().service === 'delivery' ? 'Delivery' : 'Pickup'),
      setService: (service) => set({ service }),
    }),
    { name: 'asian-taste-service', version: 1 }
  )
);
