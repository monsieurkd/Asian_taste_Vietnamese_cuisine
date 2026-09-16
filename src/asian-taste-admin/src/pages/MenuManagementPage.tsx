import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { menuAdminApi } from "@/api/menuApi"
import { AdminTop } from "@/components/AdminLayout"
import { Button, Panel, PanelBody, PanelHead, Pill, SkeletonRows } from "@/components/ui/Primitives"
import { showAdminToast } from "@/components/ui/AdminToast"
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
 * Availability is the one thing this screen must get right: it is how the pass
 * takes a dish off the menu the moment the kitchen runs out. The API has the
 * endpoint (`POST /admin/menu/items/{id}/toggle-availability`), so the toggle
 * writes through rather than only moving local state.
 */
export function MenuManagementPage() {
  const queryClient = useQueryClient()
  const [categoryId, setCategoryId] = useState<number | "all">("all")
  const [query, setQuery] = useState("")

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

  const offCount = items.filter((item) => !item.isActive).length

  return (
    <>
      <AdminTop
        title="Menu"
        sub={`${items.length} dishes across ${categories.length} categories. Toggle availability the moment the kitchen runs out.`}
      />

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
                    {item.isSpicy && item.spicyLevel > 0 ? ` · heat ${item.spicyLevel}/5` : ""}
                  </p>
                  {!item.isActive && (
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
                    checked={item.isActive}
                    disabled={toggle.isPending}
                    aria-label={`Mark ${item.name} ${item.isActive ? "unavailable" : "available"}`}
                    onChange={(e) => toggle.mutate({ id: item.id, isActive: e.target.checked })}
                  />
                  <span className="track" aria-hidden="true" />
                  <span className="switch-label" style={{ fontSize: 12 }}>
                    {item.isActive ? "Available" : "Off"}
                  </span>
                </label>

                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Edit ${item.name}`}
                  onClick={() =>
                    showAdminToast("Dish editing is not built yet — the menu lives in the seed for now")
                  }
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
    </>
  )
}
