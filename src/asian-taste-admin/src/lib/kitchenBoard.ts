import type { CookState, KitchenItem, KitchenTicket } from "@/api/kitchenApi"

/**
 * What the back-of-house board decides for itself.
 *
 * Kept out of the components for the same reason the other `lib/` files are: these are the
 * rules that decide what a cook is told, and a rule inside a component can only be checked
 * by rendering one. The server owns the hard numbers (age, counts, overdue); this owns the
 * presentation decisions, the order things arrive in, and what a tap should send.
 */

/**
 * The next state a dish should move to, or null when there is nowhere further to go.
 *
 * One step at a time, deliberately: a dish goes Queued → Cooking → Done, and the tap
 * advances one stage. A control that jumped straight to Done would let a cook mark food
 * ready they never picked up, and the whole point of the middle state is that the kitchen
 * can say what is actually happening.
 */
export function nextCookState(state: CookState): CookState | null {
  switch (state) {
    case "Queued":
      return "Cooking"
    case "Cooking":
      return "Done"
    case "Done":
      return null
  }
}

/** The verb for the tap, in the kitchen's words rather than the state's. */
export function cookActionLabel(state: CookState): string | null {
  switch (state) {
    case "Queued":
      return "Start"
    case "Cooking":
      return "Done"
    case "Done":
      return null
  }
}

/** Whether a dish can still be moved on. */
export function canAdvance(item: KitchenItem): boolean {
  return nextCookState(item.cookState) !== null
}

/**
 * How a dish reads on the board.
 *
 * "Start" rather than "Queued" because the label is a thing to do; the state name is how
 * the data is stored and is not what anyone says out loud.
 */
export function cookStateLabel(state: CookState): string {
  switch (state) {
    case "Queued":
      return "To cook"
    case "Cooking":
      return "Cooking"
    case "Done":
      return "Done"
  }
}

/**
 * A ticket's dishes grouped for a cook's eye, in the order they should be worked.
 *
 * Cooking first, then queued, then done. The dish on the wok is the one that needs
 * attention — it is the one that burns — and a list that keeps its original order buries it
 * among dishes that have not been started. Within a group the original order is preserved,
 * because that follows the customer's own list and is how the food was ordered.
 */
export function groupForCooking(items: KitchenItem[]): {
  cooking: KitchenItem[]
  queued: KitchenItem[]
  done: KitchenItem[]
} {
  return {
    cooking: items.filter((i) => i.cookState === "Cooking"),
    queued: items.filter((i) => i.cookState === "Queued"),
    done: items.filter((i) => i.cookState === "Done"),
  }
}

/**
 * How urgent a ticket is, as a band.
 *
 * Derived from the SERVER's `ageMinutes`, never from a client clock — see the note on that
 * field. The bands are the kitchen's, not a business rule: `late` is what a manager asks
 * about, `warning` is what a cook notices.
 */
export type Urgency = "normal" | "warning" | "late"

/** Minutes on the board before a ticket is worth a second look. */
export const WARNING_MINUTES = 15
/** Minutes before it is genuinely a problem. */
export const LATE_MINUTES = 25

export function urgencyOf(ticket: KitchenTicket): Urgency {
  // A scheduled order is not late for existing early — it is exactly on time. Judging it by
  // age would flag every 7pm order as overdue from the moment it was placed at 4pm, which is
  // how a board's warnings stop being read. So a scheduled ticket is measured only against
  // its own wanted time, and an immediate one only against how long it has sat.
  if (ticket.isScheduled) {
    const until = minutesUntilWanted(ticket)
    if (until === null) return "normal"
    // Past its time: late. Within a few minutes of it: worth watching.
    if (until < 0) return "late"
    if (until <= 5) return "warning"
    return "normal"
  }

  if (ticket.ageMinutes >= LATE_MINUTES) return "late"
  if (ticket.ageMinutes >= WARNING_MINUTES) return "warning"
  return "normal"
}

/**
 * Minutes until the order is wanted. Negative once that time has passed, null when the
 * time cannot be read.
 */
export function minutesUntilWanted(ticket: KitchenTicket, now = Date.now()): number | null {
  const wanted = new Date(ticket.requestedTime).getTime()
  if (!Number.isFinite(wanted)) return null
  return Math.round((wanted - now) / 60_000)
}

/**
 * How the wanted time reads on a ticket.
 *
 * "ASAP" for an immediate order — the same word the customer site uses, so a staff member
 * reading both screens is reading one vocabulary.
 */
export function wantedLabel(ticket: KitchenTicket): string {
  if (!ticket.isScheduled) return "ASAP"

  const until = minutesUntilWanted(ticket)
  if (until === null) return "Scheduled"
  if (until < -1) return `${Math.abs(until)} min late`
  if (until <= 1) return "Now"
  if (until < 60) return `in ${until} min`

  const wanted = new Date(ticket.requestedTime)
  return wanted.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

/**
 * The order's dishes, whether or not the API sent them.
 *
 * A ticket with `items: null` means the caller did not ask, which is NOT the same as an
 * order with no food — the same distinction the board makes. Returning an empty array here
 * would make the two indistinguishable, so the caller can tell them apart by checking the
 * count of the ticket's own `remainingLines`.
 */
export function itemsOf(ticket: KitchenTicket): KitchenItem[] {
  return ticket.items ?? []
}

/**
 * Whether this ticket still has work in it.
 *
 * A held ticket has work but should not be picked up, which is why the two are separate
 * questions rather than one.
 */
export function hasWorkLeft(ticket: KitchenTicket): boolean {
  return ticket.remainingLines > 0
}

/**
 * What to say about a ticket's progress, in one phrase.
 *
 * Returns null when there is nothing useful to say, so a caller renders nothing rather than
 * "0 of 0" — which reads as an order with no food rather than a missing count.
 */
export function progressPhrase(ticket: KitchenTicket): string | null {
  const done = ticket.itemsDone?.done ?? 0
  const total = ticket.itemsDone?.total ?? 0
  if (total === 0) return null

  if (ticket.cookingLines > 0 && done < total) {
    return `${done} of ${total} done · ${ticket.cookingLines} cooking`
  }
  if (done === total) return `All ${total} done`
  if (done === 0) return `${total} to cook`
  return `${done} of ${total} done`
}
