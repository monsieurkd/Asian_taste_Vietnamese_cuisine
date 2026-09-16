import { STATUS_META, statusKey } from "@/lib/orderStatus"

/**
 * A status as a pill.
 *
 * Always rendered through `statusKey`, never by lowercasing the API string at
 * the call site — a typo there used to produce an unstyled badge that looked
 * like missing data rather than a bug.
 */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const meta = STATUS_META[statusKey(status)]
  return (
    <span className={`status-pill ${meta.cls}`}>
      <span className="sdot" aria-hidden="true" />
      {label ?? meta.label}
    </span>
  )
}
