// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FETCH_TIMEOUT_MS } from '../../server/fetch.mjs'

describe('F8: vercel maxDuration leaves room for the friendly timeout', () => {
  it('is longer than the fetch timeout, so the platform does not kill the function at the same instant the fetch times out', () => {
    const vercel = JSON.parse(
      readFileSync(new URL('../../vercel.json', import.meta.url), 'utf-8'),
    ) as { functions: Record<string, { maxDuration: number }> }
    const maxDuration = vercel.functions['api/*.js'].maxDuration
    expect(maxDuration).toBeGreaterThan(FETCH_TIMEOUT_MS / 1000)
  })
})
