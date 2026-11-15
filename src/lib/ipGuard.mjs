// The one SSRF guard for the whole project (F9). The server's
// fetch guard (server/fetch.mjs) and the browser's pre-check
// (src/lib/target.ts) used to be two implementations of the same
// check and could disagree — the browser one was weaker: no NAT64,
// Teredo, 6to4, 192.0.0.0/24 or 198.18/15, and it did not recognise
// decimal, octal, or hex IPv4 literals at all. Both now call this
// module, so they cannot drift apart again.
//
// This file is plain JavaScript with no imports on purpose: the
// server (Node), the CLI bundle (Vite), and the browser app (Vite)
// all import it. Types live in ipGuard.d.mts, mirroring the
// server/fetch.d.mts pattern.

// Parse an IPv4 literal into four octets. Besides dotted decimal,
// inet_aton-style spellings are recognised: a single integer
// (2130706433, 0x7f000001), and octal (0177.0.0.1) or hex
// (0x7f.0.0.1) parts — all of which resolve to 127.0.0.1 and were
// blocked live by the server while the old browser check let them
// through. Returns null when the string is not an IPv4 literal.
const parseIPv4 = (host) => {
  const parts = host.split('.')
  if (parts.length === 0 || parts.length > 4) return null
  const nums = []
  for (const part of parts) {
    if (part === '') return null
    let n
    if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16)
    else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8)
    else if (/^[0-9]+$/.test(part)) n = parseInt(part, 10)
    else return null
    if (!Number.isSafeInteger(n) || n < 0) return null
    nums.push(n)
  }
  if (parts.length === 1) {
    const n = nums[0]
    if (n > 0xffffffff) return null
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  }
  // The last part may hold more than one octet.
  for (let i = 0; i < nums.length - 1; i += 1) {
    if (nums[i] > 255) return null
  }
  const octets = nums.slice(0, -1)
  let last = nums[nums.length - 1]
  const remaining = 4 - octets.length
  if (last >= 256 ** remaining) return null
  for (let i = remaining - 1; i >= 0; i -= 1) {
    octets.push((last >> (8 * i)) & 255)
  }
  return octets
}

const isPrivateIPv4 = ([a, b, c]) =>
  a === 0 ||
  a === 10 ||
  a === 127 ||
  (a === 100 && b >= 64 && b <= 127) ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 168) ||
  (a === 192 && b === 0) ||
  (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
  (a === 203 && b === 0 && c === 113) ||
  a >= 224

// Whether a resolved address is private, loopback, or reserved.
// This is the server's check, moved here verbatim in behaviour:
// an unparseable address returns true, so anything that is not a
// recognisable public address is refused rather than trusted.
export const isPrivateAddress = (address) => {
  const value = address.trim().toLowerCase().replace(/^\[|\]$/g, '')

  const octets = parseIPv4(value)
  if (octets !== null) return isPrivateIPv4(octets)
  if (!value.includes(':')) return true

  if (value === '::' || value === '::1') return true
  if (value.startsWith('::ffff:')) {
    return isPrivateAddress(value.slice('::ffff:'.length))
  }
  // Unique Local fc00::/7: the first group must be a full four hex
  // digits, fc00-fdff.
  if (/^f[cd][0-9a-f]{2}:/i.test(value)) return true
  // Link-local fe80::/10: first group fe80-febf.
  if (/^fe[89ab][0-9a-f]:/i.test(value)) return true
  if (value.startsWith('ff')) return true
  // Documentation 2001:db8::/32 (second group exactly 0db8).
  if (/^2001:0*db8:/i.test(value)) return true
  // NAT64 64:ff9b::/96 can encapsulate private IPv4 addresses.
  if (/^64:ff9b:/i.test(value)) return true
  // Teredo 2001::/32: second group all zeros, in any spelling
  // (2001:0:, 2001:0000:, or compressed 2001::).
  if (/^2001:0{0,4}:/i.test(value)) return true
  // 6to4 2002::/16 can encapsulate private IPv4 addresses.
  if (/^2002:/i.test(value)) return true
  return false
}

// The browser-side pre-check: local hostnames are private by name,
// an IP literal is judged by the shared address check, and anything
// else is a DNS name the server resolves and judges — it is not
// trusted or blocked here.
export const isPrivateHost = (hostname) => {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    return true
  }

  if (parseIPv4(host) !== null || host.includes(':')) {
    return isPrivateAddress(host)
  }
  return false
}
