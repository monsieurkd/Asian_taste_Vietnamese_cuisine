import { describe, it, expect, vi } from 'vitest'
import { resolveApiBaseUrl } from './client'

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
