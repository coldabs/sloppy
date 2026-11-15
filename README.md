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
- [Command line](#command-line)
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
same data, so the list itself cannot drift from the scanner — the prose
around it still can, and the counts it states are guarded by the checks
in `scripts/check-docs.mjs`.

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
3. **Copy:** the visible page text runs through the same 29 copy rules,
   with the matched text marked.

The website rules live in `src/lib/siteRules.ts` and the copy rules in
`src/lib/rules/` — one module per rule group, re-exported by the
`src/lib/rules.ts` barrel. The Method section renders both lists from that same data.

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
npm run build      # typecheck, production build, and the CLI bundle
npm run build:cli  # the CLI bundle only (dist/cli/sloppy-lib.mjs)
npm start          # serve the build and API on port 4173
npm test           # Vitest: copy rules, site rules, URL guards
npm run lint       # Oxlint
npm run typecheck  # TypeScript only
```

`npm run dev` and `npm start` both run `server.mjs`: Vite middleware in dev, a
static server plus API in production. `npm run preview` is an alias for
`npm start`.

## Command line

The same checker runs from a terminal, for scripts and CI. It needs a
build first, because the analyser is TypeScript and the CLI imports the
bundle that build produces:

```sh
npm install
npm run build
```

Then:

```sh
sloppy draft.txt                              # scan a file, JSON on stdout
cat draft.txt | sloppy                        # or read stdin
sloppy --url https://example.com              # scan a website
sloppy --url https://example.com --sarif      # GitHub Code Scanning SARIF
sloppy --threshold 90 draft.txt               # fail unless the score is 90+
```

`sloppy` is the `bin` entry in `package.json`, so from the repo root
`npx sloppy …` runs it (npm does not symlink a package's own bin into
`node_modules/.bin`, but npx resolves it from `package.json`). The package stays
`private`: the command is for local use and CI, not for publishing.

### Output

JSON is the default. A copy scan reports the score, verdict, counts, and
every finding with its offsets and excerpt; a website scan adds the page
facts, the structure and style groups with occurrence counts, and the
copy findings. `--format sarif` (or `--sarif`) reports the same scan as
SARIF 2.1.0 instead: one result per finding, with the rule list in the
tool driver, `high` as `error`, `medium` as `warning`, `low` as `note`,
line and column for copy findings, and the score as a property of the
run. Site findings have no offsets, so they carry the occurrence count
in the message instead of a location.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The score met the threshold (default 70) |
| 1 | The score fell below the threshold — slop found at this gate |
| 2 | Usage error, unreadable input, or a failed page fetch |

The threshold is the gate: `--threshold 90` passes a draft scoring 90
and fails one scoring 89. A score exactly at the threshold passes.

### CI gating

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 24
- run: npm ci
- run: npm run build
- name: Gate landing-page copy
  run: npx sloppy --threshold 70 --sarif copy/landing.txt > sloppy.sarif
- name: Upload SARIF
  if: always()
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: sloppy.sarif
```

The website scan fetches the page (and up to five linked stylesheets)
from the machine running the command, the same static fetch the
Website panel does. It cannot see JavaScript-rendered content or pages
behind a login, and it sends the URL nowhere else.

### Deploying

Vercel detects the Vite build and the `api/fetch.js`, `api/css.js`, and
`api/health.js` functions. `vercel.json` registers them explicitly and sets the
build output, so a deployment from the repository root includes the fetch API.
The functions force private-address blocking off the environment flag and never
read local files.

After deploying, open `https://your-site/api/health`. It must return
`{"ok":true,"mode":"serverless"}`. If that URL is a 404, the host is not running
the `api/` functions: check that the Vercel Root Directory is the repository
root, the Framework Preset is Vite, and the deployment is not pinned to an older
commit, then redeploy.

A purely static host, or plain `vite` without `server.mjs`, has no fetch
endpoint. The Website panel checks `/api/health` when it opens. When the check
fails, it offers an opt-in public CORS proxy (`proxy.corsfix.com`) so live URL
scans still work on that host. The page URL is sent to that public service, and
the panel says so before the first scan. Turning the proxy off, or running the
app locally, keeps scans private.

The proxy is a fallback, not a replacement for the API. It can be rate-limited,
may fail on sites that block it, and cannot report a redirected final URL. Deploy
a fetch function for reliable, private scanning.

### Netlify

`netlify.toml` builds the Vite app into `dist` and routes `/api/fetch`,
`/api/css`, and `/api/health` to the functions in `netlify/functions/`. Netlify
bundles them with esbuild on Node 22. After deploying, open
`https://your-site/api/health`; it should return
`{"ok":true,"mode":"netlify"}`. When that works the Website panel uses the
functions automatically and does not offer the public proxy.

## How the score works

1. Each rule is weighted by severity: high 15, medium 9, low 4, and scaled
   by how often it appears per 100 words. The scale levels off, so
   repeating one phrase costs more than saying it twice, but never without
   limit. A phrase matched by two rules counts once, at the higher
   severity.
2. One hit in a short draft costs far more than the same hit in a long one.
   Short drafts are scored against an adaptive floor: a draft is
   judged at its own length, down to a minimum of 8 words and capped
   at 50, and a draft under 8 words is too short to score. Density is
   also measured over the worst 100-word sliding window (step 25 words) and
   blended 0.15 global / 0.85 peak, so a sloppy passage cannot be washed out
   by clean filler — and a sentence where three or more distinct rule groups
   fire costs 25% more than the same signals spread out.
3. The penalty decays on a curve: `score = round(100 * e^(-penalty / 55))`.

Three of the seven rule groups look at the shape of the writing rather than its
words: runs of same-length sentences, repeated sentence openings,
sentences stuffed with -ly adverbs, and triplets on autopilot
(structure); sentence-length rhythm, vocabulary range, repeated word
pairs, and transition stacking (diversity); and paragraphs with no
concrete fact, uncited authority claims, and pseudo-wisdom filler
(substance). The other four groups — voice, claims, actions, format —
look at the words themselves. The diversity thresholds are calibrated on a clean corpus
and stated in [docs/METHOD.md](docs/METHOD.md): burstiness under 0.12,
moving-average type-token ratio (MATTR) under 0.60, at least 80 words before any of them
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
bin/
  sloppy.mjs           the `sloppy` command (loads dist/cli/sloppy-lib.mjs)
scripts/
  build-cli.mjs        bundles the CLI from src/lib/cliEntry.ts
server.mjs             dev and production server entry
server/
  fetch.mjs            fetch guards, redirects, size limits, CSS proxy
  fetch.test.ts        URL guard and CSS tests
api/
  fetch.js             Vercel function for page fetches
  css.js               Vercel function for linked stylesheets
  health.js            Vercel function for deployment diagnostics
netlify/
  functions/
    fetch.mjs          Netlify function for page fetches
    css.mjs            Netlify function for linked stylesheets
    health.mjs         Netlify function for deployment diagnostics
netlify.toml           Netlify build, functions, and /api redirects
vercel.json            Vercel build and function configuration
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
    analysisWorker.ts  Web Worker entry: analyze() off the main thread
    analysisClient.ts  worker client with main-thread fallback
    cli.ts             command-line parsing, JSON/SARIF output, exit codes
    cliEntry.ts        CLI bundle entry (DOM shim for analyzeSite in node)
    sarif.ts           SARIF 2.1.0 rendering of an analysis
    normalize.ts       lookalike, invisible character, and dash folding
    rules.ts           copy rules barrel (re-exports the modules below)
    rules/
      actions.ts       call-to-action labels
      claims.ts        numbers and credentials without proof
      common.ts        shared types, weights, and helpers
      diversity.ts     sentence rhythm and vocabulary range
      format.ts        template typographic habits
      structure.ts     cadence, repetition, density
      substance.ts     concrete facts and filler
      voice.ts         hype vocabulary and AI tells
    siteAnalyzer.ts    site scoring and result assembly
    siteRules.ts       DOM and CSS rule implementations
    target.ts          URL normalisation and private-host checks
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
directly. Analysis always runs in the browser — copy and website scans run
in a Web Worker, so a long draft never blocks the page, with the same
analyser running on the main thread if Workers are unavailable. There is no analytics, no account,
and no stored page.

On a static host without the API, live scanning uses a public CORS proxy only
after you choose it. The target URL is sent to `proxy.corsfix.com`, not to us.
Decline the proxy or run the app locally for private scans.

## Limits

Copy mode is a pattern matcher, not a critic. It cannot tell whether a sentence
is true, useful, or clear. Only English text is checked: the em dash and
number rules still fire on any text, but the phrases are English. False positives are normal. A common verb can be
flagged even when it is the right word for the sentence, though the common
ones are handled: "Explore the codebase", a compliance claim that links its
audit, and known acronyms such as NASA are left alone. A high score is not
proof of quality, and a low score is not proof of slop. Known gaps, including
ways the fixed list can be worked around, are written down rather than hidden.

Website mode reads a static fetch. It cannot see JavaScript-rendered content,
computed styles, hover states, animation, responsive layout, or any page behind
a login. Style checks count declarations in fetched CSS and inline styles; each
rule counts only when its selector matches an element in the document. The public-proxy fallback
adds its own limits: it may be rate-limited, can be blocked by the target site,
and does not report the final URL after redirects, so relative assets can miss.

## Accessibility

The page is built for strong contrast, uses native buttons and links, keeps
visible focus rings, supports keyboard tabs and filtering, labels the scan
regions with live status roles, and respects `prefers-reduced-motion`.

## Stack

React 19, TypeScript, Vite, Vitest, happy-dom, Oxlint, Tabler icons for a small
set of named glyphs, Instrument Sans through Fontsource, and Node's built-in HTTP
and fetch. No UI framework and no runtime dependency for the server. The look is
a modern studio system: warm-white canvas, near-black ink, electric cobalt,
rounded surfaces, and one soft elevation tier.

## Visual design

- Electric cobalt is the only accent. A scanner should have one signal color, so
  cobalt marks the score, the primary action, and the active state, and nothing
  else competes with it.
- Warm white and near-black ink keep long rule ledgers readable without the
  sterile all-white look.
- Instrument Sans is self-hosted through Fontsource. Its open shapes and tight
  display weights read as a modern studio tool without the default system-font
  feel.
- Surface radii step from 24px panels to 18px finding cards to 12px controls.
  Controls stay rectangular enough to read as controls, not capsules.
- The limits panel flips to near-black so caveats sit apart from the rules, and
  the cobalt footer closes the page as a brand moment.
- Motion is limited to section entry and hover state changes. Reduced-motion
  users get the same layout with no movement.

The demo fixture keeps its own deliberately dated look, because it exists to be
flagged.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: keep the rules in one
place, add a test for any new rule, and keep the documentation honest
about what the tool cannot do. A human reads every issue and pull request.
Nothing merges on its own.

## License

Apache License 2.0. See [LICENSE](LICENSE). Copyright 2026 Coldabs.
