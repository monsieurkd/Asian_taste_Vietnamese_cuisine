/**
 * Store facts and service meta.
 *
 * Every value here is one the shop actually publishes. The footer and hero used
 * to carry an invented address ("123 Main Street"), invented hours and a Sydney
 * (02) phone number — for an Adelaide shop those are not cosmetic, they are the
 * two facts a first-time customer checks before ordering. Nothing in this file
 * is a placeholder; if a value is unknown, leave it out of the UI rather than
 * filling it in here.
 *
 * Sources: the address is in docs/DESIGN/source/Menu.md; the phone and hours are
 * from the shop's Uber Eats listing (docs/DESIGN/mockups/src/assets/dishes/SOURCES.md).
 */

export const SITE = {
  name: 'Asian Taste',
  legalName: 'Asian Taste Vietnamese Cuisine',
  tagline: 'Vietnamese kitchen',
  /** The one-line promise the hero leads with. */
  promise: 'Slow-simmered broth, ready when you are.',
  suburb: 'Brooklyn Park',
  city: 'Adelaide',
  state: 'SA',
  postcode: '5032',
  street: '329 Henley Beach Rd',
  addressLine: '329 Henley Beach Rd, Brooklyn Park SA 5032',
  phone: '08 8298 8200',
  phoneHref: 'tel:+61882988200',
  email: 'orders@asiantaste.com.au',
  /** IANA zone — the API stores this too (restaurant_settings.timezone). */
  timezone: 'Australia/Adelaide',
} as const;

/** Trading hours, ISO day numbers (1 = Monday). From the shop's own listing. */
export const HOURS: Array<{ days: string; hours: string }> = [
  { days: 'Monday – Tuesday', hours: '10:00am – 2:30pm' },
  { days: 'Wednesday – Sunday', hours: '10:00am – 8:50pm' },
];

export const HOURS_SUMMARY = 'Open 7 days';

/**
 * Service types and their fulfilment facts.
 *
 * There is no fee field: the API derives an order's total from its item prices
 * alone, so anything charged here would not appear on the order or the receipt.
 * See the note on the service table below.
 */
export type ServiceId = 'delivery' | 'pickup';

export interface ServiceMeta {
  id: ServiceId;
  label: string;
  /** Minutes, matching restaurant_settings.pickup_minutes (15) for pickup. */
  etaMinutes: number;
  etaLabel: string;
  note: string;
  fulfil: string;
}

/**
 * The services and their fulfilment facts.
 *
 * Neither carries a charge. The API derives an order's total from its item
 * prices alone — there is no fee field on CreateOrderRequestDto — so a fee added
 * at the checkout would be taken from the card while the order, the receipt and
 * PaidAmount all recorded less. Adding one back means adding the field to the
 * API first; see docs/TODO.md §10.
 */
export const SERVICES: Record<ServiceId, ServiceMeta> = {
  pickup: {
    id: 'pickup',
    label: 'Pickup',
    etaMinutes: 15,
    etaLabel: '15–20 min',
    note: 'Ready for pickup at 329 Henley Beach Rd',
    fulfil: 'Pickup from 329 Henley Beach Rd',
  },
  delivery: {
    id: 'delivery',
    label: 'Delivery',
    etaMinutes: 30,
    etaLabel: '25–35 min',
    note: 'Delivered in 25–35 min',
    fulfil: 'Delivering to your address · 25–35 min',
  },
};

/** Currency formatting for every price in the app. */
export function money(value: number): string {
  return `$${Number(value).toFixed(2)}`;
}
