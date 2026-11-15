import { IconExternalLink } from '@tabler/icons-react'
import { buildMarkedSegments } from '../lib/analyzer'
import type { SiteAnalysis, SiteFindingGroup } from '../lib/siteAnalyzer'
import { FindingList, type FindingListItem } from './FindingList'

export type SiteStatus = 'idle' | 'fetching' | 'analyzing' | 'done' | 'error'

interface SiteResultPanelProps {
  status: SiteStatus
  analysis: SiteAnalysis | null
  targetUrl: string
  errorMessage?: string | null
}

const shortUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`
  } catch {
    return value
  }
}

const siteItems = (groups: SiteFindingGroup[], kind: string): FindingListItem[] =>
  groups.map(({ rule, hits, occurrences }) => ({
    key: rule.id,
    label: rule.label,
    severity: rule.severity,
    note: rule.note,
    fix: rule.fix,
    excerpt: hits[0].excerpt,
    count: occurrences,
    countLabel: occurrences === 1 ? 'occurrence' : 'occurrences',
    // The "more" count is the true occurrence count, not the number
    // of hits shown: the display list is sliced at 400/400/300, so
    // 500 dead links show 400 hits but 499 more occurrences than the
    // one excerpt above. When nothing is sliced the two agree, so
    // short lists read exactly as before.
    more:
      occurrences > 1
        ? `Plus ${occurrences - 1} more ${kind} in the page.`
        : undefined,
  }))

const copyItems = (analysis: SiteAnalysis): FindingListItem[] =>
  analysis.copy.groups.map(({ rule, hits }) => ({
    key: rule.id,
    label: rule.label,
    severity: rule.severity,
    note: rule.note,
    fix: rule.fix,
    excerpt: hits[0].excerpt,
    count: hits.length,
    more:
      hits.length > 1
        ? `Plus ${hits.length - 1} more of the same in the page copy.`
        : undefined,
  }))

export function SiteResultPanel({
  status,
  analysis,
  targetUrl,
  errorMessage,
}: SiteResultPanelProps) {
  if (status === 'error') {
    return (
      <div className="result result--error" role="alert">
        <p className="eyebrow">Site scan failed</p>
        <p className="result__verdict">The page was not scanned</p>
        <p className="result__hint">{errorMessage}</p>
      </div>
    )
  }

  if (status === 'fetching' || status === 'analyzing') {
    const fetching = status === 'fetching'
    return (
      <div className="result result--pending" role="status" aria-live="polite">
        <p className="eyebrow">Score</p>
        <p className="result__score">
          <span className="result__number">?</span>
          <span className="result__denom">/ 100</span>
        </p>
        <p className="result__verdict">
          {fetching ? 'Fetching the page' : 'Reading the page'}
        </p>
        <div className="result__progress" aria-hidden="true">
          <span />
        </div>
        <p className="result__hint">
          {fetching
            ? `The fetch route is requesting the HTML${targetUrl ? ` for ${shortUrl(targetUrl)}` : ''} and its linked stylesheets.`
            : 'Running the structure, style, and copy rules over the fetched page.'}
        </p>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="result result--empty">
        <p className="eyebrow">Score</p>
        <p className="result__score">
          <span className="result__number">?</span>
          <span className="result__denom">/ 100</span>
        </p>
        <p className="result__verdict">No site scanned yet</p>
        <p className="result__hint">
          Results appear here. The scan reads static HTML and same-origin CSS. It
          cannot see JavaScript-rendered content, computed styles, hover states,
          or responsive layout.
        </p>
      </div>
    )
  }

  const { score, verdict, hits, rulesHit, stats, title, description, url, structure, style, copy, copyText, textTruncated } =
    analysis

  const segments = buildMarkedSegments(copyText, copy.findings)
  const structureItems = siteItems(structure, 'instances')
  const styleItems = siteItems(style, 'signals')
  const copyFindings = copyItems(analysis)

  return (
    <>
      {score === null ? (
        <div className="result result--error" role="alert">
          <p className="eyebrow">Page not readable</p>
          <p className="result__verdict">No score — the page was not read</p>
          <p className="result__hint">
            This page ships an empty shell and renders its content in JavaScript. The
            static fetch saw no readable copy, no links, and no headings, so no
            score is given. Use the copy mode to paste the page text instead.
          </p>
        </div>
      ) : null}
      <div className="result result--found site-result">
      <div className="result__top">
        <div className="result__score result__score--filled">
          <span className="result__number">{score === null ? '—' : score}</span>
          <span className="result__denom">/ 100</span>
        </div>
        <div className="result__summary">
          <p className="eyebrow">Verdict</p>
          <p className="result__verdict">{verdict}</p>
          <p className="result__meta" role="status">
            {hits} {hits === 1 ? 'hit' : 'hits'} across {rulesHit} rules, in{' '}
            {copy.words} {copy.words === 1 ? 'word' : 'words'} of page copy.
          </p>
        </div>
      </div>

      <div className="site-result__grid">
        <aside className="site-facts" aria-labelledby="site-facts-heading">
          <h3 className="result__section-title" id="site-facts-heading">
            Page facts
          </h3>
          <dl className="site-facts__list">
            <div>
              <dt>URL</dt>
              <dd>{shortUrl(url)}</dd>
            </div>
            <div>
              <dt>Title</dt>
              <dd>{title || 'None'}</dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>{description || 'None'}</dd>
            </div>
            <div>
              <dt>Links</dt>
              <dd>
                {stats.links}
                {stats.deadLinks > 0 ? ` (${stats.deadLinks} dead)` : ''}
              </dd>
            </div>
            <div>
              <dt>Images</dt>
              <dd>
                {stats.images}
                {stats.missingAlt > 0
                  ? ` (${stats.missingAlt} without alt)`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>Headings</dt>
              <dd>{stats.headings}</dd>
            </div>
            <div>
              <dt>CSS</dt>
              <dd>
                {stats.stylesheets} fetched, {stats.inlineStyles} inline
              </dd>
            </div>
          </dl>
          <a className="site-facts__open" href={url} target="_blank" rel="noreferrer noopener">
            Open page
            <IconExternalLink size={14} stroke={2} aria-hidden="true" />
          </a>
          <p className="site-facts__limit">
            Static fetch only: JavaScript-rendered content, computed styles,
            hover states, and responsive layout are outside this scan.
            {textTruncated
              ? ' Only the first 60,000 characters of visible text were scanned; copy past that point was not checked.'
              : ''}
          </p>
        </aside>

        <div className="site-sections">
          <section className="site-section" aria-labelledby="site-structure-heading">
            <div className="site-section__head">
              <h3 className="site-section__title" id="site-structure-heading">
                Structure
              </h3>
              <span className="site-section__count">
                {structure.length} {structure.length === 1 ? 'rule' : 'rules'}
              </span>
            </div>
            {structureItems.length === 0 ? (
              <p className="result__hint">No structure findings on this page.</p>
            ) : (
              <FindingList items={structureItems} />
            )}
          </section>

          <section className="site-section" aria-labelledby="site-style-heading">
            <div className="site-section__head">
              <h3 className="site-section__title" id="site-style-heading">
                Style signals
              </h3>
              <span className="site-section__count">
                {style.length} {style.length === 1 ? 'rule' : 'rules'}
              </span>
            </div>
            {styleItems.length === 0 ? (
              <p className="result__hint">No style signals matched.</p>
            ) : (
              <FindingList items={styleItems} />
            )}
          </section>

          <section className="site-section" aria-labelledby="site-copy-heading">
            <div className="site-section__head">
              <h3 className="site-section__title" id="site-copy-heading">
                Copy
              </h3>
              <span className="site-section__count">
                {copy.hits} {copy.hits === 1 ? 'hit' : 'hits'}
              </span>
            </div>
            {copyFindings.length === 0 ? (
              <p className="result__hint">No copy rules matched the page text.</p>
            ) : (
              <FindingList items={copyFindings} />
            )}
            {copyFindings.length > 0 ? (
              <details className="site-marked">
                <summary>Marked page copy</summary>
                <div className="marked__body">{segments.map((segment, index) =>
                  segment.severity ? (
                    <mark className={`mark mark--${segment.severity}`} key={index}>
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  ),
                )}</div>
              </details>
            ) : null}
          </section>
        </div>
      </div>
      </div>
    </>
  )
}
