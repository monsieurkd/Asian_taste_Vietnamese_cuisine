import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/authStore"
import { Button, Panel, PanelBody } from "@/components/ui/Primitives"

/**
 * Staff sign-in.
 *
 * The heading uses the Manrope UI face rather than the display face the menu
 * screens use — this is software, not editorial. The form reports a single
 * "we couldn't sign you in" rather than naming which half was wrong: on a
 * shared kitchen account, telling an attacker the username was valid is a
 * free hint.
 */
export function LoginPage() {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError } = useAuthStore()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await login({ username, password })
      // Straight to the board. This said /dashboard, which now redirects to the board —
      // an extra navigation that shows the login screen's fade twice.
      navigate("/kitchen")
    } catch {
      // The store holds the message; the form renders it below.
    }
  }

  return (
    <div className="login-wrap">
      <aside className="login-aside">
        <span className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z" />
              <path d="M9 7.5c0-1.3 1.1-1.7 1.1-2.8M12.5 7.5c0-1.3 1.1-1.7 1.1-2.8" />
            </svg>
          </span>
          <span className="brand-text">
            <span className="brand-name">Asian Taste</span>
            <span className="brand-tag">Taste of happiness</span>
          </span>
        </span>

        <div>
          <h2 style={{ color: "var(--color-surface)", maxWidth: "18ch" }}>
            The kitchen board, exactly as the pass sees it.
          </h2>
          <p className="lead" style={{ color: "var(--color-on-dark)", maxWidth: "40ch", marginTop: 16 }}>
            Orders land here the second they are paid, move across the stages, and stay visible
            until they are handed over.
          </p>
          <ul className="story-list" style={{ marginTop: 26 }}>
            <li>
              <span className="mark" style={{ background: "var(--color-gold)", color: "var(--color-fg)" }} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <div>
                <strong style={{ color: "var(--color-surface)" }}>One source of truth</strong>
                <p style={{ color: "var(--color-on-dark-dim)" }}>
                  Front counter and kitchen see the same ticket.
                </p>
              </div>
            </li>
            <li>
              <span className="mark" style={{ background: "var(--color-gold)", color: "var(--color-fg)" }} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <div>
                <strong style={{ color: "var(--color-surface)" }}>Built for a busy pass</strong>
                <p style={{ color: "var(--color-on-dark-dim)" }}>
                  Big targets, tabular numbers, no hunting.
                </p>
              </div>
            </li>
          </ul>
        </div>

        <p className="meta" style={{ color: "var(--color-on-dark-dim)", margin: 0 }}>
          © {new Date().getFullYear()} Asian Taste · Brooklyn Park, Adelaide
        </p>
      </aside>

      <main className="login-main" data-od-id="admin-login">
        <div className="login-card">
          <p className="eyebrow eyebrow-gold">Staff only</p>
          <h1>Sign in to the console</h1>
          <p className="lead">Use the shared kitchen account, or your own manager login.</p>

          <Panel>
            <PanelBody>
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="staff-user">Username</label>
                  <input
                    id="staff-user"
                    className="input"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={!!error}
                    required
                  />
                </div>

                <div className="field" style={{ marginTop: 16 }}>
                  <label htmlFor="staff-pass">Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="staff-pass"
                      className="input"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ paddingRight: 90 }}
                      aria-invalid={!!error}
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", minHeight: 34, padding: "6px 12px", fontSize: 12 }}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="field-error" role="alert" style={{ marginTop: 12 }}>
                    {error.toLowerCase().includes("incorrect") || error.toLowerCase().includes("match")
                      ? "That username and password don't match. Try again."
                      : error}
                  </p>
                )}

                <div style={{ marginTop: 22 }}>
                  <Button type="submit" variant="primary" block disabled={isLoading}>
                    {isLoading ? "Signing in…" : "Sign in to the console"}
                  </Button>
                </div>
              </form>
            </PanelBody>
          </Panel>

          <p className="helpline" style={{ marginTop: 20, textAlign: "center" }}>
            Trouble signing in? Ask the manager who set up your account.
          </p>
        </div>
      </main>
    </div>
  )
}
