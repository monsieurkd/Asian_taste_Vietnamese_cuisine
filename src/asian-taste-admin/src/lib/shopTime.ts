/**
 * Adelaide wall-clock helpers for the board and the counter.
 *
 * Every time the console prints is the SHOP's time, not the tablet's: a pickup
 * promise has to read the same to the wok, the counter and the customer, and a
 * tablet carried in from another timezone must not disagree with the till. The
 * same rule already governs the shop clock in `AdminLayout` and the dashboard's
 * summary window; this is the one place the board and counter get their labels.
 *
 * The timezone offset is applied with `Intl` rather than by adding a fixed number
 * of hours, so daylight saving is handled by the platform instead of by hand.
 */

const TZ = "Australia/Adelaide"

const TIME = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
})

const DAY = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
})

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/** A timestamp as milliseconds, from either an epoch number or an ISO string. */
function toMs(value: number | string | Date): number {
  if (typeof value === "number") return value
  return new Date(value).getTime()
}

function shopParts(ms: number): { year: number; month: number; day: number; hour: number; minute: number } {
  const out: Record<string, string> = {}
  for (const part of PARTS.formatToParts(new Date(ms))) out[part.type] = part.value
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
  }
}

/** The time as the shop reads it: `3:45 pm`. */
export function formatShopTime(value: number | string | Date): string {
  return TIME.format(new Date(toMs(value))).replace(/[\u202f\u00a0]/g, " ")
}

/**
 * The shop's own calendar/time fields for an instant.
 *
 * Exposed for the pickup editor, which steps the hour and minute and pins a day: those
 * operations have to happen in the SHOP's wall clock, not the tablet's, or an editor
 * opened in another timezone would send a time the kitchen never agreed to.
 */
export function shopClockParts(value: number | string | Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  return shopParts(toMs(value))
}

/** Whole calendar days between the shop's today and the given instant. */
export function shopDayOffset(value: number | string | Date): number {
  const now = new Date()
  const a = shopParts(now.getTime())
  const b = shopParts(toMs(value))
  const start = Date.UTC(a.year, a.month - 1, a.day)
  const target = Date.UTC(b.year, b.month - 1, b.day)
  return Math.round((target - start) / 86_400_000)
}

/** `Today`, `Tomorrow`, `Yesterday`, or `Mon 5 Oct`. */
export function shopDayLabel(value: number | string | Date): string {
  const offset = shopDayOffset(value)
  if (offset === 0) return "Today"
  if (offset === 1) return "Tomorrow"
  if (offset === -1) return "Yesterday"
  return DAY.format(new Date(toMs(value)))
}

/**
 * How far off the time is, in words: `in 12 min`, `3 min late`, `due now`,
 * `in 2 hr`, `in 1 day`.
 */
export function shopRelativeLabel(value: number | string | Date, now = Date.now()): string {
  const ms = toMs(value)
  if (!Number.isFinite(ms)) return ""

  const day = shopDayOffset(ms)
  const minutes = Math.round((ms - now) / 60_000)

  if (day > 0) {
    if (minutes < 60 * 24) return `in ${Math.max(1, Math.round(minutes / 60))} hr`
    return `in ${day} day${day > 1 ? "s" : ""}`
  }
  if (day < 0) return `${Math.abs(day)} day${Math.abs(day) > 1 ? "s" : ""} late`
  if (minutes < -1) return `${Math.abs(minutes)} min late`
  if (minutes <= 0) return "due now"
  if (minutes < 60) return `in ${minutes} min`
  return `in ${Math.round(minutes / 60)} hr`
}

/**
 * The Adelaide wall-clock instant for a local date and time, as an ISO string.
 *
 * Used by the pickup editor when a staff member pins an order to another day, and
 * by `shopNextDay`. The offset is measured at the guessed instant and then checked
 * once more, so a guess that lands on the other side of a DST boundary is corrected
 * rather than left an hour out.
 */
export function adelaideInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  const offset = tzOffsetMs(guess)
  let instant = guess - offset
  const offset2 = tzOffsetMs(instant)
  if (offset2 !== offset) instant = guess - offset2
  return new Date(instant).toISOString()
}

function tzOffsetMs(ms: number): number {
  const rounded = Math.round(ms / 60_000) * 60_000
  const p = shopParts(rounded)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - rounded
}
