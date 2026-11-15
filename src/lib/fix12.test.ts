// @vitest-environment happy-dom
import { readFile as fsReadFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { runCli, type CliIo } from './cli'

const makeIo = (): { io: CliIo; out: () => string; err: () => string } => {
  let stdout = ''
  let stderr = ''
  const io: CliIo = {
    readStdin: async () => '',
    // The real filesystem: --demo resolves its files from the repo
    // layout, so this exercises the real path, not a stub.
    readFile: (path) => fsReadFile(path, 'utf8'),
    fetchSite: {
      fetchPage: async () => {
        throw new Error('not stubbed')
      },
      fetchCss: async () => {
        throw new Error('not stubbed')
      },
    },
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

describe('F12: sloppy --demo scans the bundled demo site', () => {
  it('scores the demo fixture as a site scan', async () => {
    const { io, out } = makeIo()
    const code = await runCli(['--demo'], io, { version: '0.2.0' })
    const report = JSON.parse(out())
    expect(report.kind).toBe('site')
    expect(report.input).toContain('demo-site/index.html')
    // The fixture exists to fail the website checks.
    expect(report.score).toBeLessThan(70)
    expect(code).toBe(1)
  })

  it('refuses --demo combined with another input', async () => {
    const { io, err } = makeIo()
    const code = await runCli(['--demo', 'draft.txt'], io, { version: '0.2.0' })
    expect(code).toBe(2)
    expect(err()).toContain('Pass one input')
  })

  it('still refuses a file:// URL as a target', async () => {
    const { io, err } = makeIo()
    const code = await runCli(['--url', 'file:///tmp/demo-site/index.html'], io, {
      version: '0.2.0',
    })
    expect(code).toBe(2)
    expect(err()).toContain('Only http and https pages can be scanned.')
  })
})
