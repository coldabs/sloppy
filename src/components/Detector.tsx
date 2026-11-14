import { useEffect, useRef, useState } from 'react'
import { analyze, type Analysis } from '../lib/analyzer'
import { exampleDraft } from '../lib/exampleDraft'
import { ResultPanel } from './ResultPanel'

type Status = 'idle' | 'analyzing' | 'done' | 'error'

const MAX_CHARS = 20000

const countWords = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function Detector() {
  const [text, setText] = useState('')
  const [scannedText, setScannedText] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [scanId, setScanId] = useState(0)
  const timer = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const runScan = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)

    if (text.trim().length === 0) {
      setAnalysis(null)
      setStatus('error')
      setError('Paste some copy first. The scan needs at least one word.')
      return
    }

    if (text.length > MAX_CHARS) {
      setAnalysis(null)
      setStatus('error')
      setError(
        `That draft is ${text.length.toLocaleString()} characters. The limit is ${MAX_CHARS.toLocaleString()}. Trim it and scan again.`,
      )
      return
    }

    setError(null)
    setStatus('analyzing')
    timer.current = window.setTimeout(() => {
      setScannedText(text)
      setAnalysis(analyze(text))
      setScanId((value) => value + 1)
      setStatus('done')
      timer.current = null
    }, 220)
  }

  const loadExample = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setText(exampleDraft)
    setScannedText('')
    setAnalysis(null)
    setStatus('idle')
    setError(null)
    textareaRef.current?.focus()
  }

  const clearAll = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setText('')
    setScannedText('')
    setAnalysis(null)
    setStatus('idle')
    setError(null)
    textareaRef.current?.focus()
  }

  const words = countWords(text)
  const describedBy = error ? 'draft-help draft-error' : 'draft-help'

  return (
    <section id="detector" className="detector" aria-labelledby="detector-title">
      <header className="section-head">
        <p className="eyebrow">01 / Detector</p>
        <h2 id="detector-title">Scan a draft</h2>
        <p className="section-head__note">
          Paste a landing page, a launch post, or any copy you are about to ship.
          The scan runs in this tab. Nothing is uploaded.
        </p>
      </header>

      <div className="detector__grid">
        <form
          className="detector__input"
          onSubmit={(event) => {
            event.preventDefault()
            runScan()
          }}
        >
          <div className="field-head">
            <label className="field-label" htmlFor="draft">
              Draft copy
            </label>
            <span className="field-hint">20,000 characters maximum</span>
          </div>
          <textarea
            id="draft"
            ref={textareaRef}
            className="draft"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste the paragraph you want checked."
            aria-invalid={status === 'error'}
            aria-describedby={describedBy}
            spellCheck="false"
          />
          <div className="draft-toolbar">
            <p className="draft-count" id="draft-help">
              {words} {words === 1 ? 'word' : 'words'} /{' '}
              {text.length.toLocaleString()} characters
            </p>
            <div className="draft-actions">
              <button className="text-button" type="button" onClick={loadExample}>
                Load a sloppy example
              </button>
              <button
                className="text-button"
                type="button"
                onClick={clearAll}
                disabled={text.length === 0 && status === 'idle'}
              >
                Clear
              </button>
            </div>
          </div>
          {error ? (
            <p className="field-error" id="draft-error">
              {error}
            </p>
          ) : null}
          <button
            className="button button--primary button--wide"
            type="submit"
            disabled={status === 'analyzing'}
          >
            {status === 'analyzing' ? 'Scanning' : 'Scan the draft'}
          </button>
        </form>

        <div className="detector__output">
          <ResultPanel
            key={scanId}
            analysis={analysis}
            scannedText={scannedText}
            status={status}
            errorMessage={error}
          />
        </div>
      </div>
    </section>
  )
}
