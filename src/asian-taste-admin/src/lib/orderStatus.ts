/**
 * The canonical order-status vocabulary.
 *
 * Six stages plus `cancelled`, keyed the way the design set keys them, so the
 * kitchen board, the order table, the detail timeline and the customer's own
 * tracker all read the same words. The API returns PascalCase (`Preparing`);
 * `statusKey` normalises it, and every screen goes through that one function
 * rather than each lowercasing on its own.
 */
export type StatusKey =
  | "placed"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivery"
  | "completed"
  | "cancelled"

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
  confirmed: {
    key: "confirmed",
    label: "Confirmed",
    desc: "Accepted, not started yet",
    cls: "status-confirmed",
  },
  preparing: {
    key: "preparing",
    label: "Preparing",
    desc: "On the wok right now",
    cls: "status-preparing",
  },
  ready: { key: "ready", label: "Ready", desc: "Packed and waiting", cls: "status-ready" },
  delivery: {
    key: "delivery",
    label: "Out for delivery",
    desc: "With the driver",
    cls: "status-delivery",
  },
  completed: { key: "completed", label: "Completed", desc: "Handed over", cls: "status-completed" },
  cancelled: {
    key: "cancelled",
    label: "Cancelled",
    desc: "Stopped or refunded",
    cls: "status-cancelled",
  },
};

/** The six stages a live order moves through, in order. */
export const STATUS_ORDER: StatusKey[] = [
  "placed",
  "confirmed",
  "preparing",
  "ready",
  "delivery",
  "completed",
];

const LOOKUP: Record<string, StatusKey> = {
  pending: "placed",
  placed: "placed",
  new: "placed",
  confirmed: "confirmed",
  preparing: "preparing",
  ready: "ready",
  delivery: "delivery",
  outfordelivery: "delivery",
  completed: "completed",
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

/** The stage to move to next, or null when the order is done. */
export function nextStatus(status: string | null | undefined): StatusKey | null {
  const key = statusKey(status);
  if (key === "completed" || key === "cancelled") return null;
  const index = STATUS_ORDER.indexOf(key);
  return STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, index + 1)] ?? null;
}

/**
 * The API's own value for a stage key, which is what a status update sends.
 *
 * `delivery` maps back to `Ready`: the booking API has six values and no
 * separate "out for delivery", so the console's fifth stage is a presentation
 * of Ready rather than a state the kitchen can store. That is deliberate — an
 * invented API value would be rejected, and showing progress the backend never
 * recorded would make the customer's tracker lie.
 */
const API_VALUE: Record<StatusKey, string> = {
  placed: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  delivery: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function apiStatusValue(key: StatusKey): string {
  return API_VALUE[key];
}

/** Stages the API itself can hold. `delivery` is a view of `ready`. */
export const API_STAGES: StatusKey[] = [
  "placed",
  "confirmed",
  "preparing",
  "ready",
  "completed",
];

export function serviceLabel(type: string | null | undefined): string {
  if (!type) return "—";
  const key = type.toLowerCase();
  if (key === "delivery") return "Delivery";
  if (key === "pickup") return "Pickup";
  if (key === "dinein" || key === "dine-in") return "Dine in";
  return type;
}
