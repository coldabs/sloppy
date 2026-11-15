// @vitest-environment happy-dom
// Regression tests for COMBINED_FIX_LIST.md F60 (Claude §4.5):
// the technical-docs probe text always advertised a CLI surface
// that did not exist — `sloppy check draft.txt`, a `--json` flag,
// and a `sloppy.config.json` with `rules` and `threshold` keys —
// while the package was `private`, so `npx sloppy` could not
// install it at all. Each test proves one piece of that surface
// from the failing side.
import { describe, expect, it } from 'vitest'
import {
  CliError,
  parseCliArgs,
  parseSloppyConfig,
  runCli,
  type CliIo,
} from './cli'

// A one-word draft that scores 40 via the buzzwords rule: below
// the default threshold 70, so it fails CI unless the threshold is
// lowered or the rule is filtered out. (The F4 file's comment still
// says 48 — the F21 adaptive floor moved it to 40.)
const FAILING_TEXT = 'seamless'

const makeIo = (opts: {
  files?: Record<string, string>
  config?: string | null
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
    fetchSite: {
      fetchPage: async () => {
        throw new Error('fetch is not stubbed in this test')
      },
      fetchCss: async () => ({ css: '' }),
    } as CliIo['fetchSite'],
    stdinIsTTY: true,
    writeOut: (text) => {
      stdout += text
    },
    writeErr: (text) => {
      stderr += text
    },
    readConfig: async () => opts.config ?? null,
  }
  return { io, out: () => stdout, err: () => stderr }
}

describe('F60: the check subcommand', () => {
  it('parseCliArgs accepts check before a file', () => {
    const options = parseCliArgs(['check', 'draft.txt'])
    expect(options.input).toEqual({ kind: 'file', path: 'draft.txt' })
  })

  it('parseCliArgs accepts check before flags', () => {
    const options = parseCliArgs([
      'check',
      '--url',
      'https://example.com',
      '--json',
    ])
    expect(options.input).toEqual({
      kind: 'url',
      url: 'https://example.com',
    })
    expect(options.format).toBe('json')
  })

  it('parseCliArgs accepts check with no input, like a bare call', () => {
    const options = parseCliArgs(['check'])
    expect(options.input).toBeNull()
  })

  it('parseCliArgs treats a second check as a file named check', () => {
    const options = parseCliArgs(['check', 'check'])
    expect(options.input).toEqual({ kind: 'file', path: 'check' })
  })

  it('runCli scans through the check subcommand', async () => {
    const { io, out } = makeIo({
      files: { 'draft.txt': FAILING_TEXT },
    })
    const code = await runCli(['check', 'draft.txt'], io, {
      version: '0.2.0',
    })
    expect(code).toBe(1)
    expect(JSON.parse(out()).score).toBe(40)
  })
})

describe('F60: the --json flag', () => {
  it('parseCliArgs sets json format', () => {
    expect(parseCliArgs(['--json', 'draft.txt']).format).toBe('json')
  })

  it('parseCliArgs lets the later flag win between --json and --sarif', () => {
    expect(parseCliArgs(['--json', '--sarif', 'draft.txt']).format).toBe(
      'sarif',
    )
    expect(parseCliArgs(['--sarif', '--json', 'draft.txt']).format).toBe(
      'json',
    )
  })

  it('runCli prints JSON with --json', async () => {
    const { io, out } = makeIo({
      files: { 'draft.txt': FAILING_TEXT },
    })
    const code = await runCli(['check', 'draft.txt', '--json'], io, {
      version: '0.2.0',
    })
    expect(code).toBe(1)
    const report = JSON.parse(out())
    expect(report.kind).toBe('copy')
    expect(report.score).toBe(40)
  })
})

describe('F60: --threshold is tracked separately from the default', () => {
  it('parseCliArgs reports thresholdSet only when the flag was passed', () => {
    expect(parseCliArgs(['draft.txt']).thresholdSet).toBe(false)
    expect(parseCliArgs(['draft.txt']).threshold).toBe(70)
    expect(parseCliArgs(['--threshold', '90', 'draft.txt']).thresholdSet).toBe(
      true,
    )
    expect(parseCliArgs(['--threshold', '90', 'draft.txt']).threshold).toBe(90)
  })
})

describe('F60: sloppy.config.json parsing', () => {
  it('accepts both keys, and each key on its own', () => {
    expect(
      parseSloppyConfig(
        '{"rules": ["buzzwords", "em-dash"], "threshold": 90}',
      ),
    ).toEqual({ rules: ['buzzwords', 'em-dash'], threshold: 90 })
    expect(parseSloppyConfig('{"threshold": 90}')).toEqual({ threshold: 90 })
    expect(parseSloppyConfig('{"rules": ["buzzwords"]}')).toEqual({
      rules: ['buzzwords'],
    })
    expect(parseSloppyConfig('{}')).toEqual({})
  })

  it('dedupes repeated rule ids', () => {
    expect(
      parseSloppyConfig('{"rules": ["buzzwords", "buzzwords"]}'),
    ).toEqual({ rules: ['buzzwords'] })
  })

  it('rejects bad JSON and non-objects', () => {
    expect(() => parseSloppyConfig('{nope')).toThrow(CliError)
    expect(() => parseSloppyConfig('{nope')).toThrow(
      'sloppy.config.json is not valid JSON.',
    )
    expect(() => parseSloppyConfig('["buzzwords"]')).toThrow(
      'sloppy.config.json must be a JSON object.',
    )
  })

  it('rejects unknown keys', () => {
    expect(() => parseSloppyConfig('{"format": "sarif"}')).toThrow(
      'sloppy.config.json has unknown key(s): format. Only rules and threshold are accepted.',
    )
  })

  it('rejects a threshold outside 0–100 or not a number', () => {
    for (const bad of ['{"threshold": 101}', '{"threshold": -1}', '{"threshold": "high"}']) {
      expect(() => parseSloppyConfig(bad)).toThrow(
        'sloppy.config.json: threshold must be a number from 0 to 100.',
      )
    }
  })

  it('rejects rules that are not a list of rule ids', () => {
    expect(() => parseSloppyConfig('{"rules": "buzzwords"}')).toThrow(
      'sloppy.config.json: rules must be a list of rule ids.',
    )
    expect(() => parseSloppyConfig('{"rules": [42]}')).toThrow(
      'sloppy.config.json: rules must be a list of rule ids.',
    )
  })

  it('rejects unknown rule ids by name', () => {
    expect(() => parseSloppyConfig('{"rules": ["no-such-rule"]}')).toThrow(
      'sloppy.config.json: unknown rule id(s): no-such-rule.',
    )
  })
})

describe('F60: the config file drives runCli', () => {
  it('a config threshold replaces the default', async () => {
    const { io } = makeIo({
      files: { 'draft.txt': FAILING_TEXT },
      config: '{"threshold": 0}',
    })
    const code = await runCli(['draft.txt'], io, { version: '0.2.0' })
    expect(code).toBe(0)
  })

  it('a --threshold flag wins over the config threshold', async () => {
    const { io } = makeIo({
      files: { 'draft.txt': FAILING_TEXT },
      config: '{"threshold": 0}',
    })
    const code = await runCli(['--threshold', '90', 'draft.txt'], io, {
      version: '0.2.0',
    })
    expect(code).toBe(1)
  })

  it('a config rules list filters the scan to those rules', async () => {
    const { io, out } = makeIo({
      files: { 'draft.txt': FAILING_TEXT },
      config: '{"rules": ["em-dash"]}',
    })
    const code = await runCli(['draft.txt'], io, { version: '0.2.0' })
    expect(code).toBe(0)
    const report = JSON.parse(out())
    expect(report.score).toBe(100)
    expect(report.hits).toBe(0)
  })

  it('a config rules list that includes the firing rule keeps the hit', async () => {
    const { io, out } = makeIo({
      files: { 'draft.txt': FAILING_TEXT },
      config: '{"rules": ["buzzwords"]}',
    })
    const code = await runCli(['draft.txt'], io, { version: '0.2.0' })
    expect(code).toBe(1)
    expect(JSON.parse(out()).score).toBe(40)
  })

  it('an invalid config file exits 2 and names the file', async () => {
    const { io, err } = makeIo({
      files: { 'draft.txt': FAILING_TEXT },
      config: '{"rules": ["no-such-rule"]}',
    })
    const code = await runCli(['draft.txt'], io, { version: '0.2.0' })
    expect(code).toBe(2)
    expect(err()).toContain('sloppy.config.json: unknown rule id(s)')
  })

  it('no config file changes nothing', async () => {
    const { io } = makeIo({
      files: { 'draft.txt': FAILING_TEXT },
      config: null,
    })
    const code = await runCli(['draft.txt'], io, { version: '0.2.0' })
    expect(code).toBe(1)
  })
})
