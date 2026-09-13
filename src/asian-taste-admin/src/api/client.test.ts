import { describe, it, expect, vi } from 'vitest'
import { resolveApiBaseUrl } from './client'

/**
 * Tests for the admin app's API base-URL guard.
 *
 * Regression context: this app had no guard at all, unlike the customer app.
 * A VITE_API_URL of just an origin ("https://asian-taste-api.fly.dev") drops the
 * /api segment, so every request goes to /orders instead of /api/orders and 404s
 * — while the dashboard still renders. The symptom is "no orders", which reads
 * like a data problem rather than a configuration one.
 *
 * That exact bug already happened once on the customer app, which is why the
 * behaviour is pinned here before the admin app is deployed anywhere.
 */
describe('resolveApiBaseUrl', () => {
  it('defaults to the relative /api path when unset', () => {
    // Unset means "use the Vite dev proxy" — the safe default.
    expect(resolveApiBaseUrl(undefined)).toBe('/api')
    expect(resolveApiBaseUrl('')).toBe('/api')
  })

  it('appends /api to a bare origin, which would otherwise 404 every request', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveApiBaseUrl('https://asian-taste-api.fly.dev')).toBe(
      'https://asian-taste-api.fly.dev/api',
    )
  })

  it('leaves a value that already ends in /api untouched', () => {
    expect(resolveApiBaseUrl('https://asian-taste-api.fly.dev/api')).toBe(
      'https://asian-taste-api.fly.dev/api',
    )
  })

  it('strips trailing slashes so paths do not double up', () => {
    expect(resolveApiBaseUrl('https://asian-taste-api.fly.dev/api/')).toBe(
      'https://asian-taste-api.fly.dev/api',
    )
  })

  it('warns loudly when it has to correct a bare origin', () => {
    // A silent correction would let the misconfiguration persist unnoticed.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resolveApiBaseUrl('https://asian-taste-api.fly.dev')
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain('/api')
    warn.mockRestore()
  })

  it('never returns a base URL that would drop the /api segment', () => {
    // The invariant that matters: whatever goes in, requests must reach /api/*.
    for (const input of [
      undefined,
      '',
      'https://asian-taste-api.fly.dev',
      'https://asian-taste-api.fly.dev/',
      'https://asian-taste-api.fly.dev/api',
      '/api',
    ]) {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = resolveApiBaseUrl(input)
      expect(result === '/api' || result.endsWith('/api')).toBe(true)
    }
  })
})
