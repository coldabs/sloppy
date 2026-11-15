// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const waitForLine = (proc: ChildProcess, text: string, timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for ${JSON.stringify(text)}; got ${JSON.stringify(output)}`))
    }, timeoutMs)
    proc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes(text)) {
        clearTimeout(timer)
        resolve()
      }
    })
    proc.on('exit', () => {
      clearTimeout(timer)
      reject(new Error(`server exited early; got ${JSON.stringify(output)}`))
    })
  })

const waitForExit = (proc: ChildProcess, timeoutMs: number) =>
  new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error('timed out waiting for exit')), timeoutMs)
    proc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
  })

describe('F7: the server handles a busy port by listening, not probing', () => {
  it('starts on a free port and refuses a second server on the same port', async () => {
    const port = 31000 + Math.floor(Math.random() * 5000)
    const serverPath = new URL('../server.mjs', import.meta.url).pathname
    const first = spawn('node', [serverPath], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      await waitForLine(first, `sloppy production server: http://localhost:${port}/`, 10_000)
      const second = spawn('node', [serverPath], {
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const { code, output } = await waitForExit(second, 10_000)
      expect(code).toBe(1)
      expect(output).toContain(`Port ${port} is already in use`)
      expect(output).toContain('An old dev server is probably running')
    } finally {
      first.kill('SIGTERM')
    }
  }, 30_000)
})
