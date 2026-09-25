import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { menuAdminApi, type MenuItemDetail } from "@/api/menuApi"
import { Button } from "@/components/ui/Primitives"
import { AdminModal } from "@/components/ui/AdminModal"
import { showAdminToast } from "@/components/ui/AdminToast"

interface DishEditorProps {
  dish: MenuItemDetail
  categories: Array<{ id: number; name: string }>
  onClose: () => void
}

/**
 * Edit one dish.
 *
 * The owner's own ask: change a price without waiting for a deploy. The printed menu
 * stays the source of truth, but a price change or a sold-out dish should not need an
 * engineer.
 *
 * Two things this deliberately does NOT do:
 *
 *  - **It does not send fields the owner did not touch.** The API treats a missing
 *    field as "leave it alone", so the form tracks which inputs were edited and sends
 *    only those. Sending the whole form would make a price edit rewrite the
 *    description from a stale copy — the classic way one edit silently reverts
 *    another person's work.
 *  - **It does not offer delete.** Removing a dish from the printed menu is a
 *    decision about the shop, not a button in a service screen; "Mark unavailable"
 *    covers the real need (sold out) and is reversible in one press.
 */
export function DishEditor({ dish, categories, onClose }: DishEditorProps) {
  const queryClient = useQueryClient()

  const [name, setName] = useState(dish.name)
  const [description, setDescription] = useState(dish.description ?? "")
  const [price, setPrice] = useState(dish.price.toFixed(2))
  const [categoryId, setCategoryId] = useState(dish.categoryId)
  const [spicyLevel, setSpicyLevel] = useState(dish.spicyLevel)

  // Which fields the owner actually touched. Only these are sent.
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const mark = (field: string) => setTouched((t) => ({ ...t, [field]: true }))

  const save = useMutation({
    mutationFn: () => {
      const patch: Record<string, unknown> = {}
      if (touched.name) patch.name = name.trim()
      if (touched.description) patch.description = description.trim()
      if (touched.price) patch.price = Number(price)
      if (touched.categoryId) patch.categoryId = categoryId
      if (touched.spicyLevel) patch.spicyLevel = spicyLevel

      if (Object.keys(patch).length === 0) {
        // Nothing changed. Not an error, and not a write: saying "saved" for a
        // no-op would train the owner to distrust the message.
        return Promise.resolve(null)
      }

      return menuAdminApi.updateMenuItem(dish.id, patch)
    },
    onSuccess: (result) => {
      if (result === null) {
        showAdminToast("Nothing changed")
        onClose()
        return
      }
      // The server returns the stored dish, so every menu view is refetched rather
      // than patched locally — what the owner sees next time is what is in the
      // database, not what this form believed.
      queryClient.invalidateQueries({ queryKey: ["admin-menu-items"] })
      showAdminToast(`${name.trim()} saved`)
      onClose()
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Couldn't save that change"
      showAdminToast(message)
    },
  })

  // A price the API will refuse, caught before the round trip so the owner gets the
  // answer in the form rather than in a toast.
  const priceValue = Number(price)
  const priceInvalid = touched.price && (Number.isNaN(priceValue) || priceValue < 0)
  const nameInvalid = touched.name && name.trim().length === 0
  const canSave = !priceInvalid && !nameInvalid && !save.isPending

  return (
    <AdminModal
      title={dish.name}
      labelledBy="dish-editor-title"
      onClose={onClose}
      footer={
        <>
          <p className="meta" style={{ margin: 0 }}>
            Sold out? Use the switch on the menu — reversible in one press.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => save.mutate()} disabled={!canSave}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </>
      }
    >
      <p className="meta" style={{ margin: "0 0 16px" }}>
        {dish.categoryName} · changes go live immediately
      </p>

      <div className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="dish-name">Name</label>
          <input
            id="dish-name"
            className="input"
            value={name}
            aria-invalid={nameInvalid}
            onChange={(e) => {
              setName(e.target.value)
              mark("name")
            }}
          />
          {nameInvalid && <p className="field-error">A dish needs a name</p>}
        </div>

        <div className="field">
          <label htmlFor="dish-price">Price (AUD, GST included)</label>
          <input
            id="dish-price"
            className="input"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={price}
            aria-invalid={priceInvalid}
            onChange={(e) => {
              setPrice(e.target.value)
              mark("price")
            }}
          />
          {priceInvalid ? (
            <p className="field-error">Enter a price of 0 or more</p>
          ) : (
            <p className="hint">The printed menu carries a GST-inclusive price, and so does the app.</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="dish-category">Section</label>
          <select
            id="dish-category"
            className="select"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(Number(e.target.value))
              mark("categoryId")
            }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="dish-heat">Heat</label>
          <select
            id="dish-heat"
            className="select"
            value={spicyLevel}
            onChange={(e) => {
              setSpicyLevel(Number(e.target.value))
              mark("spicyLevel")
            }}
          >
            <option value={0}>Not spicy</option>
            <option value={1}>Mild</option>
            <option value={2}>Medium</option>
            <option value={3}>Hot</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="dish-description">
            Description <span className="muted font-medium">(optional)</span>
          </label>
          <textarea
            id="dish-description"
            className="input"
            rows={3}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              mark("description")
            }}
          />
        </div>
      </div>
    </AdminModal>
  )
}