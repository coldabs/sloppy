// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf-8')

describe('F15: one Node version everywhere', () => {
  it('CI, Netlify, .nvmrc, and package.json engines all say 24', () => {
    const ci = read('../../.github/workflows/ci.yml')
    expect(ci).toContain('node-version: 24')
    const netlify = read('../../netlify.toml')
    expect(netlify).toContain('NODE_VERSION = "24"')
    expect(read('../../.nvmrc').trim()).toBe('24')
    const pkg = JSON.parse(read('../../package.json')) as {
      engines?: { node?: string }
    }
    expect(pkg.engines?.node).toBe('>=24')
  })
})
