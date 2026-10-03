import { NavLink, Link, useLocation } from "react-router-dom"
import { useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useOrderWebSocket } from "@/hooks/useOrderWebSocket"
import { Avatar } from "@/components/ui/Primitives"

const ICONS = {
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </>
  ),
  menu: (
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM11 4h7.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11" />
  ),
  counter: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9h17M8 4.5v15" />
    </>
  ),
  out: (
    <>
      <path d="M14 4h5v16h-5" />
      <path d="M4 12h10M11 8l4 4-4 4" />
    </>
  ),
  chev: <path d="m6 9.5 6 5.5 6-5.5" />,
}

function Icon({ paths }: { paths: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  )
}

const NAV = [
  // The board is the one working screen and it carries the day's numbers too, so it is the
  // first and the default entry. It replaced two entries — "Back of house" and "Dashboard" —
  // that rendered the same orders with different halves of the job missing; see KitchenPage.
  { to: "/kitchen", label: "Board", icon: ICONS.grid },
  { to: "/counter", label: "Counter", icon: ICONS.counter },
  { to: "/orders", label: "Orders", icon: ICONS.list },
  { to: "/menu", label: "Menu", icon: ICONS.menu },
]

/**
 * The staff console shell — rail on the left, content on the right.
 *
 * Below 900px the rail becomes a horizontal strip rather than a drawer: the
 * kitchen tablet is the whole view, and a hamburger that hides navigation
 * behind a tap is the wrong trade when there is a live order to find.
 */
export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const { isConnected } = useOrderWebSocket()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const name = user?.username ?? "Staff"

  return (
    <div className="admin">
      <aside className="admin-rail">
        <Link className="brand" to="/kitchen">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z" />
              <path d="M9 7.5c0-1.3 1.1-1.7 1.1-2.8M12.5 7.5c0-1.3 1.1-1.7 1.1-2.8" />
            </svg>
          </span>
          <span className="brand-text">
            <span className="brand-name">Asian Taste</span>
            <span className="brand-tag">Staff console</span>
          </span>
        </Link>

        <nav className="admin-nav" aria-label="Staff sections">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={pathname.startsWith(item.to) ? "page" : undefined}
            >
              <Icon paths={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-rail-foot">
          {/* The kitchen's only cue that live orders are arriving. Offline is a
              warning, not a silent decoration. */}
          <span className={`live-dot ${isConnected ? "" : "is-off"}`}>
            {isConnected ? "Kitchen online" : "Reconnecting"}
          </span>

          <div className="admin-account">
            <button
              type="button"
              className="admin-account-btn"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Avatar name={name} />
              <span className="ac-text">
                <strong>{name}</strong>
                <span className="ac-role">{user?.role ?? "Staff"}</span>
              </span>
              <span className="ac-chev">
                <Icon paths={ICONS.chev} />
              </span>
            </button>
            {menuOpen && (
              <div className="admin-account-menu" role="menu">
                <button type="button" role="menuitem" className="is-danger" onClick={logout}>
                  <Icon paths={ICONS.out} />
                  Sign out
                </button>
              </div>
            )}
          </div>

          <a className="admin-back" href="/" onClick={(e) => { e.preventDefault(); window.location.href = "/" }}>
            <Icon paths={ICONS.out} />
            <span>Back to site</span>
          </a>
        </div>
      </aside>

      <div className="admin-main">{children}</div>
    </div>
  )
}

/**
 * The sticky console header.
 *
 * `title`/`sub` are rendered here rather than duplicated in each page, so the
 * heading and the browser tab cannot disagree.
 */
export function AdminTop({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <header className="admin-top">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="admin-top-actions">{actions}</div>}
    </header>
  )
}
