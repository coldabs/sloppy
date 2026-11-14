// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FetchError, isPrivateAddress, validateTarget } from './fetch.mjs'

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
})
