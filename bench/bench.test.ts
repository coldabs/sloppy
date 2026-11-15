// Benchmark harness — the frozen labelled corpus (bench/corpus.jsonl).
// Flagged means score < 90 (not "Clean enough"). Binary labels are
// slop (should be flagged) and clean (should not); "grey" entries
// (pinned "mostly", 70-89) are reported separately and never count
// toward precision or recall. Thresholds are tuned on the dev split
// only; the test split is held out. See bench/README.md — including
// the honest caveat that the labels were pinned from the scorer's own
// output, so this is a regression gate, not an independent evaluation.
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze, MIN_SCORE_WORDS } from '../src/lib/analyzer'
import { rules } from '../src/lib/rules'

// CI gates (Teamly §4.8): the run fails when the held-out test split
// falls below either one.
export const PRECISION_GATE = 0.85
export const RECALL_GATE = 0.6

type Label = 'slop' | 'clean' | 'grey'
type Split = 'dev' | 'test'

interface CorpusEntry {
  id: string
  text: string
  label: Label
  split: Split
  source: string
}

const loadCorpus = (): CorpusEntry[] => {
  const raw = readFileSync(new URL('./corpus.jsonl', import.meta.url), 'utf-8')
  return raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as CorpusEntry)
}

const isFlagged = (score: number): boolean => score < 90

interface BinaryMetrics {
  n: number
  tp: number
  fp: number
  fn: number
  tn: number
  precision: number
  recall: number
  f1: number
}

const metricsFor = (
  rows: Array<CorpusEntry & { score: number }>,
): BinaryMetrics => {
  const bin = rows.filter((row) => row.label !== 'grey')
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0
  for (const row of bin) {
    const flagged = isFlagged(row.score)
    if (row.label === 'slop' && flagged) tp += 1
    else if (row.label === 'slop') fn += 1
    else if (flagged) fp += 1
    else tn += 1
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall)
  return { n: bin.length, tp, fp, fn, tn, precision, recall, f1 }
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`

describe('bench: labelled corpus', () => {
  const corpus = loadCorpus()
  const scored = corpus.map((entry) => {
    const result = analyze(entry.text)
    return {
      ...entry,
      score: result.score,
      words: result.words,
      ruleIds: [...new Set(result.findings.map((f) => f.ruleId))],
    }
  })

  // F21 (2026-11-15): entries under MIN_SCORE_WORDS have no meaningful
  // score — the verdict is "Too short to score" — so they are excluded
  // from every metric (binary, grey-zone, per-rule) and reported as
  // skipped. They stay in the frozen corpus; their labels are inert.
  const scorable = scored.filter((row) => row.words >= MIN_SCORE_WORDS)
  const skipped = scored.length - scorable.length

  it('is frozen and well-formed', () => {
    // Adding entries is a deliberate act (see bench/README.md); the
    // count is pinned so a silent edit fails loudly.
    expect(scored).toHaveLength(131)
    expect(new Set(scored.map((row) => row.id)).size).toBe(scored.length)
    for (const row of scored) {
      expect(['slop', 'clean', 'grey']).toContain(row.label)
      expect(['dev', 'test']).toContain(row.split)
      expect(row.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('meets the precision/recall gates on the held-out test split', () => {
    console.log(
      `too short to score: ${skipped} of ${scored.length} entries skipped`,
    )
    for (const name of ['all', 'dev', 'test'] as const) {
      const rows =
        name === 'all'
          ? scorable
          : scorable.filter((row) => row.split === name)
      const m = metricsFor(rows)
      console.log(
        `${name}: n=${m.n} tp=${m.tp} fp=${m.fp} fn=${m.fn} tn=${m.tn} ` +
          `precision=${pct(m.precision)} recall=${pct(m.recall)} f1=${pct(m.f1)}`,
      )
      if (name === 'test') {
        expect(m.precision).toBeGreaterThanOrEqual(PRECISION_GATE)
        expect(m.recall).toBeGreaterThanOrEqual(RECALL_GATE)
      }
    }
    const grey = scorable.filter((row) => row.label === 'grey')
    const inBand = grey.filter(
      (row) => row.score >= 70 && row.score < 90,
    ).length
    console.log(`grey zone: ${inBand}/${grey.length} inside 70-89`)
  })

  it('reports per-rule precision', () => {
    const bin = scorable.filter((row) => row.label !== 'grey')
    const byRule = new Map<string, { slop: number; clean: number }>()
    for (const row of bin) {
      for (const ruleId of row.ruleIds) {
        const counts = byRule.get(ruleId) ?? { slop: 0, clean: 0 }
        if (row.label === 'slop') counts.slop += 1
        else counts.clean += 1
        byRule.set(ruleId, counts)
      }
    }
    const table = [...byRule.entries()]
      .map(([ruleId, counts]) => ({
        ruleId,
        fired: counts.slop + counts.clean,
        precision:
          counts.slop + counts.clean === 0
            ? 1
            : counts.slop / (counts.slop + counts.clean),
      }))
      .sort((a, b) => b.fired - a.fired)
    console.log('rule | fired | precision (slop share of firings)')
    for (const row of table) {
      console.log(
        `${row.ruleId} | ${row.fired} | ${pct(row.precision)}`,
      )
    }
    // Rules that never fire on the binary corpus at all — a coverage
    // gap in the corpus, not necessarily a dead rule.
    const neverFired = rules
      .map((rule) => rule.id)
      .filter((id) => !byRule.has(id))
    console.log(`never fired on binary entries: ${neverFired.join(', ') || '-'}`)
    // No gate here — the table is a diagnostic. A rule that fires
    // mostly on clean-labelled entries is noise, not signal.
    expect(table.length).toBeGreaterThan(0)
  })
})
