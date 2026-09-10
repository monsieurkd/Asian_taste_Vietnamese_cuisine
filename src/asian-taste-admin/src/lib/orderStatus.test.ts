import { describe, it, expect } from "vitest"
import { getStatusVariant } from "./orderStatus"

/**
 * Tests for the order-status → Badge-variant mapping.
 *
 * This replaced `order.status.toLowerCase() as any` at three call sites. The
 * `as any` defeated type checking, so a status the badge had no variant for
 * silently rendered unstyled instead of being caught.
 */
describe("getStatusVariant", () => {
  it("maps every known order status to its variant", () => {
    expect(getStatusVariant("Pending")).toBe("pending")
    expect(getStatusVariant("Confirmed")).toBe("confirmed")
    expect(getStatusVariant("Preparing")).toBe("preparing")
    expect(getStatusVariant("Ready")).toBe("ready")
    expect(getStatusVariant("Completed")).toBe("completed")
    expect(getStatusVariant("Cancelled")).toBe("cancelled")
  })

  it("is case- and whitespace-insensitive", () => {
    // The API is not guaranteed to send a consistent casing.
    expect(getStatusVariant("PENDING")).toBe("pending")
    expect(getStatusVariant("pending")).toBe("pending")
    expect(getStatusVariant("  Ready  ")).toBe("ready")
    expect(getStatusVariant("cAnCeLLeD")).toBe("cancelled")
  })

  it("accepts the US spelling of cancelled", () => {
    expect(getStatusVariant("Canceled")).toBe("cancelled")
  })

  it("falls back to 'default' for unknown or missing statuses", () => {
    // Unknown values must not throw — they render a neutral badge.
    expect(getStatusVariant("Refunded")).toBe("default")
    expect(getStatusVariant("")).toBe("default")
    expect(getStatusVariant(null)).toBe("default")
    expect(getStatusVariant(undefined)).toBe("default")
  })

  it("never returns undefined (which would render an unstyled badge)", () => {
    for (const status of ["Pending", "anything", "", "  "]) {
      expect(getStatusVariant(status)).toBeDefined()
    }
  })
})
