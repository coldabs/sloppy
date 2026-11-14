# sloppy

A local pattern checker for machine-made copy and machine-made websites.
Paste a draft or point it at a page, get a score from 0 to 100, and see every
pattern that matched.

There is no language model. The scan is a fixed list of patterns, CSS signals,
and visible weights with a visible formula, so the same input always gets the
same score, and every score can be explained.

## Contents

- [Why this exists](#why-this-exists)
- [Two modes](#two-modes)
- [Run it](#run-it)
- [How the score works](#how-the-score-works)
- [Website fetch guards](#website-fetch-guards)
- [Demo site](#demo-site)
- [Project layout](#project-layout)
- [Privacy](#privacy)
- [Limits](#limits)
- [Accessibility](#accessibility)
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

## Two modes

### Copy

Paste a landing page, a launch post, or any text. The scanner runs twenty-eight
rules over the draft and marks each hit in place.

| Group | What it looks for |
| --- | --- |
| Voice | Hype vocabulary, AI tell phrases, and stock cadences, including the em dash |
| Claims | Numbers and credentials without proof, vague superlatives |
| Actions | Labels that hide what the click actually does |
| Format | Template typographic habits, such as long all-caps runs |
| Structure | The shape of the writing: cadence, repetition, and density |
| Diversity | How varied the writing is: sentence-length rhythm, vocabulary range, repeated word pairs, transition stacking |
| Substance | Whether the text says anything concrete: substance-poor paragraphs, uncited authority claims, pseudo-wisdom filler |

The full list, with the wording for each rule and its suggested fix, is in
[docs/METHOD.md](docs/METHOD.md), and the page renders that same list from the
same data, so the documentation and the scanner cannot drift apart.

A draft of up to 20,000 characters can be scanned. A deliberately sloppy
sample is built in, under "Load a sloppy example", for anyone who wants to
see the tool work before pasting their own copy.

### Website

Enter a public URL. The fetch route pulls the HTML and the linked stylesheets,
including cross-origin CDN CSS, and the browser analyzes three things:

1. **Structure:** dead links, anchors with no target, unnamed controls, missing
   image alts, heading order, template section stacks, trust logo bars, forced
   three-step explainers, manufactured urgency, shipped lorem ipsum, skeleton
   blocks, template FAQ questions, "most popular" pricing badges, and page title
   or meta description problems.
2. **Style signals:** repeated pill radii, glass blur on several surfaces,
   radial orbs, blue-purple palettes, repeating background lines, oversized
   shadows, and glow clusters. Each signal is counted, not judged from one
   declaration.
3. **Copy:** the visible page text runs through the same twenty-eight copy rules,
   with the matched text marked.

The website rules live in `src/lib/siteRules.ts` and the copy rules in
`src/lib/rules.ts`. The Method section renders both lists from that same data.

## Run it

```sh
npm install
npm run dev        # dev server with the local fetch API on port 5173
```

Then open http://localhost:5173 in a browser. The server checks both loopback
addresses and refuses to start if an old dev server is still holding the port,
rather than running beside a stale app with no fetch API.

Other scripts:

```sh
npm run build      # typecheck and production build
npm start          # serve the build and API on port 4173
npm test           # Vitest: copy rules, site rules, URL guards
npm run lint       # Oxlint
npm run typecheck  # TypeScript only
```

`npm run dev` and `npm start` both run `server.mjs`: Vite middleware in dev, a
static server plus API in production. `npm run preview` is an alias for
`npm start`.

### Deploying

Vercel detects the Vite build and the `api/fetch.js` and `api/css.js`
functions, so live scans work on a Vercel deployment with the same guards. The
functions force private-address blocking off the environment flag and never
read local files.

A purely static host, or plain `vite` without `server.mjs`, has no fetch
endpoint. The Website panel then shows a clear message telling you to run the
local server or deploy the `api/` routes instead of a JSON parse error.

## How the score works

1. Each rule is weighted by severity: high 15, medium 9, low 4, and scaled
   by how often it appears per 100 words. The scale levels off, so
   repeating one phrase costs more than saying it twice, but never without
   limit. A phrase matched by two rules counts once, at the higher
   severity.
2. One hit in a short draft costs far more than the same hit in a long one.
   Drafts under 50 words are scored as if they were 50 words.
3. The penalty decays on a curve: `score = round(100 * e^(-penalty / 55))`.

Seven rule groups look at the shape of the writing rather than its
words: runs of same-length sentences, repeated sentence openings,
sentences stuffed with -ly adverbs, and triplets on autopilot
(structure); sentence-length rhythm, vocabulary range, repeated word
pairs, and transition stacking (diversity); and paragraphs with no
concrete fact, uncited authority claims, and pseudo-wisdom filler
(substance). The diversity thresholds are calibrated on a clean corpus
and stated in [docs/METHOD.md](docs/METHOD.md): burstiness under 0.12,
type-token ratio bands by length, at least 80 words before any of them
fire, and legal and technical text exempt. The em dash counts only at
density — more than 20 pause-dashes per 1,000 words, at least 3 of
them — so ordinary literary prose stays clean.

Before scanning, the draft is normalised. Invisible characters are
stripped, lookalike letters are folded to Latin, and dash and hyphen
variants are unified, so a phrase cannot hide by swapping a character.
Findings still highlight the exact words you pasted.

Verdict bands:

| Score | Verdict |
| --- | --- |
| 90 to 100 | Clean enough |
| 70 to 89 | Mostly clean |
| 45 to 69 | Slop creeping in |
| 20 to 44 | Heavy slop |
| 0 to 19 | Industrial slop |

A number is left alone only with a real citation next to it: a link that
looks like evidence, or a named publication together with a year. A bare
"2024 report" with no outlet named is not a citation, and neither is a
link to a pricing page. The full method, including every rule, its
weight, and its fix, is in [docs/METHOD.md](docs/METHOD.md).

Website findings use the same severity weights and the same decay curve.
Every occurrence of a structure or style signal is counted, and the
penalty for one rule levels off as its occurrences grow, so one noisy
declaration cannot decide a whole page. Style signals together
contribute at most 15 penalty points. Website mode scans only the first
60,000 characters of visible page text.

## Website fetch guards

The API only exists to let the browser read pages it cannot fetch directly.
It is deliberately narrow:

- http and https only, ports 80 and 443 only
- hostnames resolved first; private, loopback, link-local, and reserved
  addresses are rejected
- the connection uses the address that was validated, never a fresh
  lookup, so a hostname whose DNS answer changes mid-fetch cannot
  redirect the request to a private address
- redirects followed manually, at most 3, with the same checks on every hop
- 10 second timeout, 8 MB HTML cap, 2 MB per stylesheet
- at most 5 linked stylesheets per page, including cross-origin CDN styles
- no cookies, no credentials, no stored pages

For local development and tests, `SLOPPY_ALLOW_PRIVATE=1` lifts the private
address and port restrictions for that run only. Never enable it on a shared
machine.

## Demo site

The Website panel has a "Scan the bundled demo site" button. It loads a fixture
from `public/demo-site/`, clearly labeled as a demo, which fails most of the
structure, style, and copy checks. It exists to exercise the analyzer without a
network request.

## Project layout

```
server.mjs             dev and production server entry
server/
  fetch.mjs            fetch guards, redirects, size limits, CSS proxy
  fetch.test.ts        URL guard and CSS tests
api/
  fetch.js             Vercel function for page fetches
  css.js               Vercel function for linked stylesheets
src/
  components/
    Detector.tsx       mode tabs and panel routing
    CopyChecker.tsx    draft input, validation, scan trigger, states
    SiteChecker.tsx    URL input, fetch, stylesheet loading, states
    ResultPanel.tsx    copy score, filters, findings, marked copy
    SiteResultPanel.tsx page facts, structure, style, copy results
    FindingList.tsx    shared finding rows
    Method.tsx         rule ledger, scoring, limits
    Hero.tsx           opening section and spec panel
    Masthead.tsx       wordmark and section navigation
    Footer.tsx         closing statement
  lib/
    analyzer.ts        copy scan loop, density scoring, highlights
    normalize.ts       lookalike, invisible character, and dash folding
    rules.ts           copy rules, lexicons, weights, group metadata
    siteAnalyzer.ts    site scoring and result assembly
    siteRules.ts       DOM and CSS rule implementations
    exampleDraft.ts    deliberately sloppy sample text
    *.test.ts          rule and scoring tests
  index.css            the whole visual system
public/
  demo-site/           labeled fixture page and styles
docs/
  METHOD.md            full rule reference and scoring method
```

## Privacy

Copy mode never leaves the tab. Website mode sends the URL to the app's fetch
route, either the local server or the deployed function, which fetches the page
directly. No analytics, no account, no third-party proxy, and no stored pages.
Analysis always runs in the browser.

## Limits

Copy mode is a pattern matcher, not a critic. It cannot tell whether a sentence
is true, useful, or clear. Only English text is checked: the em dash and
number rules still fire on any text, but the phrases are English. False positives are normal. A common verb can be
flagged even when it is the right word for the sentence, though the common
ones are handled: "Explore the codebase", a compliance claim that links its
audit, and known acronyms such as NASA are left alone. A high score is not
proof of quality, and a low score is not proof of slop. Known gaps, including
ways the fixed list can be worked around, are written down rather than hidden.
See the audit notes in the repository history if they are kept with the project.

Website mode reads a static fetch. It cannot see JavaScript-rendered content,
computed styles, hover states, animation, responsive layout, or any page behind
a login. Style checks count declarations in fetched CSS and inline styles; they
do not know which element a declaration applies to.

## Accessibility

The page targets WCAG AA contrast, uses native buttons and links, keeps
visible focus rings, supports keyboard tabs and filtering, labels the scan
regions with live status roles, and respects `prefers-reduced-motion`.

## Stack

React 19, TypeScript, Vite, Vitest, happy-dom, Oxlint, Tabler icons for a small
set of named glyphs, and Node's built-in HTTP and fetch. No UI framework and no
runtime dependency for the server. The look is a Swiss poster: paper, ink, and
one lime accent, in a fixed light theme.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: keep the rules in one
place, add a test for any new rule, and keep the documentation honest
about what the tool cannot do. A human reads every issue and pull request.
Nothing merges on its own.

## License

Apache License 2.0. See [LICENSE](LICENSE). Copyright 2026 Coldabs.
