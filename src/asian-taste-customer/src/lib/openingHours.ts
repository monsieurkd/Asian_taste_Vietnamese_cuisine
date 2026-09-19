/* ==========================================================================
   The restaurant's opening hours, judged in the restaurant's own timezone.

   The trap this file exists to close: the customer's browser is not in
   Adelaide. A tourist, a homesick regular on holiday, or anyone whose laptop is
   set to another zone would otherwise be told the shop is closed while it is
   open. Every judgement here happens against **Australia/Adelaide**, the same
   timezone the API uses for order numbers.

   Two further owner decisions are encoded:

   1. **A closed day is a normal state, not an error.** Sunday closed means
      Sunday closed; the UI should say so plainly rather than hiding the section.
   2. **"Closes at 21:00" means 21:00 inclusive.** An order placed at exactly
      21:00 is accepted — the kitchen's rule is the door, not the millisecond.
   ========================================================================== */

export const RESTAURANT_TIMEZONE = 'Australia/Adelaide';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** `0` is Sunday, matching `Date.getDay()`. */
export interface OpeningDay {
  day: number;
  /** `"HH:MM"` 24-hour, restaurant-local. */
  opens: string;
  closes: string;
  closed?: boolean;
}

export interface OpeningHours {
  days: OpeningDay[];
  timezone?: string;
}

/**
 * The restaurant-local wall-clock time for an instant, as `{ day, minutes }`.
 *
 * Uses `Intl` against an explicit timezone so the result does not depend on the
 * machine running it — which matters because tests run in CI, in UTC.
 */
export function localParts(
  at: Date,
  timezone: string = RESTAURANT_TIMEZONE,
): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  // `Intl` renders midnight as "24" in some locales/engines; it is hour 0.
  const normalisedHour = hour === 24 ? 0 : hour;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);

  return { day: day === -1 ? 0 : day, minutes: normalisedHour * 60 + minute };
}

/** `"21:00"` -> `1260`. Returns `null` for anything that is not a valid time. */
export function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export interface OpenState {
  open: boolean;
  /** Why, in words the UI can show directly. */
  reason: string;
  /** The matching entry for that day, when there is one. */
  today?: OpeningDay;
}

/**
 * Is the restaurant open at `at`?
 *
 * `closes` is treated as inclusive: open at exactly the closing minute.
 */
export function openState(
  hours: OpeningHours,
  at: Date = new Date(),
): OpenState {
  const timezone = hours.timezone ?? RESTAURANT_TIMEZONE;
  const { day, minutes } = localParts(at, timezone);
  const today = hours.days.find((d) => d.day === day);

  if (!today || today.closed) {
    return { open: false, reason: 'Closed today', today };
  }

  const opens = parseHm(today.opens);
  const closes = parseHm(today.closes);

  if (opens === null || closes === null) {
    // Malformed settings must not silently mean "open all day" — that is how a
    // customer orders from a closed kitchen.
    return { open: false, reason: 'Opening hours are unavailable', today };
  }

  if (minutes < opens) {
    return { open: false, reason: `Opens at ${today.opens}`, today };
  }
  if (minutes > closes) {
    return { open: false, reason: `Closed at ${today.closes}`, today };
  }
  return { open: true, reason: `Open until ${today.closes}`, today };
}

/**
 * The next time the restaurant opens, as a human phrase.
 *
 * Deliberately coarse ("Tomorrow at 11:00") rather than a countdown: a countdown
 * has to tick and be re-rendered, and it is wrong the moment the tab sleeps.
 */
export function nextOpening(
  hours: OpeningHours,
  at: Date = new Date(),
): string {
  const timezone = hours.timezone ?? RESTAURANT_TIMEZONE;
  const { day } = localParts(at, timezone);

  for (let ahead = 1; ahead <= 7; ahead++) {
    const candidate = hours.days.find((d) => d.day === (day + ahead) % 7);
    if (candidate && !candidate.closed && parseHm(candidate.opens) !== null) {
      return ahead === 1
        ? `Tomorrow at ${candidate.opens}`
        : `${DAY_NAMES[candidate.day]} at ${candidate.opens}`;
    }
  }
  return 'Opening hours are unavailable';
}
