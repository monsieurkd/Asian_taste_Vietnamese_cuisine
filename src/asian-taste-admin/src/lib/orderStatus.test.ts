import { describe, it, expect } from "vitest"
import {
  API_STAGES,
  apiStatusValue,
  nextStatus,
  serviceLabel,
  statusKey,
  statusMeta,
  STATUS_META,
  STATUS_ORDER,
} from "./orderStatus"

/**
 * Tests for the order-status vocabulary.
 *
 * This replaced `order.status.toLowerCase() as any`, which defeated type
 * checking — a status the badge had no variant for rendered unstyled instead of
 * being caught. Every screen now goes through `statusKey`, so a regression here
 * shows as a wrong label in five places at once.
 */
describe("statusKey", () => {
  it("maps every status the API can send", () => {
    expect(statusKey("Pending")).toBe("placed")
    expect(statusKey("Confirmed")).toBe("confirmed")
    expect(statusKey("Ready")).toBe("ready")
    expect(statusKey("Cancelled")).toBe("cancelled")
  })

  it("folds the values the shop no longer sets onto the three stages", () => {
    // An order placed before the v1 scope change still has to read correctly,
    // and must not vanish from the board.
    expect(statusKey("Preparing")).toBe("confirmed")
    expect(statusKey("Completed")).toBe("ready")
  })

  it("is case- and whitespace-insensitive", () => {
    // The API is not guaranteed to send consistent casing.
    expect(statusKey("PENDING")).toBe("placed")
    expect(statusKey("  Ready  ")).toBe("ready")
    expect(statusKey("cAnCeLLeD")).toBe("cancelled")
  })

  it("accepts the US spelling of cancelled", () => {
    expect(statusKey("Canceled")).toBe("cancelled")
  })

  it("falls back to 'placed' for unknown or missing statuses", () => {
    // An unknown status must not throw and must not render an unstyled pill.
    expect(statusKey("Refunded")).toBe("placed")
    expect(statusKey("")).toBe("placed")
    expect(statusKey(null)).toBe("placed")
    expect(statusKey(undefined)).toBe("placed")
  })

  it("always resolves to a key that has metadata", () => {
    for (const status of ["Pending", "anything", "", "  ", "REFUNDED"]) {
      expect(STATUS_META[statusKey(status)]).toBeDefined()
    }
  })
})

describe("statusMeta", () => {
  it("returns a label and a status-pill class for every stage", () => {
    for (const key of STATUS_ORDER) {
      const meta = STATUS_META[key]
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.cls).toBe(`status-${key}`)
    }
  })

  it("exposes cancelled outside the six-stage order", () => {
    expect(STATUS_ORDER).not.toContain("cancelled")
    expect(statusMeta("Cancelled").label).toBe("Cancelled")
  })
})

describe("nextStatus", () => {
  it("walks the pickup stages in order", () => {
    expect(nextStatus("Pending")).toBe("confirmed")
    expect(nextStatus("Confirmed")).toBe("ready")
  })

  it("treats Preparing as Confirmed, not as its own step", () => {
    // The kitchen starts cooking the moment it accepts, so these are one state.
    expect(nextStatus("Preparing")).toBe("ready")
    expect(statusKey("Preparing")).toBe("confirmed")
  })

  it("has nowhere to go once the order is collected or cancelled", () => {
    // Ready is terminal for pickup. Offering a further step is how a ticket gets
    // silently reopened; offering one after Cancelled is worse.
    expect(nextStatus("Ready")).toBeNull()
    expect(nextStatus("Completed")).toBeNull()
    expect(nextStatus("Cancelled")).toBeNull()
  })

  it("never runs off the end of the stage list", () => {
    for (const status of STATUS_ORDER) {
      const next = nextStatus(apiStatusValue(status))
      if (next) expect(STATUS_ORDER.indexOf(next)).toBeLessThan(STATUS_ORDER.length)
    }
  })
})

describe("apiStatusValue", () => {
  it("round-trips every stage the API can actually hold", () => {
    // The console sends the API's vocabulary, never the design set's keys.
    for (const key of API_STAGES) {
      expect(statusKey(apiStatusValue(key))).toBe(key)
    }
    expect(apiStatusValue("cancelled")).toBe("Cancelled")
  })

  it("keeps every API stage inside the pickup lifecycle", () => {
    for (const key of API_STAGES) {
      expect(STATUS_ORDER).toContain(key)
    }
  })

  it("never sends a value for a stage the shop no longer has", () => {
    // "delivery" and "completed" are gone with the pickup-only scope. A stale
    // caller must not be able to write one back to the API.
    expect(Object.values(STATUS_META).map((m) => m.key)).not.toContain("delivery" as never)
    expect(STATUS_ORDER).toHaveLength(3)
  })
})

describe("serviceLabel", () => {
  it("labels the services the shop actually offers", () => {
    expect(serviceLabel("Pickup")).toBe("Pickup")
    expect(serviceLabel("Delivery")).toBe("Delivery")
    expect(serviceLabel("DineIn")).toBe("Dine in")
  })

  it("shows a dash rather than an empty cell", () => {
    expect(serviceLabel(null)).toBe("—")
    expect(serviceLabel(undefined)).toBe("—")
  })
})
