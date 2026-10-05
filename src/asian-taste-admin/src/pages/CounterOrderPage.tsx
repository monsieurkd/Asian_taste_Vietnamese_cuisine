import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { menuAdminApi, type MenuItemDetail, type Modifier } from "@/api/menuApi"
import { counterOrderApi, type CounterOrderCandidate } from "@/api/counterOrderApi"
import { ordersApi } from "@/api/orders"
import { AdminTop } from "@/components/AdminLayout"
import { Button, Panel, PanelBody, PanelHead, Pill, SkeletonRows } from "@/components/ui/Primitives"
import { AdminModal } from "@/components/ui/AdminModal"
import { PickupTimeEditor } from "@/components/orders/PickupTimeEditor"
import { showAdminToast } from "@/components/ui/AdminToast"
import { formatCurrency } from "@/lib/utils"
import { editMoney } from "@/lib/orderEdit"
import { formatShopTime, shopDayLabel, shopDayOffset, shopRelativeLabel } from "@/lib/shopTime"
import {
  MAX_QUANTITY,
  addLine,
  clearTicket,
  hasOptions,
  lineSignature,
  loadOrder,
  pricedUnit,
  removeLine,
  setQuantity,
  ticketItemCount,
  ticketTotal,
  toRequest,
  toggleModifier,
  unmetRequiredGroup,
  type TicketLineDraft,
} from "@/lib/counterTicket"

/**
 * The counter screen: a face-to-face order, built at speed.
 *
 * The whole design brief is "compact for efficiency", and that shapes every choice here:
 *
 *   * **The dish grid is dense and tap-to-add.** No opening a dish in a dialog unless it
 *     HAS options, because most of a Vietnamese menu is a name and a price and a staff
 *     member already knows what the customer said. Two taps became one.
 *   * **The menu is searchable from the first keystroke.** The search box is always on the
 *     toolbar rather than hidden behind a mode: "goi cuon" is faster to type than it is to
 *     hunt through fourteen categories, and it searches the category name too.
 *   * **The ticket is beside the grid, not behind a button.** The running total has to be
 *     readable while the customer is talking, and a total you have to navigate to is a
 *     total you quote from memory.
 *   * **No customer record, no payment provider.** Per the design decisions: staff take
 *     the order, the money is recorded as taken or owed, and nothing here can fail because
 *     Stripe is unreachable.
 *   * **The trading-hours rule does not apply.** A person with a tablet is proof the shop
 *     is open; the gate exists to stop scripts and stale tabs, and it would refuse a
 *     walk-in at 9:55pm — the last five minutes of trade.
 *
 * This screen was ported onto the console design beside the board, so the two now share a
 * toolbar, a tile, a quantity stepper and — through `PickupTimeEditor` — the same pickup
 * promise the board runs on. A counter order takes a pickup time by default; the board can
 * change it afterwards, and both read the shop clock, not the tablet's.
 */

/** A walked-in order is promised in this many minutes unless staff change it. */
const DEFAULT_PROMISE_MIN = 20

/** The synthetic rail entry that filters to the shop's popular dishes. */
const POPULAR = "__popular"

/** A promise this many minutes out. Read at call time, never cached at module load. */
const defaultWanted = () => Date.now() + DEFAULT_PROMISE_MIN * 60_000

export function CounterOrderPage() {
  const [lines, setLines] = useState<TicketLineDraft[]>(clearTicket())
  const [customerName, setCustomerName] = useState("")
  const [tableNumber, setTableNumber] = useState("")
  const [orderType, setOrderType] = useState<"Pickup" | "DineIn">("Pickup")
  const [notes, setNotes] = useState("")
  const [allergy, setAllergy] = useState("")
  const [markedPaid, setMarkedPaid] = useState(true)
  /** The promised time, in epoch ms. Always set for a new order, hidden when adding. */
  const [wantedAt, setWantedAt] = useState(defaultWanted)
  /** The pickup-time editor's working copy while it is open. */
  const [pickupOpen, setPickupOpen] = useState(false)
  const [pickupDraft, setPickupDraft] = useState(wantedAt)

  /** The menu-wide search. Filters the grid across every category. */
  const [menuQuery, setMenuQuery] = useState("")

  /**
   * The signature of the line just added, so its row can flash.
   *
   * A dish with options does not go straight on the bill — it opens a chooser — so without
   * this a tap looks like it did nothing. It clears itself once the animation has run.
   */
  const [pulseSig, setPulseSig] = useState<string | null>(null)

  /**
   * A ticking "now" for the promise.
   *
   * Relative labels and the late/due-soon tint must move as the clock does, or a screen
   * left open through a shift would keep saying "in 20 min" at 3pm. Thirty seconds is
   * enough for a minute-granularity label.
   */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!pulseSig) return
    const t = setTimeout(() => setPulseSig(null), 600)
    return () => clearTimeout(t)
  }, [pulseSig])

  /**
   * Whether this is a NEW order or an addition to one that exists.
   *
   * The two are the same screen on purpose. Once an existing order is loaded into the
   * ticket, every rule already written here applies unchanged — the dish grid, the options
   * panel, the required-choice refusal, quantities — and only the save button differs. A
   * separate "edit" screen would be a second copy of all of it, which is how the two would
   * drift apart.
   */
  const [mode, setMode] = useState<"new" | "existing">("new")
  /** The order being added to, once one has been chosen. */
  const [target, setTarget] = useState<CounterOrderCandidate | null>(null)
  /** What the order looked like when it was loaded, so the money can be told apart from it. */
  const [loadedFrom, setLoadedFrom] = useState<{ total: number; paymentStatus?: string | null; paidAmount?: number | null } | null>(null)
  /** The search term for finding an order to add to. */
  const [lookup, setLookup] = useState("")
  /** The reason for the change, recorded on the order. */
  const [reason, setReason] = useState("")

  /** The dish whose options are open, if any. */
  const [openDish, setOpenDish] = useState<MenuItemDetail | null>(null)
  /**
   * The ticket line being EDITED, or null when the panel is adding a new one.
   *
   * One panel, two outcomes. Editing a line and adding a dish differ only in where the
   * result goes, so they share the whole dialog — the option groups, the required-choice
   * refusal, the note field. A second edit dialog would be a second copy of those rules,
   * and the two would drift the way the two boards did (§22).
   */
  const [editingLineKey, setEditingLineKey] = useState<string | null>(null)
  /** Chosen options for the dish being configured. */
  const [pending, setPending] = useState<Modifier[]>([])
  const [pendingNote, setPendingNote] = useState("")
  /** What the last successful order was, for a confirmation the staff member can read out. */
  const [lastOrder, setLastOrder] = useState<{ orderNumber: string; note: string; updated?: boolean } | null>(null)

  const { data: dishes = [], isLoading } = useQuery({
    queryKey: ["counter-menu"],
    queryFn: () => menuAdminApi.getMenuItems(),
    // The menu changes rarely during a shift, and re-fetching it between customers would
    // make the grid flicker exactly when the staff member is trying to tap a dish.
    staleTime: 5 * 60 * 1000,
  })

  // `isAvailable` is the field the server sends. This used to filter on `isActive`,
  // which the endpoint never returned — so the list was empty and the grid below mapped
  // over nothing, rendering a counter screen with no dishes on it at all.
  const available = useMemo(() => dishes.filter((d) => d.isAvailable), [dishes])

  const categories = useMemo(
    () => [...new Set(available.map((d) => d.categoryName || "Other"))],
    [available],
  )

  const popularDishes = useMemo(() => available.filter((d) => d.isPopular), [available])

  /**
   * Which rail entry is showing, as a CHOICE (`null` = "not chosen yet").
   *
   * The grid used to render ALL 14 categories stacked, which made the menu column about
   * 4,900px tall — 82 dishes end to end. That was the real reason an order needed scrolling
   * to complete: the running ticket sits beside that column, so it could not stick.
   *
   * One category at a time makes the menu roughly a screen tall. While a search is running
   * no category is pressed: the search spans all of them, and lighting one up would claim
   * it is filtering when it is not.
   */
  const [chosenCategory, setChosenCategory] = useState<string | null>(null)

  const searching = menuQuery.trim().length > 0

  /** The category (or Popular) actually on screen when no search is running. */
  const activeCategory = useMemo(() => {
    if (chosenCategory === POPULAR) return POPULAR
    if (chosenCategory && categories.includes(chosenCategory)) return chosenCategory
    return categories[0] ?? null
  }, [chosenCategory, categories])

  /**
   * Dishes on screen: the search wins over a category, so typing narrows the whole menu
   * instead of the one rail entry that happened to be lit.
   */
  const dishesInView = useMemo(() => {
    const q = menuQuery.trim().toLowerCase()
    if (q) {
      return available.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.categoryName || "Other").toLowerCase().includes(q),
      )
    }
    if (activeCategory === POPULAR) return popularDishes
    if (activeCategory === null) return []
    return available.filter((d) => (d.categoryName || "Other") === activeCategory)
  }, [available, menuQuery, activeCategory, popularDishes])

  const total = ticketTotal(lines)

  /**
   * The money consequence of the change, when adding to an order that already exists.
   *
   * This is `editMoney` — the SAME tested rule the phone-edit screen uses — rather than a
   * second implementation for the counter. The case it exists for is an order whose card
   * was already charged: raising the total leaves money that nothing in this app will
   * collect, and lowering it leaves money owed back. Both are conversations to have with
   * the customer in front of you, so the screen says which one it is BEFORE saving, not
   * after.
   *
   * Null in "new order" mode: there is no previous total to compare against, and the
   * counter order carries its own paid/owing checkbox.
   */
  const money = useMemo(() => {
    if (mode !== "existing" || !loadedFrom) return null
    return editMoney(lines, loadedFrom.total, loadedFrom.paymentStatus, loadedFrom.paidAmount)
  }, [mode, loadedFrom, lines])

  /** Orders matching what the staff member typed, so they can pick the right one. */
  const { data: candidates = [], isFetching: searchingOrders } = useQuery({
    queryKey: ["counter-order-lookup", lookup],
    queryFn: () => counterOrderApi.findExisting(lookup),
    // Only while looking: a background refetch of a search nobody is waiting on would be
    // requests per keystroke for no benefit.
    enabled: mode === "existing" && lookup.trim().length >= 3 && !target,
    staleTime: 10_000,
  })

  /**
   * Load an order into the ticket.
   *
   * The whole order is fetched (not the row from the search) because the ticket needs the
   * lines, and its stored prices are what the customer was quoted. `loadedFrom` keeps the
   * payment facts, which the money panel compares against.
   */
  const load = useMutation({
    mutationFn: (id: number) => ordersApi.getOrderDetail(id),
    onSuccess: (order) => {
      setLines(loadOrder(order))
      setTarget({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        status: order.status,
        total: order.total,
        itemsDone: order.itemsDone,
        createdAt: order.createdAt,
      })
      setLoadedFrom({
        total: order.total,
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount ?? null,
      })
      setReason("")
      setLookup("")
      showAdminToast(`${order.orderNumber} loaded — add what they want`)
    },
    onError: () => showAdminToast("Couldn't load that order — try again"),
  })

  /** Clear the ticket and every field that belongs to a single order. */
  const startFresh = () => {
    setLines(clearTicket())
    setCustomerName("")
    setTableNumber("")
    setNotes("")
    setAllergy("")
    setMarkedPaid(true)
    setWantedAt(defaultWanted())
    setMenuQuery("")
    setPulseSig(null)
  }

  const clearTarget = () => {
    setTarget(null)
    setLoadedFrom(null)
    setReason("")
    setMode("new")
    startFresh()
  }

  const isAddingToOrder = mode === "existing" && !!target

  /**
   * Save. Two different endpoints, one button.
   *
   * A new order POSTs and starts at Confirmed — taking it IS the acceptance. An addition
   * REPLACES the existing order's lines through the same endpoint the phone-edit path
   * uses, so the pricing rules and the money reporting are one implementation rather than
   * two that can disagree.
   */
  const submit = useMutation({
    mutationFn: async () => {
      if (isAddingToOrder && target) {
        return counterOrderApi.replaceItems(target.id, {
          items: toRequest(lines, {}).items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            specialInstructions: i.specialInstructions,
            modifierIds: i.modifierIds ?? [],
          })),
          reason: reason.trim() || undefined,
        })
      }
      return counterOrderApi.create(
        toRequest(lines, {
          customerName: customerName.trim() || undefined,
          orderType,
          tableNumber: tableNumber.trim() || undefined,
          notes: notes.trim() || undefined,
          allergyDeclaration: allergy.trim() || undefined,
          markedPaid,
          // Every counter order carries a promise. The board runs on it and the customer
          // is told it, so leaving it out would make this screen the one place a time is
          // unknown. `toISOString` sends a Z-suffixed instant, which the server reads as
          // the shop's own wall clock.
          pickupTime: { type: "SCHEDULED", scheduledTime: new Date(wantedAt).toISOString() },
        }) as Parameters<typeof counterOrderApi.create>[0],
      )
    },

    onSuccess: (result) => {
      if (isAddingToOrder) {
        // The edit response carries the recomputed total and a sentence about the money.
        // Reading THEM out is the point: the staff member quotes a figure, and the note
        // says whether there is anything left to collect.
        const edit = result as { orderNumber: string; total: number; paymentNote?: string }
        setLastOrder({
          orderNumber: edit.orderNumber,
          note: edit.paymentNote ?? `Now ${formatCurrency(edit.total)}.`,
          updated: true,
        })
        setTarget(null)
        setLoadedFrom(null)
        setReason("")
        setMode("new")
        startFresh()
        showAdminToast(
          `${edit.orderNumber} updated — now ${formatCurrency(edit.total)}`,
        )
        return
      }

      const created = result as { orderNumber: string; counterNote: string }
      // The ticket clears and the number is kept on screen. Both matter: a staff member
      // reads the number out to the customer, and a ticket that stayed behind would be
      // sent twice by the next tap.
      setLastOrder({ orderNumber: created.orderNumber, note: created.counterNote })
      startFresh()
      showAdminToast(`${created.orderNumber} sent to the kitchen`)
    },
    onError: (error: unknown) => {
      // The message names the dish when one has left the menu, which is the case a staff
      // member can actually act on.
      const detail = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      showAdminToast(detail ?? "Couldn't save that — try again")
    },
  })

  /** Remember which line to flash, by the same key the merge in `addLine` uses. */
  const pulse = (dish: MenuItemDetail, modifiers: Modifier[], note = "") => {
    setPulseSig(lineSignature({ menuItemId: dish.id, modifiers, note: note.trim() }))
  }

  /**
   * Add a dish straight onto the ticket — one tap, no dialog.
   *
   * Options are edited afterwards from the line's Edit button (`editLine`), which is where a
   * staff member already looks to correct a line. Opening the picker on every tap made the
   * common case — a dish with no choices, or one taking every default — cost a second press
   * and a dialog, which is the exact flow the counter is meant to avoid. Every dish is still
   * re-priced on the way in, so a defaulted line is never a cheaper line.
   */
  const choose = (dish: MenuItemDetail) => {
    setLines((current) => addLine(current, dish))
    pulse(dish, [])
  }

  /**
   * Edit a line that is already on the bill — its options and its note.
   *
   * The dish's own MenuItemDetail is looked up from the menu rather than reconstructed from
   * the line, because the panel needs the option GROUPS to render the choices, and a ticket
   * line only stores the choices that were picked. If the dish has left the menu the line is
   * still editable for its NOTE — losing the ability to correct a note because a dish was
   * retired would be a worse outcome than not offering the options.
   */
  const editLine = (lineKey: string) => {
    const line = lines.find((l) => l.key === lineKey)
    if (!line) return

    const dish = available.find((d) => d.id === line.menuItemId)
    if (!dish || !hasOptions(dish)) {
      // No options to change: the quantity and note controls are already on the row, so
      // opening a panel with nothing in it would be a dead end. Edit the note in place.
      setEditingLineKey(lineKey)
      setPending([])
      setPendingNote(line.note)
      setOpenDish(
        dish ?? {
          id: line.menuItemId,
          name: line.name,
          price: line.unitPrice,
          basePrice: line.unitPrice,
          categoryId: 0,
          categoryName: "",
          isActive: true,
          isAvailable: true,
          isPopular: false,
          spicyLevel: 0,
          isVegetarian: false,
          isVegan: false,
          isGlutenFree: false,
          modifierGroups: [],
        },
      )
      return
    }

    setEditingLineKey(lineKey)
    setPending(line.modifiers)
    setPendingNote(line.note)
    setOpenDish(dish)
  }

  const confirmDish = () => {
    if (!openDish) return

    const missing = unmetRequiredGroup(openDish, pending)
    if (missing) {
      // Says WHICH group. "Choose an option" would leave the staff member scanning a
      // dialog while the customer waits.
      showAdminToast(`Choose ${missing}`)
      return
    }

    if (editingLineKey !== null) {
      // Replace the line's options and note IN PLACE, keeping its position and quantity.
      // Removing and re-adding would lose the order the kitchen reads the ticket in, and
      // a line with a different quantity would come back as one.
      //
      // Re-priced from the line's BASE price, not its current unit price: pricing on top of
      // a total that already includes the old options would charge for them twice.
      setLines((current) =>
        current.map((l) =>
          l.key === editingLineKey
            ? {
                ...l,
                modifiers: pending,
                note: pendingNote.trim(),
                unitPrice: pricedUnit(l.basePrice ?? l.unitPrice, pending),
              }
            : l,
        ),
      )
      setEditingLineKey(null)
      setOpenDish(null)
      showAdminToast(`${openDish.name} updated`)
      return
    }

    setLines((current) => addLine(current, openDish, pending, pendingNote))
    pulse(openDish, pending, pendingNote)
    setOpenDish(null)
  }

  const itemCount = ticketItemCount(lines)

  /** The promise's own clock state: whether it has passed or is nearly due, per the shop day. */
  const minsToPromise = Math.round((wantedAt - now) / 60_000)
  const promiseIsToday = shopDayOffset(wantedAt) === 0
  const promiseIsLate = promiseIsToday && minsToPromise < 0
  const promiseIsWarn = promiseIsToday && minsToPromise >= 0 && minsToPromise <= 10
  const promiseWord = orderType === "DineIn" ? "serve" : "pickup"

  const canSend = lines.length > 0 && !submit.isPending

  return (
    <>
      <AdminTop
        title={isAddingToOrder ? `Add to ${target!.orderNumber}` : "Counter order"}
        sub={
          isAddingToOrder
            ? "Add what they asked for. The order is re-priced when you save."
            : "Take an order for someone standing with you. No payment is taken here."
        }
        actions={
          <Pill neutral>
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatCurrency(total)}
          </Pill>
        }
      />

      <div className="admin-page counter-page" data-od-id="counter">
        {/* ── The toolbar ────────────────────────────────────────────────────────
            Mode, the always-on menu search, and the order lookup that appears only
            when adding. New order and add-to-order are one screen: a separate edit
            screen would be a second copy of the dish grid, the options panel and the
            ticket rules, and the two would drift. */}
        <div className="counter-toolbar" data-od-id="counter-mode">
          <div className="seg-sm" role="group" aria-label="What are you doing?">
            <button
              type="button"
              aria-pressed={mode === "new"}
              onClick={() => {
                setMode("new")
                setTarget(null)
                setLoadedFrom(null)
                startFresh()
              }}
            >
              New order
            </button>
            <button
              type="button"
              aria-pressed={mode === "existing"}
              onClick={() => {
                setMode("existing")
                setTarget(null)
                setLoadedFrom(null)
                startFresh()
              }}
            >
              Add to an order
            </button>
          </div>

          {/* Search the menu, always. Typing "banh mi" beats hunting fourteen categories. */}
          <div className="search" id="menuSearchWrap">
            <label className="sr-only" htmlFor="menu-search">
              Search the menu
            </label>
            <input
              id="menu-search"
              className="input"
              type="search"
              placeholder="Search the menu — dish name or category"
              autoComplete="off"
              value={menuQuery}
              onChange={(e) => setMenuQuery(e.target.value)}
            />
          </div>

          {isAddingToOrder && (
            <span className="head-who">
              <span className="avatar" aria-hidden="true">
                {initials(target!.customerName)}
              </span>
              <span>
                <strong>{target!.orderNumber}</strong>
                <span className="meta">
                  {target!.customerName} · {formatCurrency(target!.total)} on the docket
                </span>
              </span>
              <button type="button" className="btn-link" onClick={clearTarget}>
                Start a new order instead
              </button>
            </span>
          )}

          {mode === "existing" && !isAddingToOrder && (
            <div className="search" id="lookupWrap">
              <label className="sr-only" htmlFor="order-lookup">
                Find an order
              </label>
              <input
                id="order-lookup"
                className="input"
                type="search"
                placeholder="Docket number, e.g. AT-031407 or a name"
                autoComplete="off"
                autoFocus
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
              />
            </div>
          )}

          {/* The matches. Shown rather than auto-loaded, because a partial docket number
              read out loud usually matches more than one order. */}
          {mode === "existing" && !isAddingToOrder && lookup.trim().length >= 3 && (
            <div className="lookup-results">
              {searchingOrders ? (
                <p className="meta" style={{ margin: 0 }}>Searching…</p>
              ) : candidates.length === 0 ? (
                <p className="meta" style={{ margin: 0 }}>
                  No order matches “{lookup.trim()}”. Check the docket, or start a new order.
                </p>
              ) : (
                <ul className="order-picks">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="order-pick"
                        disabled={load.isPending}
                        onClick={() => load.mutate(c.id)}
                      >
                        <strong>{c.orderNumber}</strong>
                        <span>{c.customerName}</span>
                        <span className="meta">
                          {c.itemsDone?.total ?? 0} items · {formatCurrency(c.total)}
                        </span>
                        <span className="meta">{c.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* The menu. A category rail on the left of the dishes, because with 14 categories
            the rail is what makes the menu a screen tall instead of five. It is the shape
            every till uses for a menu this size, and it means the running ticket beside it
            can stay pinned. */}
        <section className="counter-menu" data-od-id="counter-dishes" aria-label="Menu">
          <nav className="counter-rail" aria-label="Menu categories">
            <button
              type="button"
              className="cat-key"
              aria-pressed={!searching && activeCategory === POPULAR}
              onClick={() => setChosenCategory(POPULAR)}
            >
              <span className="cat-label">
                <svg className="cat-ico" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
                </svg>
                Popular
              </span>
              <span className="cat-count">{popularDishes.length}</span>
            </button>

            {categories.map((category) => {
              const on = !searching && category === activeCategory
              return (
                <button
                  key={category}
                  type="button"
                  className="cat-key"
                  aria-pressed={on}
                  onClick={() => setChosenCategory(category)}
                >
                  <span>{category}</span>
                  <span className="cat-count">
                    {available.filter((d) => (d.categoryName || "Other") === category).length}
                  </span>
                </button>
              )
            })}
          </nav>

          <div className="counter-dishes-wrap">
            {isLoading ? (
              <SkeletonRows rows={6} />
            ) : (
              <div className="counter-dishes" data-od-id="counter-dish-grid">
                {dishesInView.length === 0 ? (
                  <p className="counter-empty">
                    {searching
                      ? `No dish matches “${menuQuery.trim()}”. Try another word, or pick a category.`
                      : "Nothing in this category right now."}
                  </p>
                ) : (
                  dishesInView.map((dish) => {
                    return (
                      <button
                        key={dish.id}
                        type="button"
                        className="dish-key"
                        aria-label={`Add ${dish.name} — ${formatCurrency(dish.price)}`}
                        onClick={() => choose(dish)}
                      >
                        <span className="dk-name">{dish.name}</span>
                        <span className="dk-foot">
                          <span className="dk-price">{formatCurrency(dish.price)}</span>
                          <span className="dk-add" aria-hidden="true">
                            <svg
                              viewBox="0 0 16 16"
                              width="12"
                              height="12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                            >
                              <path d="M8 3v10M3 8h10" />
                            </svg>
                          </span>
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </section>

        {/* The running ticket. Right, and sticky, because the total is quoted aloud. */}
        <aside className="counter-ticket" data-od-id="counter-ticket">
          <Panel>
            <PanelHead>
              <h3 style={{ margin: 0 }}>This order</h3>
              {lines.length > 0 && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => startFresh()}
                >
                  Clear
                </button>
              )}
            </PanelHead>
            <PanelBody>
              {/* The lines get their own scroll region. A big order — and a busy table's
                  order is big — would otherwise push the fields, the total and the Save
                  button off the bottom of the panel, which is the scrolling this screen
                  was rebuilt to remove. */}
              <div className="ticket-scroll">
                {lines.length === 0 ? (
                  <p className="meta" style={{ margin: 0 }}>
                    Tap a dish to start. The total appears here as you go.
                  </p>
                ) : (
                  <ul className="counter-lines">
                  {lines.map((line) => {
                    const isNew = pulseSig !== null && lineSignature(line) === pulseSig
                    return (
                    <li key={line.key} className={`counter-line${isNew ? " is-new" : ""}`}>
                      <div className="cl-top">
                        <strong>{line.name}</strong>
                        <span className="cl-price">{formatCurrency(line.unitPrice * line.quantity)}</span>
                      </div>

                      {(line.modifiers.length > 0 || line.note) && (
                        <p className="cl-detail">
                          {line.modifiers.map((m) => m.name).join(" · ")}
                          {line.modifiers.length > 0 && line.note && " · "}
                          {line.note && `Note: ${line.note}`}
                        </p>
                      )}

                      {/* Quantity is one control, then Edit and Remove. Ordered so the
                          most-pressed control (one more) is a thumb-width from the right
                          edge on a tablet. */}
                      <div className="cl-controls">
                        <span className="cl-step">
                          <button
                            type="button"
                            aria-label={`One less ${line.name}`}
                            onClick={() => setLines((c) => setQuantity(c, line.key, line.quantity - 1))}
                          >
                            −
                          </button>
                          <span className="cl-qty" aria-label={`Quantity ${line.quantity}`}>
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`One more ${line.name}`}
                            disabled={line.quantity >= MAX_QUANTITY}
                            onClick={() => setLines((c) => setQuantity(c, line.key, line.quantity + 1))}
                          >
                            +
                          </button>
                        </span>
                        <button
                          type="button"
                          className="cl-edit"
                          aria-label={`Edit options for ${line.name}`}
                          onClick={() => editLine(line.key)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="cl-remove"
                          aria-label={`Remove ${line.name}`}
                          onClick={() => setLines((c) => removeLine(c, line.key))}
                        >
                          <svg
                            viewBox="0 0 16 16"
                            width="13"
                            height="13"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            aria-hidden="true"
                          >
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        </button>
                      </div>
                    </li>
                    )
                  })}
                </ul>
                )}

                {/* Who it is for. A name is optional on purpose — a customer who will not
                    give one still gets fed, and the kitchen calls out "counter" instead.

                    These sit INSIDE the scroll region with the lines: a six-line order plus
                    four fields is taller than a tablet, and something has to give. The
                    fields can scroll; the total and the save button cannot — see the pinned
                    footer below the scroll. */}
                <div className="counter-fields">
                <label>
                  <span>Name</span>
                  <input
                    className="input"
                    value={customerName}
                    placeholder="Counter"
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </label>

                <div className="counter-split">
                  <label>
                    <span>Service</span>
                    <div className="seg-sm" role="group" aria-label="Service">
                      {(["Pickup", "DineIn"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={orderType === option}
                          onClick={() => setOrderType(option)}
                        >
                          {option === "Pickup" ? "Takeaway" : "Dine in"}
                        </button>
                      ))}
                    </div>
                  </label>

                  {orderType === "DineIn" && (
                    <label>
                      <span>Table</span>
                      <input
                        className="input"
                        value={tableNumber}
                        placeholder="4"
                        onChange={(e) => setTableNumber(e.target.value)}
                      />
                    </label>
                  )}
                </div>

                {/* The promise. The one line the kitchen runs on, and the way to move it.
                    Hidden when adding to an order: that order already has a time, and the
                    board owns changing it — see `ordersApi.setPickupTime`. */}
                {!isAddingToOrder && (
                  <div className="counter-pickup" data-od-id="counter-pickup">
                    <span className="pickup-label">
                      {orderType === "DineIn" ? "Serve by" : "Pickup time"}
                    </span>
                    <button
                      type="button"
                      className={`t-time${promiseIsLate ? " is-late" : promiseIsWarn ? " is-warn" : ""}`}
                      aria-label={`Change the ${promiseWord} time, currently ${shopDayLabel(wantedAt)} ${formatShopTime(wantedAt)}`}
                      onClick={() => {
                        setPickupDraft(wantedAt)
                        setPickupOpen(true)
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="8.5" />
                        <path d="M12 7.5V12l3 2" />
                      </svg>
                      <span className="t-time-val">{formatShopTime(wantedAt)}</span>
                      {shopDayLabel(wantedAt) !== "Today" && (
                        <span className="t-time-day">{shopDayLabel(wantedAt)}</span>
                      )}
                      <span className="t-time-rel">{shopRelativeLabel(wantedAt, now)}</span>
                      <svg
                        className="t-time-edit"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 20h4L20 8l-4-4L4 16z" />
                      </svg>
                    </button>
                  </div>
                )}

                <label>
                  <span>Allergies (say it before the kitchen starts)</span>
                  <input
                    className="input"
                    value={allergy}
                    placeholder="None declared"
                    onChange={(e) => setAllergy(e.target.value)}
                  />
                </label>

                <label>
                  <span>Kitchen note (optional)</span>
                  <input
                    className="input"
                    value={notes}
                    placeholder="Nothing else"
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>

                {/* Adding to an order asks WHY, because the kitchen may already be cooking
                    the version without this dish. A note is encouraged on the phone path
                    for the same reason: an edited ticket that does not say why is how the
                    kitchen ends up working from a printout that no longer matches. */}
                {isAddingToOrder && (
                  <label>
                    <span>Why the change? (recorded on the order)</span>
                    <input
                      className="input"
                      value={reason}
                      placeholder="Customer came back for more"
                      maxLength={500}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                )}

                {/* The money. This app takes NO payment — it records what already
                    happened, so the board and the day's takings agree with the till.
                    There is nothing to record when ADDING to an order: its payment state
                    is already on the order, and the money panel above says what the change
                    does to it. */}
                {!isAddingToOrder && (
                  <label className="counter-paid">
                    <input
                      type="checkbox"
                      checked={markedPaid}
                      onChange={(e) => setMarkedPaid(e.target.checked)}
                    />
                    <span>
                      <strong>Money taken</strong>
                      <span className="meta">
                        {markedPaid
                          ? `Recorded as paid — ${formatCurrency(total)}.`
                          : `Recorded as owing — collect ${formatCurrency(total)} at handover.`}
                      </span>
                    </span>
                  </label>
                )}
                </div>
              </div>

              {/* ── The pinned footer ─────────────────────────────────────────────
                  The total and the save action, OUTSIDE the scroll region. These are the
                  two things a staff member must be able to see and press at any moment,
                  whatever the order looks like, and they are what made this screen need
                  scrolling before: with 82 dishes stacked above them, the Save button
                  measured 4,000px below the fold. */}
              <div className="ticket-foot">
                <div className="counter-total">
                  <span>{isAddingToOrder ? "Order will be" : "Total"}</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>

                {/* ── What the change does to the money ───────────────────────────
                    Only when adding to an order, and only from `editMoney` — the same tested
                    rule the phone-edit screen uses. Raising the total of a card order that
                    was ALREADY CHARGED leaves money nothing here will collect; lowering it
                    leaves money owed back. Both are conversations to have with the customer
                    standing in front of you, so this says which one BEFORE the save.

                    The three cases are distinct and the panel must not collapse them:
                    money owed back, money still to collect on a charge, and an order that
                    was NEVER charged — where the whole new total is to collect and quoting
                    "nothing has changed" would be plainly wrong. */}
                {money && isAddingToOrder && loadedFrom && (
                  <div className="counter-money" role="status" data-od-id="counter-money">
                  <p className="meta" style={{ margin: 0 }}>
                    Was {formatCurrency(loadedFrom.total)} · now{" "}
                    <strong>{formatCurrency(money.newTotal)}</strong>
                  </p>
                  {money.case === 'paid-more' && (
                    <p className="pay-warning" style={{ margin: "6px 0 0" }}>
                      {formatCurrency(money.shortfall)} more to collect — the card was already
                      charged {formatCurrency(loadedFrom.paidAmount ?? loadedFrom.total)}.
                    </p>
                  )}
                  {money.case === 'paid-less' && (
                    <p className="meta" style={{ margin: "6px 0 0" }}>
                      {formatCurrency(money.overpaid)} less than was charged — refund the
                      difference from the ticket.
                    </p>
                  )}
                  {/* Never settled: the card declined, or the customer is paying at the
                      counter. Either way the figure to collect is the NEW total — nothing
                      was handed over, so there is no difference to quote. */}
                  {money.case === 'nothing-taken' && (
                    <p className="pay-warning" style={{ margin: "6px 0 0" }}>
                      Nothing was taken for this order — collect the full{" "}
                      {formatCurrency(money.newTotal)}.
                    </p>
                  )}
                  {money.case === 'unchanged' && (
                    <p className="meta" style={{ margin: "6px 0 0" }}>
                      The total has not changed.
                    </p>
                  )}
                </div>
                )}

                <p className="meta" style={{ margin: "0 0 12px" }}>
                  GST included. Priced by the server when the order is sent.
                </p>

                <Button
                  variant="primary"
                  onClick={() => submit.mutate()}
                  disabled={!canSend}
                  style={{ width: "100%" }}
                >
                  {submit.isPending
                    ? "Saving…"
                    : lines.length === 0
                      ? "Add a dish first"
                      : isAddingToOrder
                        ? "Save changes to the order"
                        : "Send to the kitchen"}
                </Button>

                {/* The last order sent. Kept INSIDE the pinned footer because the number is
                    read out loud to the customer, and it must stay on screen while the next
                    ticket is being built — it used to sit under the ticket and scroll away. */}
                {lastOrder && (
                  <div className="counter-last" role="status" style={{ marginTop: 12 }}>
                    <strong>{lastOrder.orderNumber}</strong>{" "}
                    {lastOrder.updated ? "updated" : "sent to the kitchen"}
                    <span className="meta">{lastOrder.note}</span>
                  </div>
                )}
              </div>
            </PanelBody>
          </Panel>
        </aside>
      </div>

      {/* Options for one dish. Only shown when the dish HAS options — most of the menu
          goes straight onto the ticket with the one tap. */}
      {openDish && (
        <AdminModal
          title={openDish.name}
          labelledBy="dish-options-title"
          onClose={() => setOpenDish(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpenDish(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmDish}>
                {editingLineKey !== null ? "Update this item" : "Add to order"}
              </Button>
            </>
          }
        >
          {/* Says which of the two things this panel is doing. The dialog is identical
              otherwise, so without this line an edit looks like a second add. */}
          {editingLineKey !== null && (
            <p className="meta" style={{ marginTop: 0 }}>
              Changing this item on the bill. Its quantity stays as it is.
            </p>
          )}
          {(openDish.modifierGroups ?? [])
            .filter((g) => (g.modifiers ?? []).length > 0)
            .map((group) => (
              <fieldset key={group.id} className="opt-group">
                <legend>
                  {group.name}
                  {group.minRequired > 0 && <span className="opt-req">Required</span>}
                </legend>
                <div className="opt-list">
                  {group.modifiers
                    .map((modifier) => {
                      const chosen = pending.some((m) => m.id === modifier.id)
                      return (
                        <button
                          key={modifier.id}
                          type="button"
                          className="opt-key"
                          aria-pressed={chosen}
                          onClick={() => setPending((c) => toggleModifier(openDish, c, modifier))}
                        >
                          <span>{modifier.name}</span>
                          {modifier.priceAdjustment > 0 && (
                            <span className="opt-price">+{formatCurrency(modifier.priceAdjustment)}</span>
                          )}
                        </button>
                      )
                    })}
                </div>
              </fieldset>
            ))}

          <label className="counter-note-field">
            <span>Note for this dish (optional)</span>
            <input
              className="input"
              value={pendingNote}
              placeholder="No coriander"
              onChange={(e) => setPendingNote(e.target.value)}
            />
          </label>
        </AdminModal>
      )}

      {/* The promise editor — the SAME component the board uses, so a time set here and a
          time moved there cannot mean two different things. */}
      {pickupOpen && (
        <PickupTimeEditor
          title={`${orderType === "DineIn" ? "Serve time" : "Pickup time"} — ${customerName.trim() || "Counter"}`}
          draft={pickupDraft}
          now={now}
          setDraft={setPickupDraft}
          current={wantedAt}
          confirmLabel="Set time"
          onSave={() => {
            setWantedAt(pickupDraft)
            setPickupOpen(false)
          }}
          onClose={() => setPickupOpen(false)}
        />
      )}
    </>
  )
}

/** Two initials for the avatar, from a customer name. `AT` when there is no name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "AT"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
