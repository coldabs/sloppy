import { rules } from '../lib/rules'
import { siteRules } from '../lib/siteRules'

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__main">
        <p className="eyebrow">Local pattern audit</p>
        <h1 id="hero-title">
          Paste the copy. Find the <span className="marker">slop</span>.
        </h1>
        <p className="hero__lede">
          sloppy reads a draft in your browser and scores the patterns that make
          copy sound machine-made: hype words, unsourced numbers, dead calls to
          action.
        </p>
        <div className="hero__actions">
          <a className="button button--primary" href="#detector">
            Scan a draft
          </a>
          <a className="button button--ghost" href="#method">
            How the score works
          </a>
        </div>
      </div>
      <aside className="hero__aside" aria-label="Tool facts">
        <p className="eyebrow">Spec</p>
        <dl className="spec-list">
          <div>
            <dt>Copy rules</dt>
            <dd>{rules.length}</dd>
          </div>
          <div>
            <dt>Site rules</dt>
            <dd>{siteRules.length}</dd>
          </div>
          <div>
            <dt>Upload</dt>
            <dd>None</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>None</dd>
          </div>
        </dl>
      </aside>
    </section>
  )
}
