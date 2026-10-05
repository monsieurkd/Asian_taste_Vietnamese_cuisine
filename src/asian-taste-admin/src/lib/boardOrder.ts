import { OPEN_STATUSES, type StatusKey } from "./orderStatus"

/**
 * The kitchen's own ordering of the tickets inside each column.
 *
 * The board sorts a column oldest-first, which is the right default — the ticket that has
 * been waiting longest is the one to pick up — but it is only a default. A cook pulls one
 * ticket above another for reasons the clock cannot see: the customer is at the counter, the
 * bag is already packed, they are waiting on one ingredient before the next. The mockup gave
 * that reordering, and this is the store behind it.
 *
 * It is PER-DEVICE (localStorage), not a server field, and that is a deliberate limit rather
 * than an oversight: reordering a ticket is a gesture on the screen in front of you, and the
 * alternative — a new column, an endpoint and a migration on a table the kitchen writes to
 * all day — is a larger change than this feature earns. The cost is that two tablets can
 * order the same column differently, which is why it stays a manual override layered ON TOP
 * of the shared oldest-first default rather than replacing it. `docs/TODO.md` records the
 * follow-up if the owner ever wants the order to be the same on every screen.
 */

/** Order ids, per stage, as the kitchen arranged them. Absent stages use the default order. */
export type BoardRanks = Partial<Record<StatusKey, number[]>>

const STORAGE_KEY = "asiantaste.admin.board.order.v1"

/** Read the saved order, tolerating a missing or corrupt store rather than throwing on boot. */
export function readRanks(): BoardRanks {
  try {
    if (typeof localStorage === "undefined") return {}
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    const out: BoardRanks = {}
    for (const stage of OPEN_STATUSES) {
      const list = (parsed as Record<string, unknown>)[stage]
      if (Array.isArray(list)) out[stage] = list.filter((id): id is number => typeof id === "number")
    }
    return out
  } catch {
    return {}
  }
}

export function writeRanks(ranks: BoardRanks): void {
  try {
    if (typeof localStorage === "undefined") return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ranks))
  } catch {
    // A full or disabled store must not break the board; the order simply falls back to age.
  }
}

/**
 * Take the target column's ids as they are SHOWN, and return the new full order with `id`
 * inserted at `index`.
 *
 * Built from the displayed list rather than from the saved ranks on purpose: a column can be
 * partly ranked and partly default, and inserting into the saved ranks alone would drop the
 * moved ticket to the top of the unranked tail instead of where it was dropped. Freezing the
 * whole visible order makes the result match what the cook saw.
 */
export function insertInColumn(shownIds: number[], id: number, index: number): number[] {
  const rest = shownIds.filter((x) => x !== id)
  const at = Math.max(0, Math.min(index, rest.length))
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

/**
 * The saved order for one column, applied on top of the default age order.
 *
 * Ranked tickets come first in the order the kitchen set; anything unranked keeps the order
 * it arrived in (oldest first). A stable sort does this in one pass, so a new ticket appears
 * at the bottom of the column rather than jumping above everything the kitchen arranged.
 */
export function rankColumn<T extends { id: number }>(
  tickets: T[],
  stage: StatusKey,
  ranks: BoardRanks,
): T[] {
  const order = ranks[stage]
  if (!order || order.length === 0) return tickets

  const position = new Map(order.map((id, i) => [id, i]))
  return [...tickets].sort((a, b) => {
    const pa = position.get(a.id) ?? Number.POSITIVE_INFINITY
    const pb = position.get(b.id) ?? Number.POSITIVE_INFINITY
    return pa - pb
  })
}

/**
 * Replace one column's order, and drop the moved id from every other column's saved order.
 *
 * A ticket that leaves a stage must not keep a stale rank in it: without the removal, a ticket
 * dragged back into that stage months later would reappear wherever it used to sit, which is
 * not an order anyone set.
 */
export function setColumnOrder(ranks: BoardRanks, stage: StatusKey, movedId: number, order: number[]): BoardRanks {
  const next: BoardRanks = {}
  for (const key of OPEN_STATUSES) {
    const list = (ranks[key] ?? []).filter((id) => id !== movedId)
    if (list.length > 0) next[key] = list
  }
  next[stage] = order
  return next
}
