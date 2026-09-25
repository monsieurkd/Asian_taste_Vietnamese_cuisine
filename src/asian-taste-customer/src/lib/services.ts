/**
 * How the customer gets their food, and why only one answer is a choice.
 *
 * v1 is pickup. Delivery was offered online — with a "subject to availability"
 * caveat — and could never complete a checkout, because the fulfilment pipeline does
 * not exist. That made a promise the shop could not keep, and it ended in a dead end:
 * a customer filled in a basket, chose delivery, reached payment, and was told to
 * switch to pickup. The offer is gone rather than caveated.
 *
 * Uber Eats is not a service you select here at all — it is a different shop, so it
 * lives in the footer as a link. It used to sit as a third button beside Pickup,
 * which read as another way to check out from this site.
 */

/** The one service the site fulfils. Kept named so call sites do not spell it. */
export type ServiceId = 'pickup';

export interface ServiceMeta {
  id: ServiceId;
  label: string;
  /** What this choice means, shown under the control. */
  note: string;
  /** Minutes for the ETA copy. */
  etaMinutes: number;
  etaLabel: string;
  /** True only for a service that can complete a checkout today. */
  orderable: boolean;
  /** Icon path data, so the control carries a mark rather than only words. */
  icon: 'bag';
}

export const SERVICES: Record<ServiceId, ServiceMeta> = {
  pickup: {
    id: 'pickup',
    label: 'Pickup',
    note: 'Ready to collect at 329 Henley Beach Rd',
    etaMinutes: 15,
    etaLabel: '15–20 min',
    orderable: true,
    icon: 'bag',
  },
};

/** The order the services are offered in. One entry, deliberately. */
export const SERVICE_ORDER: ServiceId[] = ['pickup'];

export const DEFAULT_SERVICE: ServiceId = 'pickup';
