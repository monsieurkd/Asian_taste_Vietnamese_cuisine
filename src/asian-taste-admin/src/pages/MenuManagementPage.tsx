import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { menuAdminApi, type MenuItemDetail } from "@/api/menuApi"
import { Button, Panel, PanelBody, PanelHead, Pill, SkeletonRows } from "@/components/ui/Primitives"
import { showAdminToast } from "@/components/ui/AdminToast"
import { DishEditor } from "@/components/menu/DishEditor"
import { formatCurrency } from "@/lib/utils"

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  )
}

function initials(name: string) {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")
}

/**
 * Menu management.
 *
 * Two jobs, both of them the owner's rather than the kitchen's:
 *
 *  1. **Availability**, which is how the pass takes a dish off the menu the moment
 *     the kitchen runs out. One press, reversible, no confirmation — a sold-out dish
 *     is a normal event, not a destructive one.
 *  2. **Editing**, which is the owner's own ask: change a price without waiting for a
 *     deploy. The printed menu stays the source of truth; the app just stops being
 *     the thing that makes a price change take a day.
 *
 * Both write through to the API. Both used to report success without writing anything
 * — see AdminMenuWriteTests for what that cost and how it is pinned now.
 */
export function MenuManagementPage() {
  const queryClient = useQueryClient()
  const [categoryId, setCategoryId] = useState<number | "all">("all")
  const [query, setQuery] = useState("")
  /** The dish open in the editor, or null when the editor is closed. */
  const [editing, setEditing] = useState<MenuItemDetail | null>(null)

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => menuAdminApi.getCategories(),
  })

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-menu-items"],
    queryFn: () => menuAdminApi.getMenuItems(),
  })

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      menuAdminApi.toggleAvailability(id, isActive),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-menu-items"] })
      showAdminToast(variables.isActive ? "Back on the menu" : "Off the menu")
    },
    onError: () => showAdminToast("Couldn't change availability — try again"),
  })

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (categoryId !== "all" && item.categoryId !== categoryId) return false
      if (q && !item.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, categoryId, query])

  const offCount = items.filter((item) => !item.isAvailable).length

  return (
    <>
      <div className="admin-page">
        <Panel data-od-id="menu-tools">
          <PanelBody>
            <div className="filterbar">
              <div className="search">
                <SearchIcon />
                <label className="sr-only" htmlFor="dish-filter">
                  Search dishes
                </label>
                <input
                  id="dish-filter"
                  className="input"
                  type="search"
                  placeholder="Search dishes…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("")
                  setCategoryId("all")
                }}
              >
                Clear filters
              </Button>
            </div>

            <div className="seg-sm" role="group" aria-label="Filter by category" style={{ marginTop: 12 }}>
              <button type="button" aria-pressed={categoryId === "all"} onClick={() => setCategoryId("all")}>
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={categoryId === category.id}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <p className="meta" aria-live="polite" style={{ margin: "12px 0 0" }}>
              Showing {rows.length} of {items.length} dishes · {offCount} off the menu
            </p>
          </PanelBody>
        </Panel>

        <Panel data-od-id="menu-list">
          <PanelHead>
            <h3>Dishes</h3>
            <Pill neutral>Availability writes through to the kitchen</Pill>
          </PanelHead>

          {isLoading ? (
            <PanelBody>
              <SkeletonRows rows={6} />
            </PanelBody>
          ) : rows.length === 0 ? (
            <div className="state-block">
              <span className="state-icon">
                <SearchIcon />
              </span>
              <h3>No dishes match</h3>
              <p>Try another category or a shorter search.</p>
            </div>
          ) : (
            rows.map((item) => (
              <div className="mm-row" key={item.id}>
                <span className={`mm-thumb ${item.imageUrl ? "" : "ph"}`}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="ph-mono" style={{ fontSize: 14 }} aria-hidden="true">
                      {initials(item.name)}
                    </span>
                  )}
                </span>

                <div>
                  <strong style={{ fontSize: 15 }}>{item.name}</strong>
                  <p className="meta" style={{ margin: "2px 0 0" }}>
                    {item.categoryName}
                    {item.spicyLevel > 0 ? ` · heat ${item.spicyLevel}/5` : ""}
                  </p>
                  {/* `isAvailable`, not `isActive`. The API has never sent an `isActive`
                      flag, so `!item.isActive` was true for every dish and this screen
                      told the owner their whole menu was off. `isAvailable` is the field
                      the toggle below actually flips. */}
                  {!item.isAvailable && (
                    <p className="field-error" style={{ margin: "4px 0 0" }}>
                      Off menu right now
                    </p>
                  )}
                </div>

                <span className="num mm-hide" style={{ fontWeight: 700 }}>
                  {formatCurrency(item.price)}
                </span>

                <label className="switch">
                  <input
                    type="checkbox"
                    checked={item.isAvailable}
                    disabled={toggle.isPending}
                    aria-label={`Mark ${item.name} ${item.isAvailable ? "unavailable" : "available"}`}
                    onChange={(e) => toggle.mutate({ id: item.id, isActive: e.target.checked })}
                  />
                  <span className="track" aria-hidden="true" />
                  <span className="switch-label" style={{ fontSize: 12 }}>
                    {item.isAvailable ? "Available" : "Off"}
                  </span>
                </label>

                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Edit ${item.name}`}
                  onClick={() => setEditing(item)}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 20h4L19 9l-4-4L4 16z" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </Panel>
      </div>

      {editing && (
        <DishEditor
          dish={editing}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
