import { describe, expect, it } from 'vitest'
import { isPrivateHost, normaliseUrl } from './target'

describe('normaliseUrl', () => {
  it('keeps a full URL', () => {
    expect(normaliseUrl('https://example.com/path')).toBe('https://example.com/path')
  })

  it('adds https to a bare host', () => {
    expect(normaliseUrl('example.com')).toBe('https://example.com')
  })

  it('returns an empty string for an empty value', () => {
    expect(normaliseUrl('   ')).toBe('')
  })
})

describe('isPrivateHost', () => {
  it('blocks local hostnames and private addresses', () => {
    for (const host of [
      'localhost',
      'app.localhost',
      'printer.local',
      '127.0.0.1',
      '10.0.0.1',
      '192.168.1.1',
      '172.16.4.2',
      '172.31.255.1',
      '169.254.1.1',
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateHost(host), host).toBe(true)
    }
  })

  it('allows public hosts', () => {
    for (const host of ['example.com', '1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) {
      expect(isPrivateHost(host), host).toBe(false)
    }
  })
})
