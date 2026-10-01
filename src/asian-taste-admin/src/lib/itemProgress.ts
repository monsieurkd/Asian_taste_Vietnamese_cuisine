import type { Order, OrderItem, OrderListLine, OrderItemProgress, TicketLine } from "@/types"

/**
 * Reading a ticket's progress, and deciding what the kitchen can do with it.
 *
 * Kept out of the component for the same reason the other `lib/` files are: the rules
 * here are the ones that decide whether a cook is told the right thing, and a rule in a
 * component can only be checked by rendering it.
 *
 * The count itself comes from the SERVER (`order.itemsDone`), never from the fetched
 * lines. The board fetches lines, so deriving it here would work on the board and
 * silently read "0 of 0" everywhere else — and the one screen that does not fetch lines
 * is the one where the number is a summary rather than a control.
 */

/** The progress to show on a ticket, however the order arrived. */
export function progressOf(order: Order): OrderItemProgress {
  // Defensive about the server field: an older API (or a cached response) would send no
  // `itemsDone` at all, and "undefined of undefined" on a kitchen screen is worse than
  // falling back to what the lines themselves say.
  if (order.itemsDone && typeof order.itemsDone.total === "number") return order.itemsDone

  const lines = order.items ?? []
  return { done: lines.filter((l) => l.isCompleted).length, total: lines.length }
}

/**
 * Whether a ticket's dishes can be ticked right now.
 *
 * Only live orders are cooked. Ticking a line on a collected or cancelled ticket would
 * record a dish as made for an order that is over, and the API refuses it — so the console
 * refuses it first, rather than showing a control whose only outcome is an error.
 */
export function canTickItems(order: Order): boolean {
  const status = (order.status ?? "").toLowerCase()
  return status !== "cancelled" && status !== "completed"
}

/**
 * The one line of progress worth putting on a folded ticket.
 *
 * Returns null when there is nothing useful to say, so the caller renders nothing rather
 * than "0 of 0" — a ticket whose lines were never fetched is not a ticket with no food.
 */
export function progressLabel(order: Order): string | null {
  const { done, total } = progressOf(order)
  if (total === 0) return null

  if (done === total) return `All ${total} done`
  if (done === 0) return `${total} to cook`
  return `${done} of ${total} done`
}

/**
 * How far along a ticket is, as a fraction, for the progress bar.
 *
 * Zero lines reads as 0, not NaN: a division by zero here would render as `width: NaN%`,
 * which CSS ignores, so the bar would silently vanish rather than look broken.
 */
export function progressFraction(order: Order): number {
  const { done, total } = progressOf(order)
  if (total === 0) return 0
  return Math.min(1, Math.max(0, done / total))
}

/**
 * Whether this line is one the kitchen still has to make.
 */
export function isOutstanding(line: TicketLine): boolean {
  return !line.isCompleted
}

/**
 * The options and note for a line, as one readable sentence.
 *
 * The board shows lines small, so the options are joined rather than stacked: a ticket
 * with four dishes each carrying three options would otherwise be taller than the column
 * it lives in, which is how the bottom of a ticket stops being read.
 */
export function lineDetail(line: OrderListLine | OrderItem): string | null {
  const parts: string[] = []

  // Two shapes, one renderer. The list joins the options into a string in SQL; the detail
  // returns modifier objects. Handling both here means the ticket does not have to know
  // which endpoint its order came from — and the alternative, two line renderers, is how
  // a board and a ticket page start disagreeing about what a dish includes.
  if (typeof line.modifiers === "string") {
    if (line.modifiers) parts.push(line.modifiers)
  } else if (Array.isArray(line.modifiers)) {
    const names = line.modifiers.map((m) => m.modifierName).filter(Boolean)
    if (names.length) parts.push(names.join(", "))
  }

  if (line.specialInstructions) parts.push(`Note: ${line.specialInstructions}`)
  return parts.length ? parts.join(" · ") : null
}
