import { describe, expect, it } from 'vitest'
import {
  analyze,
  densityFactor,
  peakWindowDensityFactor,
  wordSpans,
  WINDOW_WORDS,
  type WordSpan,
} from './analyzer'
import {
  MAX_CLI_INPUT_BYTES,
  runCli,
  type CliIo,
  type SiteFetcher,
} from './cli'

// The pre-F5 loop, kept here as the reference implementation: a
// match counts in every window it touches. The binary-search
// version must agree with it on every input.
const bruteForcePeak = (
  matches: ReadonlyArray<{ start: number; end: number }>,
  spans: readonly WordSpan[],
): number => {
  const totalWords = spans.length
  if (matches.length === 0 || totalWords === 0) return 0
  if (totalWords <= WINDOW_WORDS) return densityFactor(matches.length, totalWords)
  let max = 0
  for (let i = 0; i < totalWords; i += 25) {
    const winStart = spans[i].start
    const winEnd = spans[Math.min(totalWords - 1, i + WINDOW_WORDS - 1)].end
    let hits = 0
    for (const m of matches) {
      if (m.start < winEnd && m.end > winStart) hits += 1
    }
    if (hits > max) max = hits
  }
  return densityFactor(max, WINDOW_WORDS)
}

const makeIo = (opts: {
  files?: Record<string, string>
  stdin?: string
}): { io: CliIo; out: () => string; err: () => string } => {
  let stdout = ''
  let stderr = ''
  const fetchSiteImpl: SiteFetcher = {
    fetchPage: async () => {
      throw new Error('not stubbed')
    },
    fetchCss: async () => {
      throw new Error('not stubbed')
    },
  }
  const io: CliIo = {
    readStdin: async () => opts.stdin ?? '',
    readFile: async (path) => {
      const value = opts.files?.[path]
      if (value === undefined) throw new Error(`Cannot read ${path}.`)
      return value
    },
    fetchSite: fetchSiteImpl,
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

describe('F5: linear peak-window density', () => {
  it('finds the densest window when matches cluster', () => {
    const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ')
    const spans = wordSpans(text)
    const matches = [
      ...Array.from({ length: 5 }, (_, i) => ({
        start: spans[i].start,
        end: spans[i].end,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        start: spans[100 + i].start,
        end: spans[100 + i].end,
      })),
    ]
    expect(peakWindowDensityFactor(matches, spans)).toBe(
      densityFactor(10, WINDOW_WORDS),
    )
  })

  it('agrees with the brute-force loop on pseudo-random inputs', () => {
    // A small deterministic PRNG, so the case is reproducible.
    let seed = 42
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (const words of [150, 300, 1000]) {
      const text = Array.from({ length: words }, (_, i) => `word${i}`).join(' ')
      const spans = wordSpans(text)
      const matches: Array<{ start: number; end: number }> = []
      for (let i = 0; i < 200; i++) {
        const a = Math.floor(next() * words)
        const b = Math.min(words - 1, a + Math.floor(next() * 30))
        matches.push({ start: spans[a].start, end: spans[b].end })
      }
      expect(peakWindowDensityFactor(matches, spans)).toBeCloseTo(
        bruteForcePeak(matches, spans),
        10,
      )
    }
  })

  it(
    'scores a 300k-word draft with dense matches instead of hanging',
    { timeout: 60_000 },
    () => {
      const words: string[] = []
      for (let i = 0; i < 300_000; i++) {
        words.push(i % 10 === 0 ? 'seamless' : `word${i}`)
      }
      const result = analyze(words.join(' '))
      expect(result.words).toBe(300_000)
      expect(result.hits).toBeGreaterThan(0)
      expect(result.score).toBeLessThan(100)
    },
  )
})

describe('F5: CLI input size cap', () => {
  it('refuses a draft over 8 MB with exit 2', async () => {
    const big = 'x'.repeat(MAX_CLI_INPUT_BYTES + 1)
    const { io, err } = makeIo({ files: { 'big.txt': big } })
    const code = await runCli(['big.txt'], io, { version: '0.2.0' })
    expect(code).toBe(2)
    expect(err()).toContain('larger than 8 MB')
  })

  it(
    'still scans a draft just under the cap',
    { timeout: 60_000 },
    async () => {
      // ~7.6 MB of varied prose, under the cap: words drawn from a
      // 5,000-word pool in a fixed pseudo-random order, so no word
      // pair repeats enough to fire repeated-bigrams and the scan
      // stays clean. (One sentence repeated 170k times makes 1.36M
      // findings, whose JSON exceeds V8's max string length — a
      // separate follow-on, not this cap.)
      let seed = 7
      const next = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return seed
      }
      const sentences: string[] = []
      for (let s = 0; s < 70_000; s++) {
        const count = 8 + (next() % 9)
        const words: string[] = []
        for (let w = 0; w < count; w++) words.push(`term${next() % 5000}`)
        sentences.push(`${words.join(' ')}.`)
      }
      const text = sentences.join(' ')
      expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(MAX_CLI_INPUT_BYTES)
      expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(7 * 1024 * 1024)
      const { io, out } = makeIo({ files: { 'big.txt': text } })
      const code = await runCli(['big.txt'], io, { version: '0.2.0' })
      // The scan completes (0 or 1); random pairs still repeat
      // enough to fire repeated-bigrams, so no clean score is
      // asserted — the point is it finishes instead of hanging.
      expect([0, 1]).toContain(code)
      expect(JSON.parse(out()).words).toBeGreaterThan(700_000)
    },
  )
})
