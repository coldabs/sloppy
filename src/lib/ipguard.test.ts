// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isPrivateAddress } from '../../server/fetch.mjs'
import { isPrivateHost } from './target'

// F9: one shared guard. The server's address check (imported here
// through server/fetch.mjs, proving the server uses the shared
// module) and the browser's hostname pre-check must agree on every
// literal either of them can judge. DNS names are deliberately
// excluded: the browser returns false for them and the server
// decides after resolving.
const cases: Array<[string, boolean]> = [
  // Private / reserved IPv4
  ['0.0.0.0', true],
  ['10.0.0.1', true],
  ['10.255.255.255', true],
  ['127.0.0.1', true],
  ['169.254.169.254', true],
  ['172.16.0.1', true],
  ['172.31.255.255', true],
  ['192.168.0.1', true],
  ['192.0.0.1', true],
  ['192.0.2.1', true],
  ['100.64.0.1', true],
  ['100.127.255.255', true],
  ['198.18.0.1', true],
  ['198.19.255.255', true],
  ['198.51.100.1', true],
  ['203.0.113.1', true],
  ['224.0.0.1', true],
  ['240.0.0.1', true],
  ['255.255.255.255', true],
  // IPv4 literals in non-decimal spellings (all 127.0.0.1 / 192.168.0.1)
  ['2130706433', true],
  ['0x7f000001', true],
  ['0177.0.0.1', true],
  ['0x7f.0.0.1', true],
  ['3232235521', true],
  // Private / reserved IPv6
  ['::1', true],
  ['::', true],
  ['fc00::1', true],
  ['fd12:3456::1', true],
  ['fe80::1', true],
  ['febf::1', true],
  ['ff02::1', true],
  ['2001:db8::1', true],
  ['64:ff9b::1', true],
  ['2001::1', true],
  ['2002::1', true],
  ['::ffff:127.0.0.1', true],
  // Local hostnames
  ['localhost', true],
  ['app.localhost', true],
  ['printer.local', true],
  // Public IPv4
  ['8.8.8.8', false],
  ['1.1.1.1', false],
  ['93.184.216.34', false],
  ['11.0.0.1', false],
  ['100.63.0.1', false],
  ['100.128.0.1', false],
  ['172.15.0.1', false],
  ['172.32.0.1', false],
  ['169.253.0.1', false],
  ['192.1.0.1', false],
  ['198.51.101.1', false],
  ['203.0.114.1', false],
  // Public IPv6
  ['2001:4860:4860::8888', false],
  ['2606:4700:4700::1111', false],
  ['::ffff:8.8.8.8', false],
  ['fec0::1', false],
]

describe('F9: one shared SSRF guard', () => {
  it('server and browser guards agree on all 55 addresses', () => {
    expect(cases.length).toBe(55)
    for (const [address, expected] of cases) {
      expect(isPrivateAddress(address), `server ${address}`).toBe(expected)
      expect(isPrivateHost(address), `browser ${address}`).toBe(expected)
    }
  })

  it('leaves DNS names to the server', () => {
    expect(isPrivateHost('example.com')).toBe(false)
    expect(isPrivateHost('sloppyabs.netlify.app')).toBe(false)
  })
})
