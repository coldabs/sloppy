# sloppy

A local pattern checker for machine-made copy. Paste a draft, get a score from
0 to 100, and see every phrase that matched a rule, marked in place.

There is no language model and no network request. The scan is a fixed list of
patterns with visible weights and a visible formula, so the same draft always
gets the same score.

## What it checks

The rules sit in four groups. Severity decides how many points a hit removes.

| Group | What it looks for | Example rules |
| --- | --- | --- |
| Voice | Hype vocabulary and stock cadences | Em dash, "seamless", "revolutionary", "not just X, but Y" |
| Claims | Numbers and credentials without proof | Unsourced percentages, "SOC 2", "trusted by", stock testimonial lines |
| Actions | Labels that hide the action | "Get started", "Learn more", "solutions", "all-in-one" |
| Format | Template typographic habits | Long all-caps runs, repeated exclamation marks, rocket and sparkle emoji |

The full rule list lives in `src/lib/rules.ts` and is rendered on the page from
that same data, so the documentation and the scanner cannot drift apart.

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

Numbers near a source cue such as "according to", "report", "audit", or a URL
are left alone by the unsourced number rule.

## Run it

```sh
npm install
npm run dev
```

Other scripts:

```sh
npm run build      # typecheck and production build
npm run preview    # serve the production build
npm test           # run the analyzer tests with Vitest
npm run lint       # Oxlint
```

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

## Limits

This is a pattern matcher, not a critic. It cannot tell whether a sentence is
true, useful, or clear. It only sees text, so layout, images, motion, and code
are out of reach. False positives are normal: "Explore" is flagged even when it
is the right verb. A high score is not proof of quality, and a low score is not
proof of slop.

## Privacy

The draft never leaves the tab. There is no analytics, no account, and no API
call. Everything is computed by `analyze()` in `src/lib/analyzer.ts`.

## Accessibility

The page targets WCAG AA contrast, uses native buttons and links, keeps visible
focus rings, supports keyboard filtering, labels the scan regions with live
status roles, and respects `prefers-reduced-motion`.

## Stack

React 19, TypeScript, Vite, Vitest, Oxlint. No UI framework and no icon pack.

## Visual direction

Swiss poster: paper, ink, and one lime accent. The reasons behind the main
decisions:

- Palette: ink and paper carry structure; lime is reserved for the score, the
  primary button, and the active filter, so the accent marks a decision.
- Type: a heavy grotesque at tight tracking reads like a printed audit sheet,
  not a product dashboard.
- Layout: hairline rules and asymmetric columns build hierarchy without a
  single decorative card. Findings are a ledger, not a card grid.
- Fixed light theme: the print reference is the identity, so there is no
  half-finished dark mode.
- No icon pack: text labels are clearer for a tool whose job is language.

Motion stays at hover and focus transitions, plus a loading bar. There is no
scroll choreography to distract from the text.
