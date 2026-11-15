// The analysis worker: analyze() and analyzeSite() run here, off
// the main thread, so pasting 60,000 characters never blocks the UI.
// Vite bundles this file as a separate chunk (see the `new Worker`
// call in analysisClient.ts); the page loads it over HTTP like any
// other asset.
//
// The request handler is a plain exported function, not just an
// onmessage closure, so tests can call it directly and compare its
// result with the main-thread analyser for the same input.
//
// A result crosses the worker boundary by structured clone, which
// cannot carry functions — and every analysis group carries its
// rule's `scan` function (and some a `penaltyFor`). The handler
// strips those two before posting: the UI only reads the rule's id,
// label, group, severity, note, and fix, so nothing it needs is
// lost, and a scan that forgot this would fail in the worker with a
// DataCloneError and silently fall back to the main thread every
// time.

import { analyze, type Analysis } from './analyzer'
import {
  analyzeSite,
  type SiteAnalysis,
  type SiteFindingGroup,
  type SiteSource,
} from './siteAnalyzer'
import type { RuleDefinition } from './rules'
import type { SiteRuleMeta } from './siteRules'

export type AnalysisRequest =
  | { id: number; kind: 'copy'; text: string }
  | { id: number; kind: 'site'; source: SiteSource }

export type AnalysisResponse =
  | { id: number; ok: true; kind: 'copy'; result: Analysis }
  | { id: number; ok: true; kind: 'site'; result: SiteAnalysis }
  | { id: number; ok: false; error: string }

// A rule without its functions: everything the UI reads, nothing
// structured clone cannot carry. The cast is honest — the stripped
// rule is display data only, and nothing calls `scan` on a result
// that came back from the worker.
const cloneableRule = (rule: RuleDefinition): RuleDefinition =>
  ({
    id: rule.id,
    label: rule.label,
    group: rule.group,
    severity: rule.severity,
    note: rule.note,
    fix: rule.fix,
  }) as RuleDefinition

// A copy analysis safe to postMessage. Site analyses carry the same
// copy analysis inside them, so they go through this too.
export const cloneableAnalysis = (analysis: Analysis): Analysis => ({
  ...analysis,
  groups: analysis.groups.map((group) => ({
    rule: cloneableRule(group.rule),
    hits: group.hits,
  })),
})

export const cloneableSiteAnalysis = (site: SiteAnalysis): SiteAnalysis => ({
  ...site,
  copy: cloneableAnalysis(site.copy),
  // A site group carries the full site rule, including its `detect`
  // function — same clone problem, same fix: keep the metadata the
  // panel reads (id, label, group, severity, note, fix) and drop
  // the function.
  structure: site.structure.map(cloneableSiteGroup),
  style: site.style.map(cloneableSiteGroup),
})

const cloneableSiteGroup = (group: SiteFindingGroup): SiteFindingGroup => {
  const rule: SiteRuleMeta = {
    id: group.rule.id,
    label: group.rule.label,
    group: group.rule.group,
    severity: group.rule.severity,
    note: group.rule.note,
    fix: group.rule.fix,
  }
  return { rule, hits: group.hits, occurrences: group.occurrences }
}

// One request in, one response out, same result as calling the
// analyser directly: the worker adds no scoring of its own, and a
// failure is reported as a response instead of killing the worker.
export const handleAnalysisRequest = (
  request: AnalysisRequest,
): AnalysisResponse => {
  try {
    if (request.kind === 'copy') {
      return {
        id: request.id,
        ok: true,
        kind: 'copy',
        result: cloneableAnalysis(analyze(request.text)),
      }
    }
    return {
      id: request.id,
      ok: true,
      kind: 'site',
      result: cloneableSiteAnalysis(analyzeSite(request.source)),
    }
  } catch (caught) {
    return {
      id: request.id,
      ok: false,
      error: caught instanceof Error ? caught.message : 'Analysis failed.',
    }
  }
}

// Only wire onmessage when this file is actually running as a
// worker. When the module is imported on the main thread — tests,
// or the client checking the handler — `window` exists and this
// stays inert.
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  const scope = self as unknown as {
    onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null
    postMessage: (message: AnalysisResponse) => void
  }
  scope.onmessage = (event) => {
    scope.postMessage(handleAnalysisRequest(event.data))
  }
}
