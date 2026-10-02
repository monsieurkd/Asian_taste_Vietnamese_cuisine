import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { menuAdminApi, type MenuItemDetail, type Modifier } from "@/api/menuApi"
import { counterOrderApi } from "@/api/counterOrderApi"
import { AdminTop } from "@/components/AdminLayout"
import { Button, Panel, PanelBody, PanelHead, Pill, SkeletonRows } from "@/components/ui/Primitives"
import { AdminModal } from "@/components/ui/AdminModal"
import { showAdminToast } from "@/components/ui/AdminToast"
import { formatCurrency } from "@/lib/utils"
import {
  MAX_QUANTITY,
  addLine,
  clearTicket,
  hasOptions,
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
 * This screen deliberately does NOT sell DineIn by default: the customer at the counter is
 * usually waiting, and the choice is one tap away when they are not.
 */
export function CounterOrderPage() {
  const [lines, setLines] = useState<TicketLineDraft[]>(clearTicket())
  const [customerName, setCustomerName] = useState("")
  const [tableNumber, setTableNumber] = useState("")
  const [orderType, setOrderType] = useState<"Pickup" | "DineIn">("Pickup")
  const [notes, setNotes] = useState("")
  const [allergy, setAllergy] = useState("")
  const [markedPaid, setMarkedPaid] = useState(true)

  /** The dish whose options are open, if any. */
  const [openDish, setOpenDish] = useState<MenuItemDetail | null>(null)
  /** Chosen options for the dish being configured. */
  const [pending, setPending] = useState<Modifier[]>([])
  const [pendingNote, setPendingNote] = useState("")
  /** What the last successful order was, for a confirmation the staff member can read out. */
  const [lastOrder, setLastOrder] = useState<{ orderNumber: string; note: string } | null>(null)

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

  /** Grouped by category, so the grid can be read the way the printed menu is. */
  const byCategory = useMemo(() => {
    const groups = new Map<string, MenuItemDetail[]>()
    for (const dish of available) {
      const key = dish.categoryName || "Other"
      groups.set(key, [...(groups.get(key) ?? []), dish])
    }
    return [...groups.entries()]
  }, [available])

  const total = ticketTotal(lines)

  const submit = useMutation({
    mutationFn: () => counterOrderApi.create(toRequest(lines, {
      customerName: customerName.trim() || undefined,
      orderType,
      tableNumber: tableNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      allergyDeclaration: allergy.trim() || undefined,
      markedPaid,
    }) as Parameters<typeof counterOrderApi.create>[0]),

    onSuccess: (result) => {
      // The ticket clears and the number is kept on screen. Both matter: a staff member
      // reads the number out to the customer, and a ticket that stayed behind would be
      // sent twice by the next tap.
      setLastOrder({ orderNumber: result.orderNumber, note: result.counterNote })
      setLines(clearTicket())
      setCustomerName("")
      setTableNumber("")
      setNotes("")
      setAllergy("")
      setMarkedPaid(true)
      showAdminToast(`${result.orderNumber} sent to the kitchen`)
    },
    onError: (error: unknown) => {
      // The message names the dish when one has left the menu, which is the case a staff
      // member can actually act on.
      const detail = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      showAdminToast(detail ?? "Couldn't send that order — try again")
    },
  })

  /** Add a dish, opening its options first when it has any. */
  const choose = (dish: MenuItemDetail) => {
    // "Has options" is about whether there is anything to CHOOSE, not whether a flag
    // says so. This read `g.isActive && m.isActive`, neither of which the server sends —
    // so every dish looked option-less and went straight onto the ticket, and a dish with
    // a required choice could be added without ever being asked for it.
    if (!hasOptions(dish)) {
      setLines((current) => addLine(current, dish))
      return
    }

    setPending([])
    setPendingNote("")
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

    setLines((current) => addLine(current, openDish, pending, pendingNote))
    setOpenDish(null)
  }

  const canSend = lines.length > 0 && !submit.isPending

  return (
    <>
      <AdminTop
        title="Counter order"
        sub="Take an order for someone standing with you. No payment is taken here."
        actions={
          <>
            <Pill neutral>{ticketItemCount(lines)} items</Pill>
            <Pill className="pill-total">{formatCurrency(total)}</Pill>
          </>
        }
      />

      <div className="admin-page counter-page" data-od-id="counter">
        {/* The dish grid. Left, because it is what gets tapped. */}
        <section className="counter-grid" data-od-id="counter-dishes" aria-label="Menu">
          {isLoading ? (
            <SkeletonRows rows={6} />
          ) : (
            byCategory.map(([category, group]) => (
              <div key={category} className="counter-group">
                <h3 className="counter-group-head">{category}</h3>
                <div className="counter-dishes">
                  {group.map((dish) => {
                    // One shared rule, so the flag on the button and the panel it opens
                    // cannot disagree. See hasOptions.
                    const opensPanel = hasOptions(dish)

                    return (
                      <button
                        key={dish.id}
                        type="button"
                        className="dish-key"
                        onClick={() => choose(dish)}
                      >
                        <span className="dk-name">{dish.name}</span>
                        <span className="dk-price">{formatCurrency(dish.price)}</span>
                        {opensPanel && (
                          <span className="dk-flag" aria-label="has options">
                            ⋯
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
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
                  onClick={() => setLines(clearTicket())}
                >
                  Clear
                </button>
              )}
            </PanelHead>
            <PanelBody>
              {lines.length === 0 ? (
                <p className="meta" style={{ margin: 0 }}>
                  Tap a dish to start. The total appears here as you go.
                </p>
              ) : (
                <ul className="counter-lines">
                  {lines.map((line) => (
                    <li key={line.key} className="counter-line">
                      <div className="cl-top">
                        <strong>
                          {line.name}
                          {line.quantity > 1 && ` ×${line.quantity}`}
                        </strong>
                        <span className="cl-price">{formatCurrency(line.unitPrice * line.quantity)}</span>
                      </div>

                      {(line.modifiers.length > 0 || line.note) && (
                        <p className="cl-detail">
                          {line.modifiers.map((m) => m.name).join(" · ")}
                          {line.modifiers.length > 0 && line.note && " · "}
                          {line.note && `Note: ${line.note}`}
                        </p>
                      )}

                      <div className="cl-controls">
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
                        <button
                          type="button"
                          className="cl-remove"
                          aria-label={`Remove ${line.name}`}
                          onClick={() => setLines((c) => removeLine(c, line.key))}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Who it is for. A name is optional on purpose — a customer who will not
                  give one still gets fed, and the kitchen calls out "counter" instead. */}
              <div className="counter-fields">
                <label>
                  <span>Name (optional)</span>
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
                          {option === "Pickup" ? "Waiting" : "Dine in"}
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

                {/* The money. This app takes NO payment — it records what already
                    happened, so the board and the day's takings agree with the till. */}
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
              </div>

              <div className="counter-total">
                <span>Total</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
              <p className="meta" style={{ margin: "0 0 12px" }}>
                GST included. Priced by the server when the order is sent.
              </p>

              <Button
                variant="primary"
                onClick={() => submit.mutate()}
                disabled={!canSend}
                style={{ width: "100%" }}
              >
                {submit.isPending ? "Sending…" : lines.length === 0 ? "Add a dish first" : "Send to the kitchen"}
              </Button>
            </PanelBody>
          </Panel>

          {/* The last order sent. Kept on screen because the number is read out loud, and
              because a staff member needs to see that the previous one actually went. */}
          {lastOrder && (
            <div className="counter-last" role="status">
              <strong>{lastOrder.orderNumber}</strong> sent to the kitchen
              <span className="meta">{lastOrder.note}</span>
            </div>
          )}
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
                Add to order
              </Button>
            </>
          }
        >
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
    </>
  )
}
