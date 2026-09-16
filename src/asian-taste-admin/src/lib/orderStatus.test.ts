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
    expect(statusKey("Preparing")).toBe("preparing")
    expect(statusKey("Ready")).toBe("ready")
    expect(statusKey("Completed")).toBe("completed")
    expect(statusKey("Cancelled")).toBe("cancelled")
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
  it("walks the six stages in order", () => {
    expect(nextStatus("Pending")).toBe("confirmed")
    expect(nextStatus("Confirmed")).toBe("preparing")
    expect(nextStatus("Preparing")).toBe("ready")
    expect(nextStatus("Ready")).toBe("delivery")
    expect(nextStatus("Delivery")).toBe("completed")
  })

  it("has nowhere to go once the order is finished", () => {
    // A completed or cancelled order must not offer a further step — that is
    // how a ticket gets silently reopened.
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

  it("collapses the presentation-only 'delivery' stage onto the API's Ready", () => {
    // The booking API has no "out for delivery" value. Inventing one would be
    // rejected; sending Ready keeps the order moving and the tracker honest.
    expect(apiStatusValue("delivery")).toBe("Ready")
    expect(statusKey(apiStatusValue("delivery"))).toBe("ready")
  })

  it("keeps every API stage inside the six-stage order", () => {
    for (const key of API_STAGES) {
      expect(STATUS_ORDER).toContain(key)
    }
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
