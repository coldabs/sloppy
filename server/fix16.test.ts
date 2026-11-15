// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf-8')

describe('F16: the app config leaks no Node types', () => {
  it('tsconfig.app.json lists no node types', () => {
    const text = read('../tsconfig.app.json')
    const types = text.match(/"types"\s*:\s*\[[^\]]*\]/)
    expect(types).not.toBeNull()
    expect(types?.[0]).not.toContain('"node"')
  })

  it(
    'the app program contains no @types/node files',
    // 30s: a tsc --listFiles run takes ~3s alone but ~7s when the
    // full suite runs in parallel.
    { timeout: 30_000 },
    () => {
    const out = execFileSync(
      'npx',
      ['tsc', '-p', 'tsconfig.app.json', '--noEmit', '--listFiles'],
      { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf-8' },
    )
    const nodeFiles = out
      .split('\n')
      .filter((line) => line.includes('@types/node'))
    expect(nodeFiles).toEqual([])
  })
})
