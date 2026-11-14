import { SCORE_DECAY, verdictBands } from '../lib/analyzer'
import {
  HITS_PER_RULE_SCORE_CAP,
  groupMeta,
  rulesByGroup,
  severityLabel,
  severityWeight,
  type GroupId,
} from '../lib/rules'

const groupOrder: GroupId[] = ['voice', 'claims', 'actions', 'format']

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
              Each hit removes points by severity: high {severityWeight.high},
              medium {severityWeight.medium}, low {severityWeight.low}.
            </li>
            <li>
              One rule counts at most {HITS_PER_RULE_SCORE_CAP} times, so a single
              repeated word cannot sink the whole draft on its own.
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
            It sees text only. Layout, images, motion, and code are outside the
            scan.
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
