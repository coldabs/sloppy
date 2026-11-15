// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { request as httpRequest } from 'node:http'
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

const apiGet = (
  port: number,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: 'GET', headers },
      (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })

describe('F11: the fetch API only answers this server', () => {
  it('refuses a foreign Host and a foreign Origin, allows a loopback Origin', async () => {
    const port = 31000 + Math.floor(Math.random() * 5000)
    const serverPath = new URL('../server.mjs', import.meta.url).pathname
    const server = spawn('node', [serverPath], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      await waitForLine(server, `sloppy production server: http://localhost:${port}/`, 10_000)
      // DNS rebinding: the Host names another site.
      const rebound = await apiGet(port, '/api/fetch?url=https://example.com/', {
        host: 'evil.example.com',
      })
      expect(rebound.status).toBe(403)
      expect(JSON.parse(rebound.body).error).toBe('forbidden-origin')
      // Cross-site drive-by: a page on another origin driving the API.
      const crossSite = await apiGet(port, '/api/fetch?url=https://example.com/', {
        host: `127.0.0.1:${port}`,
        origin: 'https://evil.example.com',
      })
      expect(crossSite.status).toBe(403)
      expect(JSON.parse(crossSite.body).error).toBe('forbidden-origin')
      // The app itself, same origin: the request reaches the fetch
      // (it fails later on the unreachable target, not on origin).
      const own = await apiGet(port, '/api/fetch?url=http://127.0.0.1:9/', {
        host: `127.0.0.1:${port}`,
        origin: `http://localhost:${port}`,
      })
      expect(JSON.parse(own.body).error).not.toBe('forbidden-origin')
      // No Origin at all (curl): allowed through the same way.
      const noOrigin = await apiGet(port, '/api/fetch?url=http://127.0.0.1:9/', {
        host: `127.0.0.1:${port}`,
      })
      expect(JSON.parse(noOrigin.body).error).not.toBe('forbidden-origin')
      // Health is not a fetch endpoint and stays open.
      const health = await apiGet(port, '/api/health', { host: 'evil.example.com' })
      expect(health.status).toBe(200)
    } finally {
      server.kill('SIGTERM')
    }
  }, 30_000)
})
