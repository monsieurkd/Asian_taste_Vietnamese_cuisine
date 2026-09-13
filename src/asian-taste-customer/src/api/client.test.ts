import { describe, it, expect, vi } from 'vitest'
import { resolveApiBaseUrl, resolveConfiguredApiBaseUrl } from './client'

/**
 * Tests for the API base-URL guard.
 *
 * Regression context: VITE_API_BASE_URL was set to a bare origin
 * (http://localhost:5070), which overrode the '/api' default. Every
 * data-loading screen then requested /menu/... instead of /api/menu/... and
 * got a 404 while the UI still rendered — a silent, app-wide breakage found
 * by the UI screenshot loop, not by any test. This pins the fix.
 */
describe('resolveApiBaseUrl', () => {
  it('defaults to the relative /api path when unset', () => {
    // Unset means "use the Vite dev proxy" — the safe default.
    expect(resolveApiBaseUrl(undefined)).toBe('/api')
    expect(resolveApiBaseUrl('')).toBe('/api')
  })

  it('appends /api to a bare origin (the bug that broke every screen)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveApiBaseUrl('http://localhost:5070')).toBe('http://localhost:5070/api')
    expect(resolveApiBaseUrl('https://api.asiantaste.com.au')).toBe('https://api.asiantaste.com.au/api')
  })

  it('leaves a value that already ends in /api untouched', () => {
    expect(resolveApiBaseUrl('http://localhost:5070/api')).toBe('http://localhost:5070/api')
    expect(resolveApiBaseUrl('https://api.asiantaste.com.au/api')).toBe('https://api.asiantaste.com.au/api')
  })

  it('strips trailing slashes so paths do not double up', () => {
    expect(resolveApiBaseUrl('http://localhost:5070/api/')).toBe('http://localhost:5070/api')
    expect(resolveApiBaseUrl('http://localhost:5070///')).toBe('http://localhost:5070/api')
  })

  it('warns loudly when it has to correct a bare origin', () => {
    // A silent correction would let the misconfiguration persist unnoticed.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resolveApiBaseUrl('http://localhost:5070')
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain('/api')
    warn.mockRestore()
  })

  it('never returns a base URL that would drop the /api segment', () => {
    // The invariant that matters: whatever goes in, requests must reach /api/*.
    const inputs = [
      undefined,
      '',
      'http://localhost:5070',
      'http://localhost:5070/',
      'http://localhost:5070/api',
      'https://api.asiantaste.com.au',
    ]
    for (const input of inputs) {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = resolveApiBaseUrl(input)
      expect(result === '/api' || result.endsWith('/api')).toBe(true)
    }
  })
})

/**
 * Tests for variable-name resolution.
 *
 * Regression context, and the worst outage this app has had: the Vercel project
 * was given VITE_API_URL — the ADMIN app's variable name — while this app reads
 * VITE_API_BASE_URL. With no value, the base URL fell back to the relative '/api',
 * so every request went to the site's OWN origin:
 *
 *     https://asian-taste-customer.vercel.app/api/menu   -> 404
 *
 * The menu rendered "No items found" on every load, indefinitely, while the API
 * and database were healthy the whole time.
 *
 * It was hard to diagnose from the outside for a specific reason worth encoding
 * here: NO request to the API host appears in the network tab, because the request
 * never leaves the frontend's own origin. It reads like an empty database rather
 * than a configuration fault.
 *
 * So a misnamed variable must degrade to "works, with a warning", never to a
 * silent 404 loop.
 */
describe('resolveConfiguredApiBaseUrl', () => {
  it('uses VITE_API_BASE_URL when set, and prefers it', () => {
    expect(
      resolveConfiguredApiBaseUrl({
        VITE_API_BASE_URL: 'https://asian-taste-api.fly.dev/api',
        VITE_API_URL: 'https://wrong.example.com/api',
      }),
    ).toBe('https://asian-taste-api.fly.dev/api')
  })

  it('falls back to VITE_API_URL rather than 404ing on every request', () => {
    // This is the exact deployed state that broke the site. It must now work.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      resolveConfiguredApiBaseUrl({ VITE_API_URL: 'https://asian-taste-api.fly.dev/api' }),
    ).toBe('https://asian-taste-api.fly.dev/api')
    warn.mockRestore()
  })

  it('warns when it has to fall back, naming the variable to set', () => {
    // A silent fallback would leave the wrong name in place forever.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resolveConfiguredApiBaseUrl({ VITE_API_URL: 'https://asian-taste-api.fly.dev/api' })
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain('VITE_API_BASE_URL')
    warn.mockRestore()
  })

  it('still applies the /api guard to whichever variable it uses', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveConfiguredApiBaseUrl({ VITE_API_URL: 'https://asian-taste-api.fly.dev' })).toBe(
      'https://asian-taste-api.fly.dev/api',
    )
    expect(resolveConfiguredApiBaseUrl({ VITE_API_BASE_URL: 'https://asian-taste-api.fly.dev' })).toBe(
      'https://asian-taste-api.fly.dev/api',
    )
  })

  it('defaults to the dev proxy only when neither is set', () => {
    expect(resolveConfiguredApiBaseUrl({})).toBe('/api')
  })

  it('never produces a URL that resolves against the frontend origin', () => {
    // The property that matters: with a configured API, requests must leave this
    // origin. A relative result here is the outage.
    const configured = [
      { VITE_API_BASE_URL: 'https://asian-taste-api.fly.dev/api' },
      { VITE_API_URL: 'https://asian-taste-api.fly.dev/api' },
      { VITE_API_URL: 'https://asian-taste-api.fly.dev' },
    ]
    for (const env of configured) {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(resolveConfiguredApiBaseUrl(env).startsWith('https://')).toBe(true)
    }
  })
})
