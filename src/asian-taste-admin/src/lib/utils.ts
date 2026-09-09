import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Utility function to merge Tailwind CSS classes with proper precedence.
 * @param inputs - Class names to merge
 * @returns Merged class string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a currency value in CAD.
 * @param amount - Amount to format
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount)
}

/**
 * Format a date/time string for display.
 * @param date - Date to format
 * @param format - Format style (default: "short")
 * @returns Formatted date string
 */
export function formatDate(date: Date | string, format: "short" | "long" | "time" = "short"): string {
  const d = typeof date === "string" ? new Date(date) : date

  if (format === "time") {
    return new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)
  }

  if (format === "long") {
    return new Intl.DateTimeFormat("en-CA", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(d)
  }

  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

/**
 * Get the color for an order status.
 * @param status - Order status
 * @returns Tailwind color class
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    Pending: "text-[var(--color-status-pending)] bg-[var(--color-status-pending)]/10",
    Confirmed: "text-[var(--color-status-confirmed)] bg-[var(--color-status-confirmed)]/10",
    Preparing: "text-[var(--color-status-preparing)] bg-[var(--color-status-preparing)]/10",
    Ready: "text-[var(--color-status-ready)] bg-[var(--color-status-ready)]/10",
    Completed: "text-[var(--color-status-completed)] bg-[var(--color-status-completed)]/10",
    Cancelled: "text-[var(--color-status-cancelled)] bg-[var(--color-status-cancelled)]/10",
  }
  return colors[status] || "text-gray-500 bg-gray-100"
}
