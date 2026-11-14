import { useState } from 'react'
import { buildMarkedSegments, type Analysis, type Finding } from '../lib/analyzer'
import { rules, severityLabel, type RuleDefinition, type Severity } from '../lib/rules'

type Status = 'idle' | 'analyzing' | 'done' | 'error'
type Filter = 'all' | Severity

const FINDINGS_PAGE = 10

// One rule's findings, paginated. A long draft can have hundreds of
// hits for a single rule; the list shows the first one and reveals
// ten more at a time, with an exact count of what is still hidden,
// instead of silently stopping.
function FindingItem({ rule, hits }: { rule: RuleDefinition; hits: Finding[] }) {
  const [shown, setShown] = useState(1)
  const visible = hits.slice(0, shown)
  const remaining = hits.length - shown
  return (
    <li className="finding">
      <div className="finding__head">
        <span className={`tag tag--${rule.severity}`}>
          {severityLabel[rule.severity]}
        </span>
        <h3 className="finding__title">{rule.label}</h3>
        <span className="finding__count">
          {hits.length} {hits.length === 1 ? 'hit' : 'hits'}
        </span>
      </div>
      {visible.map((finding) => (
        <p className="finding__excerpt" key={`${finding.start}-${finding.end}`}>
          {finding.excerpt}
        </p>
      ))}
      {hits.length > 1 ? (
        <p className="finding__more">
          Showing {shown} of {hits.length} hits.{' '}
          {remaining > 0 ? (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setShown((value) => Math.min(hits.length, value + FINDINGS_PAGE))
              }
            >
              Show {Math.min(FINDINGS_PAGE, remaining)} more
            </button>
          ) : null}
          {shown > 1 ? (
            <button
              type="button"
              className="text-button"
              onClick={() => setShown(1)}
            >
              Show fewer
            </button>
          ) : null}
        </p>
      ) : null}
      <p className="finding__note">{rule.note}</p>
      <p className="finding__fix">
        <span className="finding__fix-label">Fix</span>
        {rule.fix}
      </p>
    </li>
  )
}

interface ResultPanelProps {
  analysis: Analysis | null
  scannedText: string
  status: Status
  errorMessage?: string | null
}

const filterOptions: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export function ResultPanel({
  analysis,
  scannedText,
  status,
  errorMessage,
}: ResultPanelProps) {
  const [filter, setFilter] = useState<Filter>('all')

  if (status === 'error') {
    return (
      <div className="result result--error" role="alert">
        <p className="eyebrow">Scan failed</p>
        <p className="result__verdict">The draft was not scanned</p>
        <p className="result__hint">{errorMessage}</p>
      </div>
    )
  }

  if (status === 'analyzing') {
    return (
      <div className="result result--pending" role="status" aria-live="polite">
        <p className="eyebrow">Score</p>
        <p className="result__score">
          <span className="result__number">?</span>
          <span className="result__denom">/ 100</span>
        </p>
        <p className="result__verdict">Reading the draft</p>
        <div className="result__progress" aria-hidden="true">
          <span />
        </div>
        <p className="result__hint">
          Running {rules.length} pattern rules over the text. A long draft can
          take a moment.
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
        <p className="result__verdict">No draft scanned yet</p>
        <p className="result__hint">
          Results appear here. Paste a paragraph and run the scan. The tool reads
          text patterns only, so it will not judge whether the argument holds
          up.
        </p>
      </div>
    )
  }

  const { score, verdict, groups, counts, hits, rulesHit, words } = analysis
  const visibleGroups =
    filter === 'all'
      ? groups
      : groups.filter((group) => group.rule.severity === filter)

  if (hits === 0) {
    return (
      <div className="result result--clean" role="status">
        <div className="result__top">
          <div className="result__score result__score--filled">
            <span className="result__number">{score}</span>
            <span className="result__denom">/ 100</span>
          </div>
          <div className="result__summary">
            <p className="eyebrow">Verdict</p>
            <p className="result__verdict">{verdict}</p>
            <p className="result__meta">
              No patterns matched in {words} {words === 1 ? 'word' : 'words'}.
            </p>
          </div>
        </div>
        <p className="result__hint">
          A clean score is not proof of good writing. These rules only catch
          surface patterns, and a careful draft can still be boring, wrong, or
          unclear.
        </p>
      </div>
    )
  }

  const segments = buildMarkedSegments(scannedText, analysis.findings)

  return (
    <div className="result result--found" aria-live="polite">
      <div className="result__top">
        <div className="result__score result__score--filled">
          <span className="result__number">{score}</span>
          <span className="result__denom">/ 100</span>
        </div>
        <div className="result__summary">
          <p className="eyebrow">Verdict</p>
          <p className="result__verdict">{verdict}</p>
          <p className="result__meta">
            {hits} {hits === 1 ? 'hit' : 'hits'} across {rulesHit} of{' '}
            {rules.length} rules, in {words} {words === 1 ? 'word' : 'words'}.
          </p>
        </div>
      </div>

      <ul className="severity-meter" aria-label="Hits by severity">
        <li>
          <span className="tag tag--high">High</span>
          <output aria-label={`${counts.high} high severity hits`}>{counts.high}</output>
        </li>
        <li>
          <span className="tag tag--medium">Medium</span>
          <output aria-label={`${counts.medium} medium severity hits`}>
            {counts.medium}
          </output>
        </li>
        <li>
          <span className="tag tag--low">Low</span>
          <output aria-label={`${counts.low} low severity hits`}>{counts.low}</output>
        </li>
      </ul>

      <h3 className="result__section-title">Findings</h3>

      <div className="filters" role="group" aria-label="Filter findings by severity">
        {filterOptions.map((option) => {
          const count =
            option.value === 'all' ? hits : counts[option.value as Severity]
          return (
            <button
              className="filter"
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label} <span className="filter__count">{count}</span>
            </button>
          )
        })}
      </div>

      {visibleGroups.length === 0 ? (
        <p className="result__hint">
          No findings at this severity. Try another filter.
        </p>
      ) : (
        <ul className="findings">
          {visibleGroups.map(({ rule, hits: ruleFindings }) => (
            <FindingItem key={rule.id} rule={rule} hits={ruleFindings} />
          ))}
        </ul>
      )}

      <section className="marked" aria-labelledby="marked-heading">
        <div className="marked__head">
          <h3 className="marked__title" id="marked-heading">
            Marked copy
          </h3>
          <ul className="marked__legend" aria-label="Highlight legend">
            <li>
              <span className="legend-swatch legend-swatch--high" aria-hidden="true" />
              High
            </li>
            <li>
              <span className="legend-swatch legend-swatch--medium" aria-hidden="true" />
              Medium
            </li>
            <li>
              <span className="legend-swatch legend-swatch--low" aria-hidden="true" />
              Low
            </li>
          </ul>
        </div>
        <div className="marked__body">
          {segments.map((segment, index) =>
            segment.severity ? (
              <mark className={`mark mark--${segment.severity}`} key={index}>
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </div>
      </section>
    </div>
  )
}
