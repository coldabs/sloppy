// @vitest-environment node
import { createServer, type Server } from 'node:http'
import { describe, expect, it } from 'vitest'
import { FetchError, fetchPage, isPrivateAddress, validateTarget } from './fetch.mjs'

const rejection = async (input: string, options?: { allowPrivate?: boolean }) => {
  try {
    await validateTarget(input, options)
    return null
  } catch (error) {
    return error instanceof FetchError ? error.code : 'unknown'
  }
}

describe('isPrivateAddress', () => {
  it('blocks private, loopback, link-local, and reserved IPv4 ranges', () => {
    for (const address of [
      '0.0.0.0',
      '10.1.2.3',
      '127.0.0.1',
      '169.254.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  it('allows public IPv4 addresses', () => {
    for (const address of ['1.1.1.1', '93.184.216.34', '8.8.8.8']) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })

  it('blocks only the RFC 5737 /24 documentation ranges, not the /16s', () => {
    // 198.51.100.0/24 (TEST-NET-2) and 203.0.113.0/24 (TEST-NET-3).
    for (const address of [
      '198.51.100.0',
      '198.51.100.1',
      '198.51.100.255',
      '203.0.113.0',
      '203.0.113.1',
      '203.0.113.255',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
    // The rest of 198.51.0.0/16 and 203.0.0.0/16 is public address space.
    for (const address of [
      '198.51.0.1',
      '198.51.99.1',
      '198.51.101.1',
      '198.51.200.1',
      '203.0.0.1',
      '203.0.112.1',
      '203.0.114.1',
      '203.0.200.1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })

  it('blocks NAT64, Teredo, 6to4, and the full fe80::/10 link-local range', () => {
    for (const address of [
      // NAT64 64:ff9b::/96, including an encapsulated private IPv4.
      '64:ff9b::127.0.0.1',
      '64:ff9b::8.8.8.8',
      // Teredo 2001::/32, in compressed and expanded spellings.
      '2001::1',
      '2001:0:4136:e378:8000:63bf:3fff:fdd2',
      '2001:0000::1',
      // 6to4 2002::/16, including an encapsulated private IPv4.
      '2002::1',
      '2002:808:808::1',
      '2002:7f00:1::1',
      // Link-local fe80::/10 spans fe80 through febf.
      'fe80::1',
      'fe8f::1',
      'fe9a::1',
      'fea0::1',
      'feb0::1',
      'febf::1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  it('does not block public IPv6 or short groups outside fc00::/7', () => {
    for (const address of [
      '2606:4700:4700::1111',
      // 2001:4860::/32 is Google, not Teredo (second group is not zero).
      '2001:4860:4860::8888',
      // Short first groups that merely start with fc/fd are outside
      // fc00::/7 (0x00fc, 0x0fca, 0x00fd, 0x0fd1, 0x0fc0).
      'fc::1',
      'fca::1',
      'fd::1',
      'fd1::1',
      'fc0::1',
      // Outside fe80::/10 on either side.
      'fec0::1',
      'fe00::1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })

  it('blocks loopback, unique-local, link-local, and mapped IPv6 addresses', () => {
    for (const address of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  it('allows public IPv6 addresses', () => {
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false)
  })
})

describe('validateTarget', () => {  it('rejects non-http protocols', async () => {
    expect(await rejection('file:///etc/passwd')).toBe('blocked-protocol')
    expect(await rejection('ftp://example.com/file')).toBe('blocked-protocol')
  })

  it('rejects credentials in the URL', async () => {
    expect(await rejection('https://user:pass@example.com')).toBe('blocked-credentials')
  })

  it('rejects non-standard ports', async () => {
    expect(await rejection('https://1.1.1.1:8080/')).toBe('blocked-port')
  })

  it('rejects private and loopback literals', async () => {
    expect(await rejection('http://127.0.0.1/')).toBe('blocked-address')
    expect(await rejection('http://10.0.0.5/')).toBe('blocked-address')
    expect(await rejection('http://192.168.1.10/')).toBe('blocked-address')
    expect(await rejection('http://[::1]/')).toBe('blocked-address')
  })

  it('accepts public literals', async () => {
    const url = await validateTarget('https://1.1.1.1/')
    expect(url.href).toBe('https://1.1.1.1/')
  })

  it('adds https when the scheme is missing', async () => {
    const url = await validateTarget('1.1.1.1/example')
    expect(url.protocol).toBe('https:')
  })

  it('allows private addresses and ports only with the explicit option', async () => {
    const url = await validateTarget('http://127.0.0.1:4173/', { allowPrivate: true })
    expect(url.href).toBe('http://127.0.0.1:4173/')
    expect(await rejection('http://127.0.0.1:4173/')).toBe('blocked-port')
  })

  it('rejects empty input', async () => {
    expect(await rejection('   ')).toBe('missing-url')
  })

  it('rejects decimal, octal, and hex loopback literals', async () => {
    // The WHATWG URL parser normalises all three spellings to
    // 127.0.0.1, so they are refused as blocked-address — the same
    // literals the browser-side guard used to let through (F9).
    expect(await rejection('http://2130706433/')).toBe('blocked-address')
    expect(await rejection('http://0177.0.0.1/')).toBe('blocked-address')
    expect(await rejection('http://0x7f.0.0.1/')).toBe('blocked-address')
    expect(await rejection('http://0x7f000001/')).toBe('blocked-address')
  })

  it('rejects the exact cloud-metadata address', async () => {
    expect(await rejection('http://169.254.169.254/')).toBe('blocked-address')
  })
})

// F10: a local server for the redirect and timeout cases. The
// server listens on loopback, so tests pass allowPrivate — the
// point is what happens after the first hop, not the first hop.
const withServer = async (
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void,
  run: (base: string) => Promise<void>,
): Promise<void> => {
  const server: Server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe('fetchPage redirects and timeout', () => {
  it('re-validates every redirect hop', async () => {
    // A redirect to a non-http protocol is refused even with
    // allowPrivate: the hop goes through resolveTarget again, so a
    // redirect cannot hop somewhere the direct URL could not go.
    // (A redirect to a non-80/443 port is refused by the same
    // re-validation — the direct-URL port test above covers that
    // branch — but it cannot be driven end to end here: with
    // allowPrivate off, the loopback origin itself is refused
    // before any redirect, and this sandbox has no public origin.)
    await withServer((_req, res) => {
      res.writeHead(302, { location: 'ftp://example.com/file' })
      res.end()
    }, async (base) => {
      await expect(fetchPage(`${base}/`, { allowPrivate: true })).rejects.toMatchObject({
        code: 'blocked-protocol',
      })
    })
    await withServer((_req, res) => {
      res.writeHead(302, { location: 'http://user:pass@127.0.0.1:8080/' })
      res.end()
    }, async (base) => {
      await expect(fetchPage(`${base}/`, { allowPrivate: true })).rejects.toMatchObject({
        code: 'blocked-credentials',
      })
    })
  })

  it('times out an idle socket after 10 s', async () => {
    // The server accepts the connection and never answers: the
    // request socket timeout (req.setTimeout(10000)) must fire
    // instead of hanging.
    await withServer((_req, _res) => {
      // Never respond; hold the socket open.
    }, async (base) => {
      await expect(fetchPage(`${base}/`, { allowPrivate: true })).rejects.toMatchObject({
        status: 504,
        code: 'timeout',
      })
    })
  }, 30_000)
})
