/**
 * The canonical order-status vocabulary.
 *
 * Six stages plus `cancelled`, keyed the way the design set keys them, so the
 * kitchen board, the order table, the detail timeline and the customer's own
 * tracker all read the same words. The API returns PascalCase (`Preparing`);
 * `statusKey` normalises it, and every screen goes through that one function
 * rather than each lowercasing on its own.
 */
export type StatusKey = "placed" | "confirmed" | "ready" | "cancelled"

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
    label: "Placed",
    desc: "Waiting for the kitchen to accept",
    cls: "status-placed",
  },
  // Accepted and being cooked are ONE stage. The kitchen starts as soon as it
  // accepts, so a separate "Preparing" button would never be pressed and the
  // ticket would sit in a column that lies about where it is.
  confirmed: {
    key: "confirmed",
    label: "Confirmed",
    desc: "Accepted and being cooked",
    cls: "status-confirmed",
  },
  ready: {
    key: "ready",
    label: "Ready",
    desc: "Packed and waiting to be collected",
    cls: "status-ready",
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
 * The journey ends at Ready: the customer collects, and no further state is
 * recorded. "Out for delivery" and "Completed" were removed with the v1 scope.
 */
export const STATUS_ORDER: StatusKey[] = ["placed", "confirmed", "ready"];

/**
 * Every value the API can hold, folded onto the three stages.
 *
 * `preparing` reads as `confirmed` (they are the same moment) and `completed`
 * reads as `ready` — an older order that reached the old terminal state must
 * not appear to be mid-flight, and must not vanish from the board either.
 */
const LOOKUP: Record<string, StatusKey> = {
  pending: "placed",
  placed: "placed",
  new: "placed",
  confirmed: "confirmed",
  preparing: "confirmed",
  ready: "ready",
  completed: "ready",
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
 * Ready is terminal for pickup — the customer collects and the ticket closes.
 */
export function nextStatus(status: string | null | undefined): StatusKey | null {
  const key = statusKey(status);
  if (key === "ready" || key === "cancelled") return null;
  const index = STATUS_ORDER.indexOf(key);
  return STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, index + 1)] ?? null;
}

/** The API's own value for a stage key, which is what a status update sends. */
const API_VALUE: Record<StatusKey, string> = {
  placed: "Pending",
  confirmed: "Confirmed",
  ready: "Ready",
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
