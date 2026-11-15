// F43 — any scan error falsely marked the fetch API as dead: the
// catch block set apiFailed on every error in api mode, including
// targets the API correctly refused. The classification is a pure
// helper on the error code, tested here; SiteChecker wires it into
// the catch block.
import { describe, expect, it } from 'vitest'
import {
  apiError,
  errorCodeOf,
  isTargetError,
  TARGET_ERROR_CODES,
} from './siteFetch'

describe('F43: target errors are not API failures', () => {
  it('classifies every target-refusal code as a target error', () => {
    const codes = [
      'missing-url',
      'invalid-url',
      'url-too-long',
      'blocked-protocol',
      'blocked-credentials',
      'blocked-port',
      'blocked-address',
      'dns-failed',
      'too-large',
      'timeout',
      'network-failed',
      'http-error',
      'blocked-by-site',
      'not-html',
      'not-css',
      'bad-redirect',
      'too-many-redirects',
    ]
    expect([...TARGET_ERROR_CODES].sort()).toEqual([...codes].sort())
    for (const code of codes) {
      expect(isTargetError(apiError('The target was refused.', code))).toBe(true)
    }
  })

  it('classifies endpoint failures as endpoint failures', () => {
    expect(isTargetError(apiError('The fetch failed.', 'fetch-failed'))).toBe(false)
    expect(isTargetError(apiError('The endpoint is not running.', 'api-unavailable'))).toBe(false)
    expect(isTargetError(apiError('Forbidden.', 'forbidden-origin'))).toBe(false)
    expect(isTargetError(apiError('Unknown route.', 'not-found'))).toBe(false)
    expect(isTargetError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isTargetError(new Error('Something broke.'))).toBe(false)
    expect(isTargetError(apiError('No code at all.'))).toBe(false)
  })

  it('carries the code on the error', () => {
    const error = apiError('Private addresses are blocked.', 'blocked-address')
    expect(error.message).toBe('Private addresses are blocked.')
    expect(errorCodeOf(error)).toBe('blocked-address')
    expect(errorCodeOf(new Error('plain'))).toBeUndefined()
    expect(errorCodeOf(null)).toBeUndefined()
  })
})
