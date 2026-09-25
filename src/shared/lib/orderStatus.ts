/**
 * The shared order-status vocabulary, used by both front-ends.
 *
 * Four stages, one for each thing that actually happens to an order, keyed the way
 * the design set keys them. Every screen — the kitchen board, the order table, the
 * detail timeline and the customer's own tracker — reads the same words, because
 * the API returns PascalCase (`Confirmed`), `statusKey` normalises it, and every
 * screen goes through that one function rather than each lowercasing on its own.
 *
 * The words are operational, not procedural:
 *
 *   placed     →  New        an order nobody has looked at yet
 *   confirmed  →  Cooking    accepted, and on the wok
 *   ready      →  Ready      packed, waiting for the counter
 *   collected  →  Collected   handed over — done
 *
 * "Confirmed" was the old word for the second stage and it told a cook nothing: the
 * board's own column header already said "Cooking" while the pill beside it said
 * "Confirmed", so one screen carried two vocabularies for one journey. The keys and
 * the API values are unchanged — this is a vocabulary, not a schema.
 *
 * Only the pill class is audience-specific: the storefront's stylesheet has no
 * `.status-collected`, so it reuses the settled grey. The words are the same for
 * both audiences, because they describe the same event.
 */
export type StatusKey = "placed" | "confirmed" | "ready" | "collected" | "cancelled"

/**
 * Who is looking at the status.
 *
 * Kept because the two stylesheets define different pill classes, and because the
 * storefront can receive values the pickup console never sets (`Preparing` from an
 * older order). The words no longer differ between the two.
 */
export type StatusLens = "restaurant" | "customer"

export interface StatusMeta {
  key: StatusKey
  label: string
  /** What this stage means, shown under the label in the status control. */
  desc: string
  cls: string
}

export const STATUS_META: Record<StatusKey, StatusMeta> = {
  placed: {
    key: "placed",
    label: "New",
    desc: "Waiting for the kitchen to accept",
    cls: "status-placed",
  },
  // Accepted and being cooked are ONE stage. The kitchen starts as soon as it
  // accepts, so a separate "Preparing" button would never be pressed and the
  // ticket would sit in a column that lies about where it is.
  confirmed: {
    key: "confirmed",
    label: "Cooking",
    desc: "Accepted and being cooked",
    cls: "status-confirmed",
  },
  ready: {
    key: "ready",
    label: "Ready",
    desc: "Packed and waiting to be collected",
    cls: "status-ready",
  },
  // The handover. It exists because "Ready" alone cannot tell the owner whether
  // an order was ever picked up: without it a bag left on the counter is
  // indistinguishable from one that went out the door, and neither is counted.
  // Stored as the API's `Completed`, which is the value it already had.
  collected: {
    key: "collected",
    label: "Collected",
    desc: "Handed to the customer — done",
    cls: "status-collected",
  },
  cancelled: {
    key: "cancelled",
    label: "Cancelled",
    desc: "Stopped or refunded",
    cls: "status-cancelled",
  },
};

/**
 * The stages a live order moves through, in order — pickup only.
 *
 * The journey ends at Collected, which is the press that clears the board. Note
 * that every screen iterating this list is iterating the *live* stages; the
 * dashboard's "done today" numbers are keyed off `collected` directly, because
 * a stage you press to finish an order must not also look like work in hand.
 */
export const STATUS_ORDER: StatusKey[] = ["placed", "confirmed", "ready", "collected"];

/**
 * The stages still needing someone's attention, i.e. everything but the end.
 *
 * This is the list the kitchen board renders and what "live orders" counts.
 * Collected orders are finished: they leave the board and land in today's
 * numbers instead of sitting in a column nobody needs to look at again.
 */
export const OPEN_STATUSES: StatusKey[] = ["placed", "confirmed", "ready"];

/** True once the order has been collected or cancelled — nothing further to do. */
export function isClosed(status: string | null | undefined): boolean {
  const key = statusKey(status);
  return key === "collected" || key === "cancelled";
}

/**
 * Every value the API can hold, folded onto the four stages.
 *
 * `preparing` reads as `confirmed` (they are the same moment) and `completed`
 * reads as `collected` — the API value the collected stage is stored as. Both
 * of those values can still arrive on orders placed before this change.
 */
const LOOKUP: Record<string, StatusKey> = {
  pending: "placed",
  placed: "placed",
  new: "placed",
  confirmed: "confirmed",
  preparing: "confirmed",
  ready: "ready",
  completed: "collected",
  collected: "collected",
  pickedup: "collected",
  cancelled: "cancelled",
  canceled: "cancelled",
};

/**
 * Normalises any status string the API or a WebSocket frame might send.
 *
 * `pending` maps to `placed` because the booking API has no "placed" value and
 * the console has no "pending" column — without the mapping the board would show
 * a column that never fills and a status the design set does not define.
 */
export function statusKey(status: string | null | undefined): StatusKey {
  if (!status) return "placed";
  return LOOKUP[status.trim().toLowerCase().replace(/[\s_-]/g, "")] ?? "placed";
}

export function statusMeta(status: string | null | undefined): StatusMeta {
  return STATUS_META[statusKey(status)];
}

/**
 * The stage to move to next, or null when there is nowhere further to go.
 *
 * Collected is terminal: the food has been handed over. Cancelled is too.
 */
export function nextStatus(status: string | null | undefined): StatusKey | null {
  const key = statusKey(status);
  if (key === "collected" || key === "cancelled") return null;
  const index = STATUS_ORDER.indexOf(key);
  return STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, index + 1)] ?? null;
}

/** The API's own value for a stage key, which is what a status update sends. */
const API_VALUE: Record<StatusKey, string> = {
  placed: "Pending",
  confirmed: "Confirmed",
  ready: "Ready",
  // The API has no `Collected`: the handover is its `Completed`. Sending the
  // API's own word is what keeps this a vocabulary change, not a schema change.
  collected: "Completed",
  cancelled: "Cancelled",
};

export function apiStatusValue(key: StatusKey): string {
  return API_VALUE[key];
}

/** Every stage the console can set. Same list as STATUS_ORDER, kept named. */
export const API_STAGES: StatusKey[] = STATUS_ORDER;

export function serviceLabel(type: string | null | undefined): string {
  if (!type) return "—";
  const key = type.toLowerCase();
  if (key === "delivery") return "Delivery";
  if (key === "pickup") return "Pickup";
  if (key === "dinein" || key === "dine-in") return "Dine in";
  return type;
}

/* ─── audience-specific presentation ────────────────────────────────────────
   The canonical keys above are shared. What differs is the word each side uses
   and the pill class each stylesheet defines. */

/** A status as one audience should read it. */
export interface StatusPresentation {
  label: string
  cls: string
}

/** Normalises to a comparable token: `Pending` → `pending`, `DINE_IN` → `dinein`. */
function statusToken(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase().replace(/[\s_-]/g, "")
}

/**
 * The word for a canonical stage, per audience.
 *
 * Identical for both, on purpose. The handover used to read "Delivered" to the
 * customer while the console said "Collected", which meant a support call about
 * the same order had two names for one event. Both audiences are describing food
 * handed over at the counter, so both see the same word.
 */
const LENS_LABEL: Record<StatusLens, Record<StatusKey, string>> = {
  restaurant: {
    placed: "New",
    confirmed: "Cooking",
    ready: "Ready",
    collected: "Collected",
    cancelled: "Cancelled",
  },
  customer: {
    placed: "New",
    confirmed: "Cooking",
    ready: "Ready",
    collected: "Collected",
    cancelled: "Cancelled",
  },
};

/**
 * The pill class each audience's stylesheet actually defines.
 *
 * The storefront sheet has no `.status-collected`, so the customer's delivered
 * state reuses the settled grey `.status-completed`. The console sheet has both.
 */
const LENS_CLS: Record<StatusLens, Record<StatusKey, string>> = {
  restaurant: {
    placed: "status-placed",
    confirmed: "status-confirmed",
    ready: "status-ready",
    collected: "status-collected",
    cancelled: "status-cancelled",
  },
  customer: {
    placed: "status-placed",
    confirmed: "status-confirmed",
    ready: "status-ready",
    collected: "status-completed",
    cancelled: "status-cancelled",
  },
};

/**
 * Raw values that fold onto a canonical stage but need a word of their own.
 *
 * `preparing` and `confirmed` are the same moment — the order key tests pin that —
 * so an order placed before they were merged still reads as `Cooking`. There is no
 * delivery or dine-in entry any more: v1 is pickup, and those states can never be
 * set.
 */
const RAW_STAGE_PRESENTATION: Record<string, StatusPresentation> = {
  preparing: { label: "Cooking", cls: "status-confirmed" },
};

/**
 * Renders a status in one audience's vocabulary.
 *
 * The default is the staff console's canonical reading; pass `lens: "customer"`
 * for the storefront. Keeping the lens a required argument on `StatusPill`
 * means a call site can never silently show the wrong audience's word.
 */
export function statusPresentation(
  status: string | null | undefined,
  lens: StatusLens = "restaurant",
): StatusPresentation {
  const raw = RAW_STAGE_PRESENTATION[statusToken(status)];
  if (raw) return { label: raw.label, cls: LENS_CLS[lens][statusKey(status)] };
  const key = statusKey(status);
  return { label: LENS_LABEL[lens][key], cls: LENS_CLS[lens][key] };
}
