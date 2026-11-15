// @vitest-environment happy-dom
// Regression tests for COMBINED_FIX_LIST.md F4 (Gemini #3 §1.3):
// the CLI parser truncated values at the second '=' and accepted
// an empty --threshold= as 0. Each test proves the fix from the
// failing side: the full query string survives, and an empty
// threshold is rejected.
import { describe, expect, it } from 'vitest'
import {
  CliError,
  parseCliArgs,
  runCli,
  type CliIo,
} from './cli'

// A one-word draft that scores 48: below the default threshold 70,
// so it fails CI unless the threshold is (wrongly) 0.
const FAILING_TEXT = 'seamless'

const makeIo = (opts: {
  files?: Record<string, string>
  fetchSite?: CliIo['fetchSite']
}): { io: CliIo; out: () => string; err: () => string } => {
  let stdout = ''
  let stderr = ''
  const io: CliIo = {
    readStdin: async () => '',
    readFile: async (path) => {
      const value = opts.files?.[path]
      if (value === undefined) throw new Error(`Cannot read ${path}.`)
      return value
    },
    fetchSite:
      opts.fetchSite ??
      ({
        fetchPage: async () => {
          throw new Error('fetch is not stubbed in this test')
        },
        fetchCss: async () => ({ css: '' }),
      } as CliIo['fetchSite']),
    stdinIsTTY: true,
    writeOut: (text) => {
      stdout += text
    },
    writeErr: (text) => {
      stderr += text
    },
  }
  return { io, out: () => stdout, err: () => stderr }
}

describe('F4: flag values keep every "=" after the first', () => {
  it('parseCliArgs keeps a full URL query string intact', () => {
    const options = parseCliArgs([
      '--url=https://example.com/?page=1&utm=ai',
    ])
    expect(options.input).toEqual({
      kind: 'url',
      url: 'https://example.com/?page=1&utm=ai',
    })
  })

  it('parseCliArgs keeps "=" inside other inline values', () => {
    const options = parseCliArgs(['--file=draft=v2.txt'])
    expect(options.input).toEqual({ kind: 'file', path: 'draft=v2.txt' })
  })

  it('runCli asks the fetcher for the exact URL, query string included', async () => {
    const target = 'https://example.com/?page=1&utm=ai'
    let fetched: string | null = null
    const { io, out } = makeIo({
      fetchSite: {
        fetchPage: async (url) => {
          fetched = url
          return {
            url,
            html: '<!doctype html><html><head><title>Probe</title></head><body><h1>Probe</h1><p>The quick brown fox jumps over the lazy dog.</p></body></html>',
          }
        },
        fetchCss: async () => ({ css: '' }),
      },
    })
    const code = await runCli(['--url', target], io, { version: '0.2.0' })
    expect(code).toBe(0)
    expect(fetched).toBe(target)
    expect(JSON.parse(out()).input).toBe(target)
  })
})

describe('F4: an empty --threshold= is rejected', () => {
  it('parseCliArgs throws on --threshold= (empty inline value)', () => {
    expect(() => parseCliArgs(['--threshold=', 'draft.txt'])).toThrow(
      CliError,
    )
    expect(() => parseCliArgs(['--threshold=', 'draft.txt'])).toThrow(
      '--threshold must be a number from 0 to 100.',
    )
  })

  it('parseCliArgs throws on --threshold followed by an empty value', () => {
    expect(() => parseCliArgs(['--threshold', '', 'draft.txt'])).toThrow(
      '--threshold must be a number from 0 to 100.',
    )
  })

  it('runCli exits 2 on --threshold= for a file that scores 48', async () => {
    const { io, err } = makeIo({ files: { 'draft.txt': FAILING_TEXT } })
    const code = await runCli(['--threshold=', 'draft.txt'], io, {
      version: '0.2.0',
    })
    expect(code).toBe(2)
    expect(err()).toContain('--threshold must be a number from 0 to 100.')
  })

  it('an explicit --threshold 0 still passes the same file (exit 0)', async () => {
    const { io } = makeIo({ files: { 'draft.txt': FAILING_TEXT } })
    expect(
      await runCli(['--threshold', '0', 'draft.txt'], io, {
        version: '0.2.0',
      }),
    ).toBe(0)
    const inline = makeIo({ files: { 'draft.txt': FAILING_TEXT } })
    expect(
      await runCli(['--threshold=0', 'draft.txt'], inline.io, {
        version: '0.2.0',
      }),
    ).toBe(0)
  })

  it('the same file still fails at the default threshold (exit 1)', async () => {
    const { io } = makeIo({ files: { 'draft.txt': FAILING_TEXT } })
    expect(
      await runCli(['draft.txt'], io, { version: '0.2.0' }),
    ).toBe(1)
  })
})
