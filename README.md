# sloppy

A local pattern checker for machine-made copy. Paste a draft, get a score
from 0 to 100, and see every phrase that matched a rule, marked in place.

There is no language model and no network request. The scan is a fixed list
of patterns with visible weights and a visible formula, so the same draft
always gets the same score, and every score can be explained.

## Contents

- [Why this exists](#why-this-exists)
- [What it checks](#what-it-checks)
- [Run it](#run-it)
- [How the score works](#how-the-score-works)
- [Privacy](#privacy)
- [Limits](#limits)
- [Contributing](#contributing)
- [License](#license)

## Why this exists

Most landing pages now read the same way. The same opening lines, the same
confident adjectives, the same numbers with nothing behind them, the same
buttons that say nothing about what happens next. You can feel it while you
read, but feeling it is not a way to fix a draft.

sloppy turns that feeling into a list. It points at the exact phrases, says
why each one was flagged, and suggests a plainer replacement. The draft stays
yours, and the judgement stays yours too. A score is a starting point for an
edit, not a verdict on the writing. If a flag feels wrong, it probably is.
Trust your ear over the score.

## What it checks

Twelve rules, in four groups. The full list, with the wording for each rule
and its suggested fix, is in [docs/METHOD.md](docs/METHOD.md), and the page
renders that same list from the same data, so the documentation and the
scanner cannot drift apart.

| Group | What it looks for |
| --- | --- |
| Voice | Hype vocabulary and stock cadences, including the em dash |
| Claims | Numbers and credentials without proof |
| Actions | Labels that hide what the click actually does |
| Format | Template typographic habits, such as long all-caps runs |

A draft of up to 20,000 characters can be scanned. A deliberately sloppy
sample is built in, under "Load a sloppy example", for anyone who wants to
see the tool work before pasting their own copy.

## Run it

```sh
npm install
npm run dev
```

Then open http://localhost:5173 in a browser.

Other scripts:

```sh
npm run build      # typecheck and production build
npm run preview    # serve the production build
npm test           # run the analyzer tests with Vitest
npm run lint       # Oxlint
```

## How the score works

1. Every hit removes points by severity: high 15, medium 9, low 4.
2. Each rule counts at most twice, so one repeated word cannot sink a draft.
3. The penalty decays on a curve: `score = round(100 * e^(-penalty / 55))`.

Verdict bands:

| Score | Verdict |
| --- | --- |
| 90 to 100 | Clean enough |
| 70 to 89 | Mostly clean |
| 45 to 69 | Slop creeping in |
| 20 to 44 | Heavy slop |
| 0 to 19 | Industrial slop |

Numbers near a source cue such as "according to", "report", "audit", or a
URL are left alone by the unsourced number rule. The full method, including
every rule, its weight, and its fix, is in [docs/METHOD.md](docs/METHOD.md).

## Privacy

The draft never leaves the tab. There is no analytics, no account, and no
API call. Everything is computed in the browser by `analyze()` in
`src/lib/analyzer.ts`.

## Limits

This is a pattern matcher, not a critic. It cannot tell whether a sentence
is true, useful, or clear. It only sees text, so layout, images, motion,
and code are out of reach.

False positives are normal. A common verb can be flagged even when it is
the right word for the sentence. A high score is not proof of quality, and
a low score is not proof of slop. Known gaps, including ways the fixed list
can be worked around, are written down rather than hidden. See the audit
notes in the repository history if they are kept with the project.

The page targets WCAG AA contrast, uses native buttons and links, keeps
visible focus rings, supports keyboard filtering, labels the scan regions
with live status roles, and respects `prefers-reduced-motion`.

## Project layout

```
src/
  components/
    Detector.tsx      input, validation, scan trigger, states
    Method.tsx        rule ledger, scoring, limits
    ResultPanel.tsx   score, filters, findings, marked copy
    Hero.tsx          opening section and spec panel
    Masthead.tsx      wordmark and section navigation
    Footer.tsx        closing statement
  lib/
    analyzer.ts       scan loop, scoring, excerpt and highlight building
    rules.ts          rule definitions, lexicons, weights, group metadata
    analyzer.test.ts  rule and scoring tests
    exampleDraft.ts   deliberately sloppy sample text
  index.css           the whole visual system
```

## Stack

React 19, TypeScript, Vite, Vitest, Oxlint. No UI framework and no icon
pack. The look is a Swiss poster: paper, ink, and one lime accent, in a
fixed light theme.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: keep the rules in one
place, add a test for any new rule, and keep the documentation honest
about what the tool cannot do. A human reads every issue and pull request.
Nothing merges on its own.

## License

Apache License 2.0. See [LICENSE](LICENSE). Copyright 2026 Coldabs.
