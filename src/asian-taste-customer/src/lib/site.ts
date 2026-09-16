/**
 * Store facts and service meta.
 *
 * Every value here is one the shop publishes. The footer used to carry an
 * invented address, invented hours and a Sydney (02) phone number — for an
 * Adelaide shop those are the two facts a first-time customer checks before
 * ordering, so a placeholder here is worse than omitting the element.
 *
 * Sources: the address is in docs/DESIGN/source/Menu.md; the phone, the opening
 * hours and the Google rating are the owner's, supplied 2026-09-16; the delivery
 * position is recorded in docs/TODO.md §10.
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
  phone: '08 8234 8232',
  phoneHref: 'tel:+61882348232',
  email: 'orders@asiantaste.com.au',
  /** IANA zone — the API stores this too (restaurant_settings.timezone). */
  timezone: 'Australia/Adelaide',
  /** The restaurant's own marketplace listing, for customers who would rather order there. */
  uberEatsUrl: 'https://www.ubereats.com/au/store/asian-taste/h_fV3HtmRTqW6In7OlIKWA',
  /** Google, supplied by the owner. Shown as-is; the platform publishes no more. */
  rating: { score: 4.6, count: 435 },
} as const;

/* ─── opening hours ─────────────────────────────────────────────────────────
   Two services a day, not one: the kitchen closes between lunch and dinner.
   Modelling this as a single open/close pair per day would report the shop
   closed from 4pm and send customers away mid-afternoon, so each day carries a
   list of windows. ISO day numbers, 1 = Monday. */

export interface OpenWindow {
  from: string;
  to: string;
}

export interface DayHours {
  /** 1 = Monday … 7 = Sunday */
  day: number;
  label: string;
  /** Empty means closed that day. */
  windows: OpenWindow[];
}

export const HOURS: DayHours[] = [
  { day: 1, label: 'Monday', windows: [{ from: '10:00', to: '14:30' }] },
  { day: 2, label: 'Tuesday', windows: [{ from: '10:00', to: '16:00' }, { from: '16:30', to: '21:00' }] },
  { day: 3, label: 'Wednesday', windows: [{ from: '10:00', to: '16:00' }, { from: '16:30', to: '21:00' }] },
  { day: 4, label: 'Thursday', windows: [{ from: '10:00', to: '16:00' }, { from: '16:30', to: '21:00' }] },
  { day: 5, label: 'Friday', windows: [{ from: '10:00', to: '16:00' }, { from: '16:30', to: '21:00' }] },
  { day: 6, label: 'Saturday', windows: [{ from: '10:00', to: '16:00' }, { from: '16:30', to: '21:00' }] },
  { day: 7, label: 'Sunday', windows: [{ from: '10:00', to: '16:00' }, { from: '16:30', to: '21:00' }] },
];

/** The footer reads one line per trading pattern rather than seven rows. */
export const HOURS_SUMMARY: Array<{ days: string; hours: string }> = [
  { days: 'Monday', hours: '10:00am – 2:30pm' },
  { days: 'Tuesday – Sunday', hours: '10:00am – 4:00pm, 4:30pm – 9:00pm' },
];

function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export interface OpenState {
  open: boolean;
  /** The window containing now, or the next one opening today. */
  closesAt?: string;
  opensAt?: string;
}

/**
 * Whether the shop is open right now, in *its* timezone rather than the
 * visitor's — a customer browsing from interstate, or a laptop set to UTC,
 * must not be told the wrong thing about an Adelaide kitchen.
 */
export function openState(now: Date = new Date()): OpenState {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: SITE.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const today = HOURS.find((d) => d.day === map[weekday]);
  if (!today) return { open: false };

  const minutes = hour * 60 + minute;

  for (const window of today.windows) {
    if (minutes >= toMinutes(window.from) && minutes < toMinutes(window.to)) {
      return { open: true, closesAt: window.to };
    }
  }

  const next = today.windows.find((w) => toMinutes(w.from) > minutes);
  return next ? { open: false, opensAt: next.from } : { open: false };
}

/** `16:00` → `4:00pm`, for display. */
export function prettyTime(value: string): string {
  const [h, m] = value.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')}${suffix}`;
}

/* ─── services ──────────────────────────────────────────────────────────────
   v1 is pickup only. Delivery is offered online but is subject to availability
   and never completes a checkout yet — the fulfilment pipeline is not built, and
   a button that took an order the shop cannot serve would be worse than no
   button. Uber Eats is a link out, not an order path here. */

export type ServiceId = 'pickup' | 'delivery' | 'ubereats';

export interface ServiceMeta {
  id: ServiceId;
  label: string;
  /** What this choice means, shown under the control. */
  note: string;
  /** Minutes for the ETA copy. */
  etaMinutes: number;
  etaLabel: string;
  /** True only for the service that can complete a checkout today. */
  orderable: boolean;
  /** Shown as a caveat next to the label. */
  caveat?: string;
  /** External services hand off rather than continue to checkout. */
  external?: string;
  /** Icon path data, so the control carries a mark rather than only words. */
  icon: 'bag' | 'car' | 'scooter';
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
  delivery: {
    id: 'delivery',
    label: 'Delivery',
    note: 'Delivered by our own driver within range',
    etaMinutes: 40,
    etaLabel: '35–45 min',
    orderable: false,
    caveat: 'Subject to availability · additional charge',
    icon: 'car',
  },
  ubereats: {
    id: 'ubereats',
    label: 'Uber Eats',
    note: 'Order through Uber Eats',
    etaMinutes: 35,
    etaLabel: '35–45 min',
    orderable: false,
    external: SITE.uberEatsUrl,
    icon: 'scooter',
  },
};

/** Pickup is the default and the first option: it is the service v1 can fulfil. */
export const SERVICE_ORDER: ServiceId[] = ['pickup', 'delivery', 'ubereats'];

export const DEFAULT_SERVICE: ServiceId = 'pickup';

/** Currency formatting for every price in the app. */
export function money(value: number): string {
  return `$${Number(value).toFixed(2)}`;
}
