import { cva } from "class-variance-authority"

/**
 * Badge styling variants.
 *
 * Deliberately in its own module: a file that exports both a component and a
 * non-component breaks React Fast Refresh (`react-refresh/only-export-components`),
 * so `ui/badge.tsx` exports only the component and imports this.
 */
export const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-gray-100 text-gray-800",
        secondary: "bg-muted text-muted-foreground",
        pending: "bg-[var(--color-status-pending)]/10 text-[var(--color-status-pending)]",
        confirmed: "bg-[var(--color-status-confirmed)]/10 text-[var(--color-status-confirmed)]",
        preparing: "bg-[var(--color-status-preparing)]/10 text-[var(--color-status-preparing)]",
        ready: "bg-[var(--color-status-ready)]/10 text-[var(--color-status-ready)]",
        completed: "bg-[var(--color-status-completed)]/10 text-[var(--color-status-completed)]",
        cancelled: "bg-[var(--color-status-cancelled)]/10 text-[var(--color-status-cancelled)]",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        error: "bg-error/10 text-error",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)
