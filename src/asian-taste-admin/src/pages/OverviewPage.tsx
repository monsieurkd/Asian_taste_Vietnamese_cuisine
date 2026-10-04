import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ordersApi } from "@/api/orders"
import { kitchenApi } from "@/api/kitchenApi"
import { AdminTop } from "@/components/AdminLayout"
import { Panel, PanelBody, PanelHead, Pill } from "@/components/ui/Primitives"
import { statusKey } from "@/lib/orderStatus"
import { formatCurrency } from "@/lib/utils"

/**
 * Overview — the console's front door.
 *
 * A manager opening the console wants the state of service before the board
 * loads: how many orders are on the line, what is bagged and waiting, and what
 * the day has taken. It also lays the console's screens out as a map, so nobody
 * has to remember which tab does what.
 *
 * The numbers come from the same two sources the board uses — the kitchen board's
 * summary and the dashboard summary — rather than from a new endpoint, so this
 * screen cannot disagree with the board it is describing. "Ready for collection"
 * is counted from the board's own tickets, because the summary counts live work
 * and money, not the bagged pile.
 */

/** The screen cards, in the order they appear. `to` matches the console's routes. */
const SCREENS = [
  {
    to: "/kitchen",
    odId: "card-board",
    title: "Board",
    body: "The cook line. Track orders through New → Cooking → Ready, tick off dishes, and set the pickup time.",
    cta: "Open the board",
    icon: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  {
    to: "/counter",
    odId: "card-counter",
    title: "Counter",
    body: "Take an order at the till — quick-add dishes, choose options, capture a pickup time and send it straight to the board.",
    cta: "Take an order",
    icon: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
        <path d="M3.5 9h17M8 4.5v15" />
      </>
    ),
  },
  {
    to: "/orders",
    odId: "card-orders",
    title: "Orders",
    body: "Search and filter the day's orders, expand the dishes inline, or open one for the full timeline and a printable bill.",
    cta: "Browse orders",
    icon: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </>
    ),
  },
  {
    to: "/menu",
    odId: "card-menu",
    title: "Menu",
    body: "Change a price, edit a description, adjust spice, or mark a dish unavailable.",
    cta: "Edit the menu",
    icon: (
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM11 4h7.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11" />
    ),
  },
  {
    to: "/login",
    odId: "card-login",
    title: "Staff sign-in",
    body: "The console's front door. Sign in with a staff account to reach the board, counter, orders and menu.",
    cta: "Go to sign-in",
    icon: (
      <>
        <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        <path d="M12 14.5v2" />
      </>
    ),
  },
]

const ARROW = <path d="M5 12h14M13 6l6 6-6 6" />

export function OverviewPage() {
  const { data: board } = useQuery({
    queryKey: ["kitchen", "board"],
    queryFn: () => kitchenApi.getBoard(false),
    refetchInterval: 15_000,
  })

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => ordersApi.getDashboardSummary(),
    refetchInterval: 30_000,
  })

  const tickets = board?.tickets ?? []
  const boardSummary = board?.summary

  const onBoard = boardSummary?.liveOrders ?? 0
  const ready = tickets.filter((t) => statusKey(t.status) === "ready").length
  const collected = summary?.completedOrdersToday ?? boardSummary?.collectedToday ?? 0
  const revenue = summary?.todayRevenue ?? 0

  const dateLine = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date())

  return (
    <>
      <AdminTop title="Overview" sub={`${dateLine} · service at a glance.`} />

      <div className="admin-page" data-od-id="overview">
        <Panel data-od-id="overview-snapshot">
          <PanelHead>
            <div>
              <p className="eyebrow">Today's service</p>
              <h2>Live from the cook line</h2>
            </div>
            <Pill neutral>{board ? "Live from the board" : "Loading the board"}</Pill>
          </PanelHead>
          <PanelBody>
            <section className="stat-grid">
              <div className="stat-card is-accent">
                <p className="stat-k">Orders on the board</p>
                <p className="stat-v">{onBoard}</p>
                <p className="stat-delta">{boardSummary?.dishesToCook ?? 0} dishes still to cook</p>
              </div>
              <div className="stat-card">
                <p className="stat-k">Ready for collection</p>
                <p className="stat-v">{ready}</p>
                <p className="stat-delta">bagged, waiting at the counter</p>
              </div>
              <div className="stat-card">
                <p className="stat-k">Collected today</p>
                <p className="stat-v">{collected}</p>
                <p className="stat-delta">{boardSummary?.heldOrders ?? 0} held right now</p>
              </div>
              <div className="stat-card">
                <p className="stat-k">Takings today</p>
                <p className="stat-v">{formatCurrency(revenue)}</p>
                <p className="stat-delta">GST inclusive · AUD</p>
              </div>
            </section>

            <div className="flow" style={{ marginTop: 20 }} aria-label="How the console fits together">
              <span className="step">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
                  <path d="M3.5 9h17M8 4.5v15" />
                </svg>
                Counter takes the order
              </span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
              <span className="step">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
                  <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
                </svg>
                Board cooks it
              </span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
              <span className="step">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 6h13M8 12h13M8 18h13" />
                  <circle cx="4" cy="12" r="1" />
                </svg>
                Orders keeps the record
              </span>
            </div>
          </PanelBody>
        </Panel>

        <Panel data-od-id="overview-screens">
          <PanelHead>
            <div>
              <p className="eyebrow">Jump to</p>
              <h2>Every screen in the console</h2>
            </div>
          </PanelHead>
          <PanelBody>
            <div className="ov-grid">
              {SCREENS.map((screen) => (
                <Link key={screen.to} className="panel ov-card" to={screen.to} data-od-id={screen.odId}>
                  <span className="ov-card-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                      {screen.icon}
                    </svg>
                  </span>
                  <h2>{screen.title}</h2>
                  <p>{screen.body}</p>
                  <span className="go">
                    {screen.cta}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {ARROW}
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </>
  )
}
