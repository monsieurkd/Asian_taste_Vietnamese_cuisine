import { NavLink, Link, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useOrderWebSocket } from "@/hooks/useOrderWebSocket"
import { Avatar } from "@/components/ui/Primitives"

const ICONS = {
  home: (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
    </>
  ),
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
  // Overview is the console's front door: today's numbers and a way into every
  // screen. It is the default entry because a manager opening the console wants
  // the state of service before the board loads.
  { to: "/", label: "Overview", icon: ICONS.home },
  // The board is the one working screen and it carries the day's numbers too; it
  // replaced two entries — "Back of house" and "Dashboard" — that rendered the
  // same orders with different halves of the job missing; see KitchenPage.
  { to: "/kitchen", label: "Board", icon: ICONS.grid },
  { to: "/counter", label: "Counter", icon: ICONS.counter },
  { to: "/orders", label: "Orders", icon: ICONS.list },
  { to: "/menu", label: "Menu", icon: ICONS.menu },
]

/**
 * Where the rail's collapsed state is remembered.
 *
 * localStorage rather than a cookie or a server setting: this is a per-device preference on
 * a shared tablet, and the person who collapsed it on the counter tablet wants it to stay
 * collapsed there without affecting the office laptop.
 */
const RAIL_KEY = "admin_rail_collapsed"

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "1"
  } catch {
    // Private mode or a blocked storage API — an uncollapsed rail is a fine fallback.
    return false
  }
}

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
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggleRail = () => {
    setCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem(RAIL_KEY, next ? "1" : "0")
      } catch {
        // Not persisting is survivable; not collapsing is not.
      }
      return next
    })
  }

  const name = user?.username ?? "Staff"

  return (
    <div className="admin" data-rail={collapsed ? "collapsed" : "expanded"}>
      <aside className="admin-rail">
        <div className="rail-top">
          <Link className="brand" to="/">
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

          {/* The collapse control. Its own button rather than making the whole rail
              clickable, because the rail contains links and a stray tap while carrying a
              tablet should not resize the screen. */}
          <button
            type="button"
            className="rail-toggle"
            aria-expanded={!collapsed}
            aria-controls="admin-nav"
            title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
            onClick={toggleRail}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={collapsed ? "m10 6 6 6-6 6" : "m14 6-6 6 6 6"} />
            </svg>
            <span className="sr-only">{collapsed ? "Expand the sidebar" : "Collapse the sidebar"}</span>
          </button>
        </div>

        <nav className="admin-nav" id="admin-nav" aria-label="Staff sections">
          {NAV.map((item) => {
            // The overview lives at "/", so a prefix test would mark it current on
            // every route; it is the only entry that has to match exactly.
            const current = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                // The label is the accessible name even when it is not painted, so a
                // collapsed icon is announced as "Counter" rather than as an unlabelled link.
                title={item.label}
                aria-current={current ? "page" : undefined}
              >
                <Icon paths={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="admin-rail-foot">
          {/* The kitchen's only cue that live orders are arriving. Offline is a
              warning, not a silent decoration. */}
          <span className={`live-dot ${isConnected ? "" : "is-off"}`} title={isConnected ? "Kitchen online" : "Reconnecting"}>
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
 * The shop clock.
 *
 * Read in Australia/Adelaide rather than the device's own timezone: the console's
 * "today" and every pickup time are Adelaide time, and a tablet that has been
 * carried in from another timezone must not disagree with the till. Ticks every
 * half minute, which is often enough for a clock with no seconds on it.
 */
function ShopClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide",
    hour: "numeric",
    minute: "2-digit",
  }).format(now)

  return (
    <span className="admin-clock" title="The shop clock — Australia/Adelaide">
      Adelaide {time}
    </span>
  )
}

/**
 * The sticky console header.
 *
 * `title`/`sub` are rendered here rather than duplicated in each page, so the
 * heading and the browser tab cannot disagree. The shop clock is appended after
 * whatever page actions a screen passes, so it is the last thing in the corner on
 * every screen.
 */
export function AdminTop({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <header className="admin-top">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <div className="admin-top-actions">
        {actions}
        <ShopClock />
      </div>
    </header>
  )
}
