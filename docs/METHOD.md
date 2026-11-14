# Method

How sloppy scores a draft, in full. Everything here comes from
`src/lib/rules.ts` and `src/lib/analyzer.ts`. The page renders its rule
ledger from the same data, so this document and the scanner cannot drift
apart. If they ever disagree, the code is right and this document needs
fixing.

## Scoring

1. Every hit removes points by severity: high 15, medium 9, low 4.
2. Each rule counts at most twice toward the score, so one repeated word
   cannot sink a draft on its own. Hits beyond two are still listed, up
   to 40 shown per rule.
3. The penalty decays on a curve:

   `score = round(100 * e^(-penalty / 55))`

   A draft with no hits scores 100.

Verdict bands:

| Score | Verdict |
| --- | --- |
| 90 to 100 | Clean enough |
| 70 to 89 | Mostly clean |
| 45 to 69 | Slop creeping in |
| 20 to 44 | Heavy slop |
| 0 to 19 | Industrial slop |

The score is not normalised by length. One hit costs the same in a short
draft as in a long one. That is a known property of the formula, not a
bug that was missed. See [Limits](#limits).

## The rules

Twelve rules, in four groups.

### Voice

Words that perform confidence instead of naming a capability.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Em dash (`em-dash`) | High | The em dash character, and its HTML forms `&mdash;` and `&#8212;` | Use a comma, colon, period, or parentheses. |
| Hype vocabulary (`buzzwords`) | Medium | "ai-powered" / "ai powered", "revolutionary", "next-generation" / "next generation", "cutting-edge" / "cutting edge", "groundbreaking", "unparalleled", "seamless" / "seamlessly", "game-changing" / "game changer", "unleash", "supercharge", "state-of-the-art" / "state of the art", "best-in-class", "world-class", "industry-leading", "transformative", "disruptive", "synergy" / "synergies", "paradigm shift", "empower", "effortless" / "effortlessly", "innovative", "turnkey", "leverage", "elevate your", "take it to the next level", "in today's fast-paced world" | Swap in a concrete capability, or delete the word. |
| Template opener (`overused-opener`) | Low | "in today's world", "in today's fast-paced world", "in a world where", "imagine a world", "ever wondered", "we've all been there", "let's face it", "here's the thing", "in an era of" | Start with the claim itself. |
| Not just X, but Y (`not-just`) | Low | The stock cadence "not just X, but Y", where the twist arrives within 48 characters | State the claim once, directly. |
| Hype punctuation (`hype-punctuation`) | Low | Repeated `!` or `?` marks, and the rocket and sparkle emoji | Keep one period and let the sentence carry the weight. |

### Claims

Numbers, credentials, and praise that arrive without proof.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Unsourced number (`unsourced-number`) | Medium | A percentage, or a number with a `k`, `m`, or `b` suffix, with no source nearby | Link the source, or cut the number. |
| Unverified trust claim (`trust-claim`) | High | "SOC 2", "ISO 27001", "GDPR-compliant", "HIPAA-compliant", "enterprise-grade security", "bank-level encryption", "military-grade encryption", "100% secure", "100% uptime", "99.x% uptime" | Link the audit, or remove the claim. |
| Unattributed social proof (`social-proof`) | Medium | "trusted by", "loved by", "used by", "join thousands", "join millions", "join over", "join 10,000" | Name real customers, or delete the line. |
| Testimonial cliche (`testimonial-cliche`) | Medium | "changed my life", "life-changing", "10x our", "best decision we've made", "can't imagine", "blown away", "a must-have" | Quote a named customer with a source, or cut the section. |

The unsourced number rule leaves a number alone when a source cue
appears within 90 characters of it: "source", "according to", "per",
"report", "audit", "survey", "study", "data", or a URL. The trust claim
rule has no such exemption. A compliance claim is flagged even when the
audit is linked elsewhere in the draft.

### Actions

Labels that hide what the click actually does.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Generic call to action (`generic-cta`) | Medium | "get started", "learn more", "try now", "try it now", "explore", "discover", "click here", "read more", "sign up today", "start now", "find out more" | Name the action, for example "Paste your draft" or "See the rules". |
| Vague product noun (`vague-solution`) | Low | "solutions", "solution for", "all-in-one", "one-stop shop", "everything you need", "end-to-end", "does it all" | Name the specific task the product performs. |

### Format

Typographic habits borrowed from templates.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| All-caps shouting (`shouting-caps`) | Low | Runs of three or more capital letters, except for a fixed allowlist of real acronyms such as AI, API, GDPR, SOC, and WCAG | Use sentence case and let the wording carry the emphasis. |

## Limits

- The list is fixed. A phrase that is not on it scores nothing, however
  familiar it sounds. Common machine-made wording outside the twelve
  rules, and any paraphrase of a listed phrase, will pass clean.
- A listed phrase can be worked around by splitting it, swapping a
  character, or dropping the part the pattern needs, such as the `%`
  sign on a number.
- The source-cue exemption for numbers is broad. The word "data" on its
  own, within 90 characters, exempts a number.
- The score is penalty only, never per word. Short drafts are punished
  hardest for a single hit.
- False positives are normal. "Explore" is flagged even when it is the
  right verb, and a compliance claim is flagged even when it is true.
- Only English text is checked. Layout, images, motion, and code are out
  of reach. A high score is not proof of quality, and a low score is not
  proof of slop.

These limits are part of the method, not footnotes to it. Any change to
the rules should update this document in the same pull request.
