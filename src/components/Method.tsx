import {
  DENSITY_FLOOR_WORDS,
  SCORE_DECAY,
  verdictBands,
} from '../lib/analyzer'
import {
  groupMeta,
  rulesByGroup,
  severityLabel,
  severityWeight,
  type GroupId,
} from '../lib/rules'
import { siteGroupMeta, siteRules, type SiteGroup } from '../lib/siteRules'

const groupOrder: GroupId[] = ['voice', 'claims', 'actions', 'format']
const siteGroupOrder: SiteGroup[] = ['structure', 'style']

export function Method() {
  return (
    <section id="method" className="method" aria-labelledby="method-title">
      <header className="section-head">
        <p className="eyebrow">02 / Method</p>
        <h2 id="method-title">The rules behind the score</h2>
        <p className="section-head__note">
          There is no language model here. The whole check is a fixed list of
          patterns, weights, and a visible formula, so every result can be
          explained and reproduced.
        </p>
      </header>

      <div className="method__grid">
        <div className="method__score">
          <p className="eyebrow">Scoring</p>
          <h3 className="method__subtitle">From hits to a verdict</h3>
          <ol className="score-steps">
            <li>
              Each rule is weighted by severity: high {severityWeight.high},
              medium {severityWeight.medium}, low {severityWeight.low}, and
              scaled by how often it appears per 100 words. The scale
              levels off, so repeating one phrase costs more than saying
              it twice, but never without limit.
            </li>
            <li>
              One hit in a short draft costs far more than the same hit in
              a long one. Drafts under {DENSITY_FLOOR_WORDS} words are
              scored as if they were {DENSITY_FLOOR_WORDS} words.
            </li>
            <li>
              The total penalty decays on a curve: score = round(100 x e^(-penalty
              / {SCORE_DECAY})).
            </li>
          </ol>

          <table className="bands">
            <caption>Verdict bands</caption>
            <thead>
              <tr>
                <th scope="col">Score</th>
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {verdictBands.map((band, index) => {
                const previous = verdictBands[index - 1]
                const range = previous
                  ? `${band.min} to ${previous.min - 1}`
                  : `${band.min} to 100`
                return (
                  <tr key={band.label}>
                    <td>{range}</td>
                    <td>{band.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="method__rules">
          {groupOrder.map((groupId) => {
            const groupRules = rulesByGroup(groupId)
            return (
              <section className="rules-block" key={groupId}>
                <div className="rules-block__head">
                  <h3 className="rules-block__title">{groupMeta[groupId].label}</h3>
                  <span className="rules-block__count">
                    {groupRules.length} {groupRules.length === 1 ? 'rule' : 'rules'}
                  </span>
                </div>
                <p className="rules-block__blurb">{groupMeta[groupId].blurb}</p>
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">Rule</th>
                      <th scope="col">Severity</th>
                      <th scope="col">What it catches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRules.map((rule) => (
                      <tr key={rule.id}>
                        <th scope="row">{rule.label}</th>
                        <td>
                          <span className="severity-text">
                            {severityLabel[rule.severity]}
                          </span>
                        </td>
                        <td>{rule.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )
          })}
        </div>
      </div>

      <section className="site-rulebook" aria-labelledby="site-rulebook-title">
        <p className="eyebrow">Website mode</p>
        <h3 className="method__subtitle" id="site-rulebook-title">
          Static page rules
        </h3>
        <p className="rules-block__blurb">
          {siteRules.length} rules read the fetched markup and CSS. They use the
          same weights and the same formula as the copy scan, and every signal is
          counted so one stray declaration cannot decide a page.
        </p>
        <div className="site-rulebook__grid">
          {siteGroupOrder.map((groupId) => {
            const groupRules = siteRules.filter((rule) => rule.group === groupId)
            return (
              <div className="site-rulebook__group" key={groupId}>
                <h4>
                  {siteGroupMeta[groupId].label}
                  <span>
                    {groupRules.length} {groupRules.length === 1 ? 'rule' : 'rules'}
                  </span>
                </h4>
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">Rule</th>
                      <th scope="col">Severity</th>
                      <th scope="col">What it catches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRules.map((rule) => (
                      <tr key={rule.id}>
                        <th scope="row">{rule.label}</th>
                        <td>
                          <span className="severity-text">
                            {severityLabel[rule.severity]}
                          </span>
                        </td>
                        <td>{rule.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      </section>

      <div className="limits">
        <div className="limits__head">
          <p className="eyebrow">Limits</p>
          <h3 className="method__subtitle">What this cannot do</h3>
        </div>
        <ul className="limits__list">
          <li>
            It matches surface patterns. It cannot tell whether a sentence is
            true, useful, or clear.
          </li>
          <li>
            Website mode sees static HTML and CSS only. JavaScript-rendered
            content, computed styles, motion, and responsive layout are outside
            the scan.
          </li>
          <li>
            False positives happen. "Explore" is flagged even when it is the
            right verb.
          </li>
          <li>
            A high score is not proof of quality, and a low score is not proof of
            slop.
          </li>
        </ul>
      </div>
    </section>
  )
}
