import type { OpeningHours } from './openingHours';

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


export interface OpenState {
  open: boolean;
  /** The window containing now, or the next one opening today. */
  closesAt?: string;
  opensAt?: string;
}

/* ─── opening hours ─────────────────────────────────────────────────────────
   The judgement itself lives in `./openingHours`, which is the version covered by
   tests. Two implementations used to exist: one here (simpler, and what the screens
   called) and one there (correct, with the boundary cases pinned, and used only by
   its own tests). The screens were therefore reading the weaker one — which is how a
   tested rule ends up proving nothing about the running app.

   `HOURS` below stays, because it is the *data* the shop publishes; the *rule* is
   imported from the tested module. */

/** The restaurant's published hours, in the shape the tested engine expects. */
export function publishedHours(): OpeningHours {
  return {
    days: HOURS.map((d) => {
      const first = d.windows[0];
      const last = d.windows[d.windows.length - 1];
      return {
        // ISO day number -> the engine's 0 = Sunday.
        day: d.day === 7 ? 0 : d.day,
        opens: first?.from ?? '00:00',
        closes: last?.to ?? '00:00',
        closed: d.windows.length === 0,
      };
    }),
    timezone: SITE.timezone,
  };
}

/** `16:00` → `4:00pm`, for display. */
export function prettyTime(value: string): string {
  const [h, m] = value.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')}${suffix}`;
}

/* ─── services ──────────────────────────────────────────────────────────────
   The service model lives in `./services` — v1 is pickup only, and the reasoning
   for dropping the delivery and Uber Eats options from it is recorded there. */

/** Currency formatting for every price in the app. */
export function money(value: number): string {
  return `$${Number(value).toFixed(2)}`;
}
