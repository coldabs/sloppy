import {
  analyze,
  scoreFromPenalty,
  verdictFor,
  type Analysis,
  type SeverityCounts,
} from './analyzer'
import {
  severityRank,
  severityWeight,
} from './rules'
import {
  collectCss,
  extractPageText,
  siteRules,
  stripCssComments,
  type SiteGroup,
  type SiteHit,
  type SiteRuleMeta,
} from './siteRules'

export interface SiteFindingGroup {
  rule: SiteRuleMeta
  hits: SiteHit[]
  occurrences: number
}

export interface SiteStats {
  links: number
  deadLinks: number
  images: number
  missingAlt: number
  headings: number
  stylesheets: number
  inlineStyles: number
}

export interface SiteAnalysis {
  url: string
  title: string
  description: string
  // Null when the page was not readable (F34): the fetch saw no
  // readable copy, no links, and no headings, so no numeric score
  // is given for a page that was never read.
  score: number | null
  verdict: string
  structure: SiteFindingGroup[]
  style: SiteFindingGroup[]
  copy: Analysis
  copyText: string
  // True when the page had more visible text than the 60,000 characters
  // that were scanned. The copy findings cover the scanned part only.
  textTruncated: boolean
  counts: SeverityCounts
  hits: number
  rulesHit: number
  penalty: number
  stats: SiteStats
}

export interface SiteSource {
  url: string
  html: string
  stylesheets?: string[]
}

// A rule's penalty grows with its occurrences and levels off, so twenty
// dead links cost more than two but cannot decide a page on their own.
// One or two occurrences cost exactly what they cost before, so the
// thresholds the site rules were tuned against do not move.
export const siteDensityFactor = (occurrences: number): number =>
  occurrences <= 2
    ? occurrences
    : 2 + (occurrences - 2) / (1 + (occurrences - 2) / 8)

// Style signals are taste heuristics, not substance. Together they
// contribute at most this many penalty points, so a page with honest
// copy cannot be dragged halfway to slop by its palette and shadows
// alone. Structure and copy penalties are not capped.
export const STYLE_PENALTY_CAP = 15

// Only the first 60,000 characters of visible page text are scanned:
// a full-page scan of an unbounded document is too slow to run in the
// browser, and the copy panel shows the scanned text. The flag below
// tells the UI to say so.
export const SITE_TEXT_LIMIT = 60000

const sortGroups = (groups: SiteFindingGroup[]) =>
  [...groups].sort(
    (a, b) =>
      severityRank[a.rule.severity] - severityRank[b.rule.severity] ||
      b.occurrences - a.occurrences ||
      a.rule.label.localeCompare(b.rule.label),
  )

export const analyzeSite = ({ url, html, stylesheets = [] }: SiteSource): SiteAnalysis => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const fullText = extractPageText(doc)
  const text = fullText.slice(0, SITE_TEXT_LIMIT)
  const copy = analyze(text)
  const css = stripCssComments([collectCss(doc), ...stylesheets].join('\n'))
  const context = { doc, css, text, url }

  const groups: SiteFindingGroup[] = []
  const counts: SeverityCounts = { ...copy.counts }
  let sitePenalty = 0
  let stylePenalty = 0
  let siteHits = 0

  for (const rule of siteRules) {
    const hits = rule.detect(context)
    if (hits.length === 0) continue

    // Occurrences are counted from the hits, not from how many are
    // displayed: a rule that fires hundreds of times counts every
    // occurrence first and slices its display list afterwards (see
    // sliceForDisplay in siteRules.ts — the first shown hit carries
    // the full count, the rest carry 0), so the 400/400/300 display
    // caps can never silently hide occurrences from the penalty.
    const occurrences = hits.reduce((sum, hit) => sum + (hit.count ?? 1), 0)
    counts[rule.severity] += occurrences
    siteHits += occurrences
    const contribution =
      severityWeight[rule.severity] * siteDensityFactor(occurrences)
    if (rule.group === 'style') {
      stylePenalty += contribution
    } else {
      sitePenalty += contribution
    }
    groups.push({ rule, hits, occurrences })
  }

  sitePenalty += Math.min(stylePenalty, STYLE_PENALTY_CAP)
  const penalty = copy.penalty + sitePenalty
  const numericScore = scoreFromPenalty(penalty)
  const occurrencesFor = (id: string) =>
    groups.find((group) => group.rule.id === id)?.occurrences ?? 0
  const meta = doc.querySelector('meta[name="description"]')

  const stats: SiteStats = {
    links: doc.querySelectorAll('a[href]').length,
    deadLinks: occurrencesFor('dead-link'),
    images: doc.querySelectorAll('img').length,
    missingAlt: occurrencesFor('missing-alt'),
    headings: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
    stylesheets: stylesheets.length,
    inlineStyles: doc.querySelectorAll('style').length,
  }

  // A page the fetch never actually read — an empty client-rendered
  // shell — must not get a numeric clean score (F34). No readable
  // copy, no links, and no headings means nothing was read, so the
  // score is null and the verdict says so. The findings that were
  // found are still reported: they describe the shell, not the page.
  const readable = !(
    copy.words < 50 &&
    stats.links === 0 &&
    stats.headings === 0
  )
  const score = readable ? numericScore : null
  const verdict = readable ? verdictFor(numericScore) : 'Page not readable'

  return {
    url,
    title: doc.title.trim(),
    description: (meta?.getAttribute('content') ?? '').trim(),
    score,
    verdict: verdict,
    structure: sortGroups(groups.filter((group) => group.rule.group === 'structure')),
    style: sortGroups(groups.filter((group) => group.rule.group === 'style')),
    copy,
    copyText: text,
    textTruncated: fullText.length > SITE_TEXT_LIMIT,
    counts,
    hits: copy.hits + siteHits,
    rulesHit: copy.rulesHit + groups.length,
    penalty,
    stats,
  }
}

export const siteGroupCounts = (analysis: SiteAnalysis, group: SiteGroup) =>
  group === 'structure' ? analysis.structure.length : analysis.style.length
