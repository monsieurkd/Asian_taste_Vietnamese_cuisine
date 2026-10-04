import { AdminModal } from "@/components/ui/AdminModal"
import { Button } from "@/components/ui/Primitives"
import {
  adelaideInstant,
  formatShopTime,
  shopClockParts,
  shopDayLabel,
  shopDayOffset,
  shopRelativeLabel,
} from "@/lib/shopTime"

/**
 * The pickup-time editor.
 *
 * ONE editor for the two places a promise is set: the board, where it moves a time on an
 * order that already exists, and the counter, where it sets the time on an order being
 * taken. It lived inside `KitchenPage` until the counter needed it, and a second copy
 * would have been a second set of the shop-clock rules — which is exactly how the board's
 * "due soon" and the counter's drifted apart (§31/P4).
 *
 * It opens on NOW rather than on the order's current promise, because the usual reason to
 * open it is "the customer is running late" — staff nudge forward from the present, and a
 * draft seeded from a stale promise would make every +15 land in the past. It works
 * entirely in the SHOP's wall clock: the steppers and the day buttons use Adelaide fields,
 * so a tablet in another timezone cannot move an order to a time the kitchen never agreed to.
 *
 * It deliberately does NOT show the order's dishes or offer a reason field. Changing a time
 * is a one-field act.
 */
export function PickupTimeEditor({
  title,
  draft,
  now,
  setDraft,
  current,
  saving = false,
  confirmLabel = "Save time",
  onSave,
  onClose,
}: {
  title: string
  draft: number
  /** The instant the editor opened, in epoch ms. */
  now: number
  setDraft: (next: number | ((current: number) => number)) => void
  /**
   * The promise in force right now, shown as "currently promised". Null hides it — there
   * is nothing to compare against when the order has no time yet.
   */
  current?: number | string | Date | null
  saving?: boolean
  confirmLabel?: string
  onSave: () => void
  onClose: () => void
}) {
  const parts = shopClockParts(draft)
  const hour12 = parts.hour % 12 || 12
  const ampm = parts.hour < 12 ? "am" : "pm"
  const day = shopDayOffset(draft)

  return (
    <AdminModal
      title={title}
      labelledBy="pickup-title"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={onSave}>
            {saving ? "Saving…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="pick">
        <p className="pick-now">
          <span className="pick-now-label">Now</span>
          <strong>{formatShopTime(now)}</strong>
          <span className="pick-tz">Adelaide</span>
        </p>

        <div className="pick-preview">
          <span className="pick-time">{formatShopTime(draft)}</span>
          <span className="pick-meta">
            <span className="pick-day">{shopDayLabel(draft)}</span>
            <span className="dot">·</span>
            {shopRelativeLabel(draft)}
          </span>
        </div>

        {current != null && (
          <p className="pick-was">
            Currently promised <strong>{formatShopTime(current)}</strong>
          </p>
        )}

        <div className="pick-quick" role="group" aria-label="Push the pickup time">
          {[15, 30, 60, 120].map((mins) => (
            <button
              key={mins}
              type="button"
              className="pick-chip"
              onClick={() => setDraft(Date.now() + mins * 60_000)}
            >
              {mins < 60 ? `+${mins} min` : `+${mins / 60} hr`}
            </button>
          ))}
          <button type="button" className="pick-chip" onClick={() => setDraft(Date.now())}>
            Now
          </button>
        </div>

        <div className="pick-steppers">
          <div className="pick-step">
            <span className="pick-step-label">Hour</span>
            <div className="pick-step-ctl">
              <button
                type="button"
                className="pick-round"
                aria-label="One hour earlier"
                onClick={() => setDraft((d) => d - 3_600_000)}
              >
                −
              </button>
              <span className="pick-step-val">
                {hour12}
                <span className="pick-ampm">{ampm}</span>
              </span>
              <button
                type="button"
                className="pick-round"
                aria-label="One hour later"
                onClick={() => setDraft((d) => d + 3_600_000)}
              >
                +
              </button>
            </div>
          </div>

          <div className="pick-step">
            <span className="pick-step-label">Minute</span>
            <div className="pick-step-ctl">
              <button
                type="button"
                className="pick-round"
                aria-label="Five minutes earlier"
                onClick={() => setDraft((d) => d - 300_000)}
              >
                −
              </button>
              <span className="pick-step-val">{String(parts.minute).padStart(2, "0")}</span>
              <button
                type="button"
                className="pick-round"
                aria-label="Five minutes later"
                onClick={() => setDraft((d) => d + 300_000)}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="seg-sm pick-dayrow" role="group" aria-label="Pickup day">
          {[0, 1].map((offset) => (
            <button
              key={offset}
              type="button"
              aria-pressed={day === offset}
              onClick={() => {
                const today = shopClockParts(now)
                const p = shopClockParts(draft)
                setDraft(
                  new Date(
                    adelaideInstant(today.year, today.month, today.day + offset, p.hour, p.minute),
                  ).getTime(),
                )
              }}
            >
              {offset === 0 ? "Today" : "Tomorrow"}
            </button>
          ))}
        </div>

        <p className="pick-hint">Most orders move by 15–120 min. Pick Tomorrow only for a pre-order.</p>
      </div>
    </AdminModal>
  )
}
