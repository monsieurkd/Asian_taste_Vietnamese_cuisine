import apiClient from "./client"
import type { OrderStatus } from "@/types"

/**
 * The back-of-house API: the kitchen's own view of an order.
 *
 * Separate from `ordersApi` because it is a different job on the same data. `ordersApi` is
 * the order LIST — search, history, one row per order, for finding an order. This is the
 * BOARD — what is cooking, what is left, what is late — for working a service. The two
 * share nothing but the order id, and merging them would mean the search screen paying for
 * cook state it never shows.
 */

/** Queued → Cooking → Done. A dish's own state, separate from the order's stage. */
export type CookState = "Queued" | "Cooking" | "Done"

/** One dish, as the kitchen manages it. */
export interface KitchenItem {
  id: number
  menuItemName: string
  quantity: number
  modifiers?: string | null
  /** What the customer asked for. */
  specialInstructions?: string | null
  /** The kitchen's own note — never merged with the customer's. */
  kitchenNote?: string | null
  noteBy?: string | null
  cookState: CookState
  isCompleted: boolean
  startedAt?: string | null
  completedAt?: string | null
  cookedBy?: string | null
}

/** A ticket on the kitchen's board. */
export interface KitchenTicket {
  id: number
  orderNumber: string
  customerName: string
  customerPhone: string
  customerEmail: string
  orderType: string
  requestedTime: string
  status: OrderStatus
  paymentMethod?: string | null
  paymentStatus?: string | null
  subtotal: number
  total: number
  notes?: string | null
  allergyDeclaration?: string | null
  createdAt: string

  /** The hold. A separate axis from the stage. */
  isHeld: boolean
  heldAt?: string | null
  heldReason?: string | null
  heldBy?: string | null

  /** Dishes not yet Done. What "how much is left" means. */
  remainingLines: number

  /** Done/total, sent by the API. The count is authoritative; the items are the detail. */
  itemsDone: { done: number; total: number }
  /** Dishes on the wok right now. */
  cookingLines: number

  /**
   * Minutes since the order arrived, computed by the SERVER.
   *
   * Not derived in the browser, so a tablet whose clock is wrong cannot make a fresh order
   * look late: a kitchen's "this has been sitting 20 minutes" alarm is only useful if it
   * says the same thing on every screen in the room.
   */
  ageMinutes: number
  /** Wanted for a specific later time rather than ASAP. */
  isScheduled: boolean

  items?: KitchenItem[] | null
}

export interface KitchenBoardSummary {
  liveOrders: number
  awaitingAcceptance: number
  dishesToCook: number
  dishesCooking: number
  overdueOrders: number
  heldOrders: number
  collectedToday: number
}

export interface KitchenBoard {
  tickets: KitchenTicket[]
  summary: KitchenBoardSummary
}

export interface CookStateResult {
  orderId: number
  orderItemId: number
  cookState: CookState
  doneLines: number
  totalLines: number
  cookingLines: number
  orderStatus: OrderStatus
  orderMarkedReady: boolean
  customerNotified: boolean
}

export interface KitchenNoteResult {
  orderId: number
  orderItemId: number
  kitchenNote?: string | null
  noteBy?: string | null
}

export interface HoldResult {
  orderId: number
  isHeld: boolean
  heldReason?: string | null
  heldBy?: string | null
}

/** One line of a ticket's history. */
export interface OrderActivityEvent {
  id: number
  kind: string
  /** A sentence written to be read by a person, not a field-by-field diff. */
  detail: string
  actor?: string | null
  statusAtEvent?: string | null
  createdAt: string
}

export const kitchenApi = {
  /**
   * The kitchen's board.
   */
  async getBoard(includeFinished = false): Promise<KitchenBoard> {
    const response = await apiClient.get<KitchenBoard>("/admin/orders/kitchen", {
      params: { includeFinished },
    })
    return response.data
  },

  /**
   * Move one dish to a cook state.
   *
   * The state is SENT rather than toggled, so a doubled tap on a tablet settles on what the
   * cook meant instead of flipping twice.
   */
  async setCookState(orderId: number, itemId: number, state: CookState): Promise<CookStateResult> {
    const response = await apiClient.put<CookStateResult>(
      `/admin/orders/${orderId}/items/${itemId}/cook-state`,
      { state },
    )
    return response.data
  },

  /**
   * Write or clear the kitchen's note on a dish.
   *
   * A separate act from the cook state, because it is a different kind of fact: the state
   * says "done", the note says "and here is something the front needs to know".
   */
  async setKitchenNote(orderId: number, itemId: number, note: string): Promise<KitchenNoteResult> {
    const response = await apiClient.put<KitchenNoteResult>(
      `/admin/orders/${orderId}/items/${itemId}/kitchen-note`,
      { note },
    )
    return response.data
  },

  /**
   * Take a ticket off the line, or put it back.
   *
   * The reason is required to hold: a held ticket with no reason is one the next person has
   * to ask around about, which defeats taking it off the line instead of cancelling it.
   */
  async setHold(orderId: number, held: boolean, reason?: string): Promise<HoldResult> {
    const response = await apiClient.put<HoldResult>(`/admin/orders/${orderId}/hold`, {
      held,
      reason,
    })
    return response.data
  },

  /** Everything that has happened to an order, newest first. */
  async getActivity(orderId: number): Promise<OrderActivityEvent[]> {
    const response = await apiClient.get<OrderActivityEvent[]>(`/admin/orders/${orderId}/activity`)
    return response.data
  },
}
