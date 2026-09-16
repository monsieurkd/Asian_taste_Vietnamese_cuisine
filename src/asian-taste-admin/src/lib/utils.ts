import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge Tailwind classes with proper precedence.
 *
 * Kept because the shadcn-style components this app used to carry were built on
 * it; the ported primitives take plain class strings, so anything new should not
 * need it.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a currency value in AUD.
 *
 * This said CAD. The shop is in Adelaide and every price in the database is AUD
 * — a console showing "CA$48.00" for an Australian order is a receipt the staff
 * cannot reconcile.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount)
}

const TZ = "Australia/Adelaide"

/** Format a date/time in the restaurant's own timezone, not the viewer's. */
export function formatDate(date: Date | string, format: "short" | "long" | "time" = "short"): string {
  const d = typeof date === "string" ? new Date(date) : date

  if (format === "time") {
    return new Intl.DateTimeFormat("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TZ,
    }).format(d)
  }

  if (format === "long") {
    return new Intl.DateTimeFormat("en-AU", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: TZ,
    }).format(d)
  }

  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(d)
}

/** Minutes since an ISO timestamp, for the "12 min ago" on a ticket. */
export function minutesAgo(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000))
}

/** The initials shown in an avatar. */
export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
}
