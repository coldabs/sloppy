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
  score: number
  verdict: string
  structure: SiteFindingGroup[]
  style: SiteFindingGroup[]
  copy: Analysis
  copyText: string
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

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const SITE_HITS_PER_RULE_CAP = 2

const sortGroups = (groups: SiteFindingGroup[]) =>
  [...groups].sort(
    (a, b) =>
      severityRank[a.rule.severity] - severityRank[b.rule.severity] ||
      b.occurrences - a.occurrences ||
      a.rule.label.localeCompare(b.rule.label),
  )

export const analyzeSite = ({ url, html, stylesheets = [] }: SiteSource): SiteAnalysis => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const text = extractPageText(doc).slice(0, 60000)
  const copy = analyze(text)
  const css = stripComments([collectCss(doc), ...stylesheets].join('\n'))
  const context = { doc, css, text, url }

  const groups: SiteFindingGroup[] = []
  const counts: SeverityCounts = { ...copy.counts }
  let sitePenalty = 0
  let siteHits = 0

  for (const rule of siteRules) {
    const hits = rule.detect(context)
    if (hits.length === 0) continue

    const occurrences = hits.reduce((sum, hit) => sum + (hit.count ?? 1), 0)
    counts[rule.severity] += occurrences
    siteHits += occurrences
    sitePenalty +=
      severityWeight[rule.severity] * Math.min(occurrences, SITE_HITS_PER_RULE_CAP)
    groups.push({ rule, hits, occurrences })
  }

  const penalty = copy.penalty + sitePenalty
  const score = scoreFromPenalty(penalty)
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

  return {
    url,
    title: doc.title.trim(),
    description: (meta?.getAttribute('content') ?? '').trim(),
    score,
    verdict: verdictFor(score),
    structure: sortGroups(groups.filter((group) => group.rule.group === 'structure')),
    style: sortGroups(groups.filter((group) => group.rule.group === 'style')),
    copy,
    copyText: text,
    counts,
    hits: copy.hits + siteHits,
    rulesHit: copy.rulesHit + groups.length,
    penalty,
    stats,
  }
}

export const siteGroupCounts = (analysis: SiteAnalysis, group: SiteGroup) =>
  group === 'structure' ? analysis.structure.length : analysis.style.length
