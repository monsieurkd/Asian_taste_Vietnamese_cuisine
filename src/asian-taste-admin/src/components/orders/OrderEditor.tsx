import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ordersApi } from "@/api/orders"
import { menuAdminApi } from "@/api/menuApi"
import type { OrderDetail } from "@/types"
import { AdminModal } from "@/components/ui/AdminModal"
import { Button } from "@/components/ui/Primitives"
import { showAdminToast } from "@/components/ui/AdminToast"
import { formatCurrency } from "@/lib/utils"
import { editMoney } from "@/lib/orderEdit"

interface OrderEditorProps {
  order: OrderDetail
  onClose: () => void
}

interface DraftLine {
  /** Stable per row, so React keys do not change when a line above is removed. */
  key: string
  menuItemId: number
  name: string
  quantity: number
  unitPrice: number
}

let nextKey = 0
const makeKey = () => `line-${nextKey++}`

/**
 * Edit an order — the phone-change path.
 *
 * Staff take a call, the customer swaps a dish, and cancelling-and-rebuilding is the
 * wrong answer: it refunds, re-charges, and gives the kitchen a second ticket for the
 * same food. This edits the ticket in place.
 *
 * Three deliberate choices:
 *
 *  - **Quantities only; no price field.** The server re-prices from the current menu,
 *    so this screen cannot set a total. The running figure below is a preview of what
 *    the server will decide, not something it is told.
 *  - **The whole order is sent.** A sequence of add/remove deltas would apply
 *    differently depending on the order it arrived in, and a retried request would
 *    leave a different order than the one on screen.
 *  - **The money is shown before saving.** Raising the total of an order whose card was
 *    already charged leaves the customer owing the difference, and that is a
 *    conversation to have on the phone, not a surprise at the counter.
 */
export function OrderEditor({ order, onClose }: OrderEditorProps) {
  const queryClient = useQueryClient()

  const [lines, setLines] = useState<DraftLine[]>(() =>
    order.items.map((item) => ({
      key: makeKey(),
      menuItemId: item.menuItemId,
      name: item.menuItemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  )
  const [reason, setReason] = useState("")
  const [addingId, setAddingId] = useState<number | "">("")

  const { data: menu = [] } = useQuery({
    queryKey: ["admin-menu-items"],
    queryFn: () => menuAdminApi.getMenuItems(),
  })

  // What the change does to the money, from its own tested rule — including the case
  // that matters most: an already-charged order whose total moves leaves money owed one
  // way or the other, and the operator has to hear that while the customer is on the
  // phone. The server computes the authoritative total on save.
  const money = useMemo(
    () => editMoney(lines, order.total, order.paymentStatus, order.paidAmount),
    [lines, order.total, order.paymentStatus, order.paidAmount],
  )
  const previewTotal = money.newTotal

  const addLine = (menuItemId: number) => {
    const dish = menu.find((d) => d.id === menuItemId)
    if (!dish) return
    setAddingId("")
    setLines((current) => {
      // Adding a dish already on the order bumps its quantity rather than making a
      // second identical line — otherwise an operator adding "one more pho" creates a
      // ticket the kitchen reads as two separate dishes.
      const existing = current.find((l) => l.menuItemId === menuItemId)
      if (existing) {
        return current.map((l) =>
          l.menuItemId === menuItemId ? { ...l, quantity: Math.min(10, l.quantity + 1) } : l,
        )
      }
      return [
        ...current,
        {
          key: makeKey(),
          menuItemId,
          name: dish.name,
          quantity: 1,
          unitPrice: dish.price,
        },
      ]
    })
  }

  const setQuantity = (key: string, quantity: number) =>
    setLines((current) =>
      current.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(10, quantity)) } : l)),
    )

  const removeLine = (key: string) => setLines((current) => current.filter((l) => l.key !== key))

  const save = useMutation({
    mutationFn: () =>
      ordersApi.updateOrderItems(order.id, {
        items: lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
        reason: reason.trim() || undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["order-detail", String(order.id)] })
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      showAdminToast(`Order updated — ${formatCurrency(result.total)}`)
      onClose()
    },
    onError: (err: unknown) =>
      showAdminToast(err instanceof Error ? err.message : "Couldn't update that order"),
  })

  const blocked = lines.length === 0

  return (
    <AdminModal
      title={`Edit ${order.orderNumber}`}
      labelledBy="order-editor-title"
      onClose={onClose}
      footer={
        <>
          <div>
            <p className="meta" style={{ margin: 0 }}>
              Was {formatCurrency(order.total)} · now{" "}
              <strong>{formatCurrency(previewTotal)}</strong>
            </p>
            {money.shortfall > 0 && (
              <p className="meta" style={{ margin: "4px 0 0", color: "var(--color-deal)" }}>
                {formatCurrency(money.shortfall)} more to collect — the card was charged{" "}
                {formatCurrency(order.paidAmount ?? order.total)}.
              </p>
            )}
            {money.overpaid > 0 && (
              <p className="meta" style={{ margin: "4px 0 0" }}>
                {formatCurrency(money.overpaid)} less than was charged — refund the difference.
              </p>
            )}
            {money.collectAtCounter && money.shortfall === 0 && (
              <p className="meta" style={{ margin: "4px 0 0" }}>
                Never paid online — collect {formatCurrency(previewTotal)} at the counter.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={blocked || save.isPending}
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </>
      }
    >
      <p className="meta" style={{ margin: "0 0 14px" }}>
        Prices come from the menu when you save, so a price change since the order was
        placed is applied automatically.
      </p>

      <div className="flex flex-col gap-3">
        {lines.length === 0 ? (
          <p className="field-error" style={{ margin: 0 }}>
            An order needs at least one dish. To cancel it instead, use the status control
            on the ticket.
          </p>
        ) : (
          lines.map((line) => (
            <div className="flex items-center gap-3" key={line.key}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{line.name}</strong>
                <p className="meta" style={{ margin: "2px 0 0" }}>
                  {formatCurrency(line.unitPrice)} each
                </p>
              </div>

              <div className="qty" role="group" aria-label={`Quantity for ${line.name}`}>
                <button
                  type="button"
                  onClick={() => setQuantity(line.key, line.quantity - 1)}
                  disabled={line.quantity <= 1}
                  aria-label="Fewer"
                >
                  −
                </button>
                <span aria-live="polite">{line.quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(line.key, line.quantity + 1)}
                  disabled={line.quantity >= 10}
                  aria-label="More"
                >
                  +
                </button>
              </div>

              <span className="num" style={{ fontWeight: 700, minWidth: 72, textAlign: "right" }}>
                {formatCurrency(line.unitPrice * line.quantity)}
              </span>

              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${line.name}`}
                onClick={() => removeLine(line.key)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      <div className="field" style={{ marginTop: 18 }}>
        <label htmlFor="edit-add-dish">Add a dish</label>
        <select
          id="edit-add-dish"
          className="select"
          value={addingId}
          onChange={(e) => addLine(Number(e.target.value))}
        >
          <option value="">Choose a dish…</option>
          {menu.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — {formatCurrency(d.price)}
            </option>
          ))}
        </select>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="edit-reason">
          Why the change? <span className="muted font-medium">(recorded on the order)</span>
        </label>
        <input
          id="edit-reason"
          className="input"
          placeholder="Customer rang — swapped the pho for a rice dish"
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </AdminModal>
  )
}
