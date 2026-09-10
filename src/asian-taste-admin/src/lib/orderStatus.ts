import type { VariantProps } from "class-variance-authority"
import type { badgeVariants } from "@/components/ui/badgeVariants"

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

/**
 * Maps an order status (as returned by the API, any casing) to a Badge variant.
 *
 * Previously each call site did `order.status.toLowerCase() as any`, which
 * defeated type checking entirely — a typo in a status name would silently
 * produce an unstyled badge instead of failing the build.
 */
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  pending: "pending",
  confirmed: "confirmed",
  preparing: "preparing",
  ready: "ready",
  completed: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
}

/** Resolves a status string to a known Badge variant, defaulting to `default`. */
export function getStatusVariant(status: string | null | undefined): BadgeVariant {
  if (!status) return "default"
  return STATUS_VARIANTS[status.trim().toLowerCase()] ?? "default"
}
