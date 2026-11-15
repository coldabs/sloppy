import { describe, expect, it } from 'vitest'
import { runCli, type CliIo } from './cli'

const makeIo = (): { io: CliIo; out: () => string; err: () => string } => {
  let stdout = ''
  let stderr = ''
  const io: CliIo = {
    readStdin: async () => '',
    readFile: async () => {
      throw new Error('not stubbed')
    },
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

describe('F6: version comes from package.json, not a hardcoded copy', () => {
  it('has no hardcoded version fallback in the CLI', async () => {
    // In the test environment the build-time define does not exist,
    // so a run with no version passed in prints 'unknown' — the old
    // hardcoded '0.2.0' fallback is gone. The built bundle is
    // covered by the live probe: `node bin/sloppy.mjs --version`
    // prints the version from package.json.
    const { io, out } = makeIo()
    const code = await runCli(['--version'], io)
    expect(code).toBe(0)
    expect(out()).toBe('sloppy unknown\n')
  })

  it('prefers an explicitly passed version', async () => {
    const { io, out } = makeIo()
    const code = await runCli(['--version'], io, { version: '9.9.9' })
    expect(code).toBe(0)
    expect(out()).toBe('sloppy 9.9.9\n')
  })
})
