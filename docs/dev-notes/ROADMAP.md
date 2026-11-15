# Roadmap implementation — coldabs/sloppy v0.2.0 audit (2026-11-14)

Work in this repository (live main `1cc0e77` + uncommitted UI
redesign). Nothing pushed, deployed, committed, or uploaded. Version stays
`0.2.0`. No new dependencies. Deterministic, zero-LLM, offline throughout.

Full claim-by-claim verification: [AUDIT_VERIFICATION.md](AUDIT_VERIFICATION.md).
Audit spec: [AUDIT.md](AUDIT.md).

## Phase A — verification (before any code changed)

47 claims assessed: **27 CONFIRMED, 16 PARTLY TRUE, 4 REFUTED.**

Headline: the audit is stale, not wrong about its own sources. Its §1 numbers
faithfully report `STRESS3.md` (recounted 124-row table: 18/36, 31/43, 15/15 all
reproduce), but `STRESS3.md` was written against pre-polish P2. The working
copy already contained the F-39–F-56 fixes, so a fresh run of the repo's own
`p2-stress3.test.ts` gave: clean <90 **2/36**, slop =100 **17/43**, paraphrase
=100 **1/15**. Key measurements: 78-word sloppy hero alone 14 → +1,000 clean
words 74 (84.6% penalty dilution); fake citation 34→40 reproduced exactly;
1-word "seamless" → 76. Refuted: "feb missing" (code checks feb), "not just a
fast tool, but…" (already fires), "delving" (already listed), standalone
"Click here"/"Learn more"/"Start now" (already fire), earnings/academic FPs
(already fixed by the reporting-sentence exemption). Patch bugs found: Patch C
never wires `peakWindowDensityFactor` into `analyze()` and steps by 20 vs the
roadmap's 25; Patch D's oklch regex misses hue 310, fuchsia, alpha form, `deg`
suffixes, and shades -950/-100–-300; Patch A omits Teredo; Patch B has a typo
(missing `$`, wrong identifier).

## Stage 1 — SSRF, proxy, base-URL

- `server/fetch.mjs`: exact RFC 5737 /24s (198.51.100.0/24, 203.0.113.0/24;
  the `c` octet had to be destructured — Patch A assumed it existed). IPv6:
  exact `/^fe[89ab][0-9a-f]:/` (fe80::/10) and `/^f[cd][0-9a-f]{2}:/`
  (fc00::/7), fixing the short-group over-match (`fc::1`, `fd::1` no longer
  blocked); NAT64 `64:ff9b::/96`, Teredo `2001::/32` (Patch A omitted it),
  6to4 `2002::/16`, documentation `2001:db8::/32` (old `startsWith` also
  matched `2001:db80::` outside the /32 — fixed).
- `src/lib/siteFetch.ts` (new): `proxyUrl`, `resolveBaseUrl`, `pickFetchMode`
  extracted from the component (fast-refresh lint rule).
- `src/components/SiteChecker.tsx`: safe `resolveBaseUrl` in
  `fetchStylesheets`; new `apiFailed` state — when the API branch fails, the
  UI offers "Use the public proxy" / "Try the API again" instead of locking
  the user out.
- **Deviation from the audit, with live evidence:** the audit's "encode the
  proxy URL" fix is WRONG for this proxy. Live probes (2026-11-14): an
  encoded target is rejected by corsfix with `invalid_url` 400, while the
  plain form proxies fine; via httpbin, `?v=1.2&theme=dark` arrived at the
  target intact — corsfix takes the raw query string after `?` as the target.
  Encoding would have broken every proxy scan. `proxyUrl` stays verbatim,
  with the probe evidence in a code comment and a regression test locking it
  in. The `#section` half is moot (browsers strip fragments before sending).

## Stage 2 — Normalizer

- `src/lib/normalize.ts`: new `isUriOrCompoundSeparator` guard — `.`/`/` stay
  intact in domains, file paths, multi-segment paths, and 16 known slash
  conjunctions (and/or, input/output, client/server, true/false, …), plus
  TLD/extension detection. Genuine obfuscation separators still fold.
  Deliberate trade-off, documented in code: `less` is NOT in the extension
  list because it collides with the `seam.less` evasion.
- One sentence updated in `docs/METHOD.md`.

## Stage 3 — Scoring (src/lib/analyzer.ts)

- 100-word sliding window, step **25** (not Patch C's 20), blend
  0.35 global / 0.65 peak, wired into the actual per-rule penalty computation
  (Patch C never wired it in). Final partial window is evaluated; matches
  count in every window they overlap (straddling matches never dropped).
- Adaptive floor: `min(50, max(12, round(words × 2.2)))` — 1 word → 12,
  23 words → 50. **"seamless" now scores 48, not 76.**
- Co-occurrence multiplier **1.25×** when 3+ distinct phrase-level groups fire
  in the same sentence (document-level rules excluded). `Analysis` gains a
  `cooccurrenceBoost` field.
- Measured: dilution (49-word hero) penalty 133.53 → 61.27, score 9 → padded
  **79 → 33** (dilution 90.3% → 54.1%; residual is the 0.35 global weight
  plus the hero not filling its peak window — inherent to the design). Pure
  added-words fake-citation form **34 → 34** (identical penalty/findings).
- **Caveat:** the literal fake-citation pair reads 31 → 40 (was 34 → 40).
  The rise is the adaptive floor growing 44 → 50 across the pair plus one
  unsourced-number hit cleared by the existing citation logic — and the
  audit's mechanism claim was wrong for this pair all along: under the old
  flat floor `effectiveWords` was 50 for both versions, so the old rise was
  the cleared hit alone, never dilution. Making the literal pair flat would
  require changing the floor formula itself — not done.
- One regression to know: B20 ("Best day ever!!!") 89 → 72 — the intended
  floor trade-off on a 3-word human exclamation.
- Docs: `docs/METHOD.md`, `README.md`; dated addenda in `STRESS3.md` and
  `HEAD-TO-HEAD.md` (historical tables untouched).

## Stage 4 — Rules (src/lib/rules.ts → src/lib/rules/)

- Split (verified behaviour-neutral first: 277 tests green, STRESS3 output
  byte-identical): voice 700, claims 837, actions 186, format 294, structure
  306, diversity 350, substance 171, common 319 lines. `rules.ts` is now a
  36-line re-export barrel; no importer needed edits.
- `*` wildcards now match **1–3 tokens** (was exactly one); a 4-word gap
  does not fire.
- Suffixes as explicit listed forms (existing file style): vocabulary
  **165 → 215** distinct terms. `tapestries` fixed (cluster list + lemma
  map); `STYLE_WORD_LEMMA` map stops one stem in three forms satisfying the
  3-distinct cluster alone. Deliberately skipped: inflected `dive into`
  ("diving into the pool" would fire) and `note/notes` (too common).
- MATTR: `low-ttr` uses 100-word moving-average TTR, threshold **0.60**
  (clean 0.65–0.86, repetitive 0.12–0.53; documented calibration in
  `docs/METHOD.md`). Length-invariance proven: PAD filler MATTR 0.759 once vs
  0.758 repeated ×12; raw TTR collapses 0.708 → 0.059.
- Unsourced-number: new `hasHypeContext` gates the `k`/`m`/`b`-suffix branch
  (previously ungated). Existing exemptions still apply first. Hype still
  flags ("We serve 10m users", "10x faster"); financial/academic stays clean
  ("Revenue was $4.2b", "The study enrolled 10m participants").
- Burstiness widened safely: mean cap 16 → 26 plus a 10-sentence minimum run
  (the minimum is what protects C22, 8 PAD sentences, mean 17.8, CV 0.024).
  Uniform 18–24-word cadence now fires.
- **Skipped: generic-CTA** — verification refuted it (standalone CTAs already
  fire). The stale METHOD.md passage claiming they pass clean was corrected.

## Stage 5 — Site rules (src/lib/siteRules.ts)

- DOM-correlated CSS: the stylesheet is parsed into rules (recursing into
  `@media`/`@supports`/`@layer`, skipping print/speech/keyframes/font-face);
  a rule counts only when its selector matches an element in the document.
  Inline `style="…"` counts as used by definition and is counted separately
  (previously it was appended as bare declarations, corrupting the next
  rule's selector). Tailwind utilities counted per element from class
  attributes (variant-prefixed forms included). Total = used-CSS signals +
  DOM uses − utility-definition signals already counted in the DOM, so 40×
  `rounded-full` with one sheet definition counts **40, not 41**. Thresholds
  unchanged. A `:root` custom-property definition is not itself a surface.
- Modern colours for blue-purple-palette: oklch hues 250–330, chroma > 0.02
  (hue exactly 310, fuchsia ~322, alpha form, `deg` suffixes — all Patch D
  misses fixed); hsl hues 215–330; rgb hues; `var(--*)` resolved from used
  rules/`:root`, including `hsl(var(--primary))` bare-channel values; a
  `var()` named for indigo/violet/purple/fuchsia counts even when its
  definition wasn't fetched. DOM purple utilities cover shades 50–950 plus
  bare `bg-indigo`. Deliberate change: glow now requires a *chromatic*
  colour (black shadow-2xl counts as oversized-shadow, not glow).
- deadLinks: the `seen` set is gone — 25× `href="#"` = **25**. threeSteps:
  whole class token `step` or `step`+number only; stepper/step-brother/
  multi-step-form no longer match.
- Caps: all occurrences counted first, then the display list sliced
  (400/400/300); the first shown hit carries the full count. 500 dead links
  → 500 counted, 400 shown.
- `docs/METHOD.md` gained a Website mode section.
- **Known remaining gap: nav menus, cookie banners, and hidden modals are
  still mashed into the copy analysis as if they were prose.** No visibility
  engine was attempted. (`<noscript>` was already excluded — the audit's
  sub-claim there was wrong.)

## Stage 6 — CLI, SARIF, Web Worker

- CLI: `"bin": { "sloppy": "./bin/sloppy.mjs" }` (`private: true`, version
  `0.2.0` untouched). Flags: positional file / `--file`, `--url`, `--stdin`
  (or piped stdin), `--format json|sarif` / `--sarif`, `--threshold <0–100>`
  (default 70), `--help`, `--version`. Exit codes: 0 = score ≥ threshold,
  1 = below threshold, 2 = usage/input/fetch error. JSON (score, verdict,
  counts, findings) and SARIF 2.1.0 (28 copy rules, 49 for a site scan;
  high→error, medium→warning, low→note; score + verdict as run properties;
  site rules prefixed `site/`, location-less with the occurrence count in
  the message). `--url` fetches the page plus up to 5 linked stylesheets.
- TS-lib import: `npm run build` now runs `tsc -b && vite build &&
  node scripts/build-cli.mjs`, bundling `src/lib/cliEntry.ts` →
  `dist/cli/sloppy-lib.mjs` (124 KB) with the already-installed Vite build
  API. Two traps fixed: happy-dom cannot be bundled (stays `external`) and
  Vite replaces `node:fs/promises` with a browser stub (also `external`).
  `cliEntry.ts` registers the DOM globals `analyzeSite` needs from a
  happy-dom `Window`.
- Web Worker: `src/lib/analysisWorker.ts` + `analysisClient.ts`; `CopyChecker`
  and `SiteChecker` call `analyzeCopyAsync` / `analyzeSiteAsync`, with a
  main-thread fallback on worker failure/error/10 s timeout (identical
  result; test seam `setAnalysisWorkerFactory`). `CopyChecker` got a token
  guard so a stale scan can't overwrite a newer result. Real bug found and
  fixed: worker results initially failed `postMessage` with `DataCloneError`
  (groups carry rule `scan`/`penaltyFor`/`detect` functions) — the handler
  now strips them (`cloneableAnalysis` / `cloneableSiteAnalysis`).
- Follow-up from Stage 5: `SiteResultPanel` "Plus N more" now uses
  `occurrences - 1` (500 dead links read "Plus 499 more", not "Plus 399 more").
- Docs: README "Command line" section (install/build, examples, exit-code
  table, GitHub Actions SARIF gating example). `docs/METHOD.md` untouched
  (scoring unchanged). **No new dependency added.**

## Tests

- 241 (baseline) → **371 passing, 20 files**; lint 0; `tsc -b` clean;
  `npm run build` green.
- Added: `server/fetch.test.ts` +3, `src/components/SiteChecker.test.tsx`
  new (11), `src/lib/normalize.test.ts` +7, `src/lib/stage3.test.ts` new
  (15), `src/lib/stage4.test.ts` new (47), `src/lib/stage5.test.ts` new
  (22), `src/lib/stage6.test.ts` new (22),
  `src/components/SiteResultPanel.test.tsx` new (3).
- Touched (all asserting behaviour the audit deliberately changes, none
  weakened to pass): `src/lib/p1.test.ts` (2 scores: 76→52, 64→55),
  `src/lib/fix2.test.ts` (2 scores: 63→29, 76→48),
  `src/lib/p2-stress3.test.ts` (30 bands re-pinned, all harsher, no
  clean-probe band changed), `src/lib/polish.test.ts` (dash-slop 36→34,
  D06 45→53, inventory 165→215), `src/lib/siteAnalyzer.test.ts` and
  `src/lib/fix2-site.test.ts` (fixtures gained used classes so style rules
  fire via DOM correlation; score expectations unchanged).

## Benchmarks — before vs after

STRESS3 (re-run from the repo's own probe set; the `STRESS3.md` table itself
is a pre-polish P2 record and was not rewritten — dated addenda record the
new runs):

| | Audit's STRESS3.md | Phase A fresh run | After all 6 stages |
|---|---|---|---|
| Clean probes < 90 | 18/36 | 2/36 | **2/36** (B10 89, B20 72) |
| Slop probes = 100 | 31/43 | 17/43 | **17/43** (same set) |
| Paraphrase = 100 | 15/15 | 1/15 (C28) | **1/15** (C28) |

The 17 silent slop probes are threshold-boundary/exemption shapes, not
gap/suffix shapes — Stages 3–4 moved scores (6 STRESS3 scores, all harsher
via MATTR; no band changed) but did not move the silent set. Fixing those
17 needs new rule coverage for threshold-boundary/exemption evasions, which
is a further research round, not a scoring fix.

HEAD-TO-HEAD (all 21 probes re-run by the coordinator at the end): 15
unchanged vs P2, 6 moved — all lower (harsher): repetitive-same-words
39→38, fake-number 34→31, vocab-slop 18→15, dash-slop 36→34, thin-substance
40→37, fake-authority 54→47. No clean probe moved. Fake-citation pair now
reads 31→40.

## What was skipped or adapted (summary)

- Proxy URL encoding: audit prescribed it; live probe proved it breaks
  corsfix — kept verbatim.
- Patch C: step 20 → 25; wired into `analyze()`; final partial window +
  straddling matches fixed.
- Patch D: oklch range extended (310, fuchsia, alpha, `deg`, shades).
- Patch A: Teredo added; `c` octet destructured; short-group over-match fixed.
- Patch B: typo fixed; `resolveBaseUrl` used as written.
- Generic-CTA flagging: skipped (refuted — already fires).
- Text-extraction mashing (nav/cookie/hidden-modal): left as a known gap.
- GitHub About blank: a repo setting, not fixable from code.
- Literal fake-citation pair cannot be flat under the mandated floor formula
  (31→40); the pure added-words form is flat (34→34).

## Verified at the end (coordinator, independent)

- Full suite/lint/typecheck/build run by the coordinator: 20 files,
  **371 passed**, lint 0, tsc clean, build OK. Fresh `dist/` rebuilt.
- Sentinels re-measured: example draft 9 (13 findings), "seamless" 48,
  C28 ("I love this product so much") 100, B20 72.
- CLI smoke-tested: `--version` → sloppy 0.2.0; slop file → 9 "Industrial
  slop", 13 hits; clean file → 100; `--sarif` → valid 2.1.0, 28 rules,
  13 results.
- Real-browser check (headless Chromium via CDP against the built `dist`):
  app loads, example draft loads (58 words), scan renders 9/100 "Industrial
  slop" with findings + marked copy; the `analysisWorker-*.js` chunk is
  requested when the scan runs (worker path proven, not the fallback).
  Screenshots viewed: preview/final-1440-empty.png and
  preview/final-1440-scored.png (not kept in the repository).
  The page is still just the tool (Method section removed, no regression).
- Preview server stopped afterwards. The `sloppy-redesign-preview` artifact
  still hosts the pre-roadmap build (from 21:44) — it needs a rebuild from
  the new `dist/` before the user sees this work.
