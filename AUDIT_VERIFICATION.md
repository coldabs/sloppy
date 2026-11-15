# Audit verification — coldabs/sloppy v0.2.0 audit vs working copy

- **Audit under test:** `AUDIT.md` (pasted 2026-11-14 ~22:25 CET, about sloppy v0.2.0).
- **Code under test:** `~/workspace/sloppy-redesign/` — live `coldabs/sloppy` main at commit
  `1cc0e77` plus the uncommitted human-made UI redesign (Method section removed from the
  page; `src/index.css` 950 lines in the working copy vs 1,963 at HEAD). No code was changed
  during verification; `git status` is identical before/after (only the pre-existing redesign
  modifications). All probes ran through the real code: `vitest run` with probe files in
  `/tmp/verify/` (deleted nothing in the repo), and plain `node` against `server/fetch.mjs`.
- **Headline finding — the audit is stale, not wrong about its own sources.** The audit's
  §1/§3 numbers faithfully report `STRESS3.md` (I recounted its 124-row table: 18/36,
  31/43, 15/15 all reproduce exactly). But `STRESS3.md` was written against pre-polish P2
  (HEAD `a01fad0` + uncommitted P2), while the working copy contains commit `ab4bece`
  ("P2 polished: 28 rules, diversity + substance, vocab 165, fixes F-39–F-56", 2026-11-14
  13:09). Re-running the repo's own `src/lib/p2-stress3.test.ts` (4/4 pass) gives very
  different scores: clean probes below 90 are **2/36, not 18/36**; slop probes scoring 100
  are **17/43, not 31/43**; paraphrase probes scoring 100 are **1/15, not 15/15**. The test
  passes because it asserts focus-rule fired/silent, not the `STRESS3.md` scores — so
  `STRESS3.md`'s table no longer matches a fresh run of its own test file. Verdicts below
  are against the **current working-copy code**, with a note wherever the audit was true
  of the STRESS3 snapshot but no longer true of the code.

## Verdict counts

47 substantive claims assessed: **27 CONFIRMED, 16 PARTLY TRUE, 4 REFUTED**.

| Section | CONFIRMED | PARTLY TRUE | REFUTED |
|---|---|---|---|
| §1 Executive verdict | 6 | 7 | 0 |
| §2 Scoring math | 5 | 1 | 0 |
| §3 Normalizer & copy rules | 2 | 2 | 3 |
| §4 Website analyzer | 6 | 2 | 0 |
| §5 Backend / security / frontend | 7 | 1 | 1 |
| §8 Drop-in patches | 1 | 3 | 0 |
| **Total** | **27** | **16** | **4** |

---

## §1 — Executive verdict

### 1.1 "Clean zero-dependency server primitives in server.mjs" — PARTLY TRUE
- `server/fetch.mjs:1-4` imports only Node builtins (`node:dns/promises`, `node:http`,
  `node:https`, `node:net`) — the fetch primitives are zero-dependency. But `server.mjs:7`
  imports `vite` (`createServer as createViteServer`) for dev middleware, so the server
  entry point as a whole is not zero-dependency.

### 1.2 "DNS-rebinding protection via IP pinning in server/fetch.mjs (lookupPinned preserving TLS SNI)" — CONFIRMED
- `server/fetch.mjs`: `resolveTarget` validates once and returns pinned `addresses`;
  `request()` passes `lookup: lookupPinned`, which answers only from the validated pool,
  and `lib.request(url, …)` keeps the hostname in the URL so TLS SNI/verification still
  uses the hostname. Redirect hops re-validate (`follow()`, every hop calls
  `resolveTarget` again).

### 1.3 "Index-preserving homoglyph/zero-width normalizer in src/lib/normalize.ts" — CONFIRMED
- `normalize.ts:145` `UNDERSCORE_PLACEHOLDER = '\uE000'`; the `map` array maps every
  normalised character back to its original index (header comment + `map.push`,
  `normalize.ts:280-283`). Zero-width stripping, homoglyph folding and NFKD folding all
  preserve the map.

### 1.4 "Unusually honest self-benchmarking in HEAD-TO-HEAD.md and STRESS3.md" — CONFIRMED
- `STRESS3.md`'s table recounts exactly (see 1.6–1.8 below); `HEAD-TO-HEAD.md`'s
  fake-number 34 → fake-citation 40 re-measures exactly (see §2.2).

### 1.5 "18 out of 36 clean human probes scored below 90" (50% false-positive rate) — PARTLY TRUE (true of STRESS3.md, false of current code)
- **Recount from `STRESS3.md`'s own table (124 rows):** B01–B36 = 36 probes; scripted
  count of scores < 90 is **18/36**. Academic 54 (B01) and earnings 63 (B08) are in
  the table as claimed.
- **Re-run through the real `analyze()`** (`npx vitest run src/lib/p2-stress3.test.ts`,
  2026-11-14): only **2/36** score below 90 — B10 (89, same-length-sentences) and B20
  (89, hype-punctuation). B01, B07, B08 now score **100**. The polish commit fixed
  F-39–F-42 (clustered ai-tells, reporting-sentence exemption, selling-context, price-free).

### 1.6 "31 out of 43 slop probes scored a pristine 100" (72% false-negative rate) — PARTLY TRUE (true of STRESS3.md, false of current code)
- **Recount from `STRESS3.md`'s table:** C-probes = 43 (C01–C42 plus C13a/C13b); scores
  of exactly 100: **31**. 31/43 = 72.1% — the arithmetic is right.
- **Re-run:** **17/43** score 100 (C12, C14–C18, C24–C28, C34–C37, C41, C42).

### 1.7 "15 of 15 paraphrase probes … completely bypassed" — PARTLY TRUE (true of STRESS3.md, false of current code)
- **Recount:** the F-51 set (C02–C07, C28–C33, C38–C40) is 15/15 at 100 in `STRESS3.md`.
- **Re-run:** **1/15** scores 100 — only C28 ("I love this product so much",
  testimonial-cliche still silent). The other 14 now fire their focus rule (e.g. C02–C05
  buzzwords 76; C06/C07 overused-opener 89; C38/C39 unsourced-number 76; C40 63).

### 1.8 "14 of 14 threshold-boundary probes completely bypassed" — PARTLY TRUE
- The F-49 set is C11, C12, C13a, C14–C24 (14 probes). In `STRESS3.md` all 14 have their
  **focus rule silent** — but only **9/14** actually scored 100; the other five scored
  < 100 via *other* (noise) rules (C19 89, C20 63, C21 78, C22 95, C23 85). So "completely
  bypassed" holds for the focus rule, not for the score.
- **Re-run:** **12/14** focus-silent. C19 (pseudo-wisdom) and C20 (transition-stacking)
  now **fire** — the polish changed both thresholds to inclusive (exactly 1/3 and exactly
  1/2 now fire). C19 scores 72, C20 scores 81.

### 1.9 "Blank GitHub 'About' description on coldabs/sloppy" — CONFIRMED (observed live; repo setting, not code)
- Fetched `https://github.com/coldabs/sloppy` (crawled 2026-11-14 21:33 UTC, HEAD
  `1cc0e77`, 1 star): the Repository details section lists visibility, branch, commits,
  stars, license, topics (`ai`, `algorithms`, `artificial-intelligence`, `slop-detector`,
  `slopware`, `website-checker`) — **no description field anywhere on the page**. The
  README's first line ("A local pattern checker…") is README text, not the About
  description. Caveat: this is a page-text crawl, not a GitHub API read; and the fix is a
  repo setting, not a code change — nothing in the repo can fix it.

### 1.10 "Unmodularized 2,839-line regex monolith in src/lib/rules.ts" — CONFIRMED (count) / PARTLY TRUE (characterisation)
- `wc -l src/lib/rules.ts` = **2,839** — exact. It is a single file, unmodularized.
  "Regex monolith" overstates it: the file also holds phrase lists, sentence/paragraph
  span logic, token counting, citation logic and per-rule procedural scans — not regex
  alone.

### 1.11 "1,963-line global stylesheet in src/index.css" — CONFIRMED (at HEAD); already addressed in the working copy
- `git show HEAD:src/index.css | wc -l` = **1,963**. Working copy: `wc -l src/index.css`
  = **950** (the UI redesign trim). The audit's number describes live main pre-redesign;
  the redesign already addressed it.

### 1.12 "Documentation drift: STRESS3.md notes tiered vocabulary is 152 rather than the claimed 153" — PARTLY TRUE
- `STRESS3.md:16,168,246-248` does record **152** (64 buzzwords + 50 ai-tells +
  13 ai-adjectives + 25 tier-3 style words, 0 duplicates) vs "the brief said 153".
- But **"153" appears nowhere in the repo** (no `.md`/`.ts`/`.tsx` outside `STRESS3.md`
  and `AUDIT.md` itself) — it was a task-brief number, not a repo claim. And the current
  code measures **165 distinct** (the inventory test in `p2-stress3.test.ts` prints
  `vocab distinct: 165, cliche distinct: 129` on re-run; `docs/METHOD.md:231` says "The
  vocabulary union is 165"). The 152 figure is stale: the polish added phrases after
  STRESS3 was written. Clichés likewise measure 129 now, not STRESS3's 123.

---

## §2 — Scoring math (`src/lib/analyzer.ts`)

### 2.1 Constants and formula — CONFIRMED
- `analyzer.ts:52` `SCORE_DECAY = 55`; `:72` `DENSITY_FLOOR_WORDS = 50`; `:73`
  `DENSITY_SATURATION = 10`; `:76-78` `effectiveWords = Math.max(words, 50)`,
  `per100 = (hits × 100) / effectiveWords`, `densityFactor = per100 / (1 + per100 / 10)`;
  `:93-95` `scoreFromPenalty = round(100 · e^(−penalty / 55))`; severity weights
  `rules.ts:37-41` high 15 / medium 9 / low 4. All exactly as the audit states.
  `densityFactor(1, 50) = 1.667` measured.

### 2.2 Flaw 1 — Global density-dilution exploit (>75%) — CONFIRMED (measured)
- **78-word sloppy hero** (revolutionary / AI-powered / military-grade encryption /
  next-generation / supercharge / leverage synergies / seamless / cutting-edge /
  groundbreaking / trusted by thousands / world-class / changes the game):
  alone **score 14, penalty 108.43, 22 hits** (buzzwords 18, trust-claim 1,
  social-proof 1, generic-cta 2).
  With **1,000 varied clean words appended** (seeded word-salad prose, clean alone
  scores 99): **score 74, penalty 16.72, same 22 hits**. Penalty fell **84.6%**
  (108.43 → 16.72); score rose 14 → 74. Audit's ">75%" holds.
- Shorter check, 26-word hero: alone 21 (penalty 85) → +1,000 clean words 84
  (penalty 9.73). The audit's hero text was only sketched ("Revolutionary AI-powered
  military-grade encryption…"), so no exact-text replication was possible; the shape
  (80-word hero + 1,000 clean words) was reproduced.
- `SITE_TEXT_LIMIT = 60000` confirmed (`siteAnalyzer.ts:84`).
- **Fake citation 34 → 40 — CONFIRMED exactly.** Measured with the `HEAD-TO-HEAD.md`
  probe texts: base `Our platform delivers 99.9% uptime and serves 10,000 happy users.
  We grew 500% last year and our accuracy is 99%.` → **34, penalty 58.75**; + fake
  citation (`…, according to a 2024 report. See https://example.com/pricing for
  details.`, +9 words) → **40, penalty 50.71**, trust-claim + unsourced-number still
  firing. Dilution only, no flag cleared — exactly as the audit and `HEAD-TO-HEAD.md`
  say.

### 2.3 Flaw 2 — 50-word floor absurdity — PARTLY TRUE
- Floor mechanism confirmed (`analyzer.ts:76`). Measured: **"seamless" (1 word) → 76,
  penalty 15** (1 medium hit × 1.667), exactly as the audit/`METHOD.md` say.
- **"A 6-word AI hero tagline … score of 76" holds only for a one-hit tagline.**
  Measured: 6-word 1-hit tagline ("Our seamless platform launches today now") → **76**;
  6-word 3-hit tagline ("Revolutionary AI-powered seamless platform unleashed today")
  → **54, penalty 33.75**. The audit's phrasing implies any 6-word tagline gets 76;
  the score depends on hit count.

### 2.4 Flaw 3 — Naive span-containment deduplication — CONFIRMED (code-level)
- `analyzer.ts` dedup (ordered by severity, then rule order): a match is dropped only
  when a kept match starts at or before it **and** `item.end <= other.end` **and**
  `severityRank[other] <= severityRank[item]` — i.e. full containment at equal-or-worse
  severity only. For the audit's example, spans [10,25] and [20,35]: neither contains
  the other (`35 <= 25` is false), so **both are kept and both count**. Document-level
  groups (structure/diversity/substance) are exempt from dedup entirely
  (`DOCUMENT_GROUPS`, `analyzer.ts`).
- Penalty is a plain linear sum across rules (`penalty += …` per rule); there is no
  joint-probability/co-occurrence boost — confirmed by code reading.
- Honest limit: I could not construct a natural two-rule **partial-overlap** probe from
  the actual phrase lists (they rarely produce partial overlaps — most shared phrases
  are identical spans, which dedup does handle), so the double-count is proven from the
  condition, not from a behavioural probe.

### 2.5 Flaw 4 — Uncalibrated statistical thresholds — CONFIRMED
- Burstiness: `rules.ts:253-256` `BURSTINESS_THRESHOLD = 0.12`,
  `BURSTINESS_MIN_SENTENCES = 8`, `BURSTINESS_MIN_WORDS = 80`,
  `BURSTINESS_MAX_MEAN_LENGTH = 16`; `burstinessOf` uses population standard deviation
  (`/ sentences`, `rules.ts:264-279`); `burstinessScan` (`rules.ts:2277-2290`) returns
  `[]` when `mean >= 16`.
- Measured: 10 uniform sentences at **mean 18.0 words** → **burstiness silent**
  (score still 41 via same-length-sentences / repeated-openings / low-ttr /
  repeated-bigrams — the other rules catch the repetition, burstiness itself does not).
  10 uniform sentences at **mean 13 words** → **burstiness fires** (score 33).
  The audit's GPT-4o/Claude 18–24-word cadence escapes burstiness exactly as claimed.
- Low-TTR cliffs: `rules.ts:283-284` `ttrBandFor = words < 200 ? 0.45 : words < 500 ?
  0.40 : 0.35`; `rules.ts:286` `TTR_MIN_WORDS = 80` — exactly as claimed. No MATTR or
  Herdan's C anywhere in `src/`, `server/`, `docs/` or `README.md` (grep: no hits).

---

## §3 — Normalizer & copy rules (`src/lib/normalize.ts`, `src/lib/rules.ts`)

### 3.1 '.'/'/' between two letters becomes U+E000 — CONFIRMED (behaviour); "corruption" framing PARTLY TRUE
- `normalize.ts:266-275`: `(mapped === '.' || mapped === '/') &&
  isLetter(effectivePrev) && isLetter(effectiveNext)` → `UNDERSCORE_PLACEHOLDER`
  (`\uE000`, `normalize.ts:145`). Measured via `normalizeForScan`:
  - `nextjs.org` → `nextjsorg` (`…73 e000 6f…`), `github.com/coldabs/sloppy` →
    `githubcomcoldabssloppy`, `src/lib/rules.ts` → `srclibrulests`,
    `and/or` → `andor`, `client/server` → `clientserver`, `input/output` →
    `inputoutput`, `seam.less` → `seamless`; `v2.0` and `1.5` untouched (digits
    either side). `AI_powered` → `AIpowered`.
  - `phraseSource` (`rules.ts:91-104`) joins phrase words with
    `[\s\-\u2014\uE000]+`, so U+E000 counts as a separator — confirmed.
- Framing caveat: the code **documents** `and/or` splitting as intended
  (`normalize.ts` comment: "and/or scans as two ordinary words"), and it is the same
  mechanism that closes the `seam.less` evasion. The audit demonstrates the mutation
  but no false positive caused by a split domain/path — none was found in probing.

### 3.2 Phrase wildcard `*` matches only a single token — CONFIRMED
- `rules.ts:97`: `*` → `[^\s\-\u2014\uE000]+`. Measured on `unlock your * potential`
  (ai-tells): "Unlock your full potential…" → **76, ai-tells fires**; "Unlock your
  full **true** potential…" → **100, silent**; three-word gap → **100, silent**.

### 3.3 "Not just a fast tool, but…" breaks detection — REFUTED
- Measured: "This is not just **a fast tool**, but a complete platform for teams." →
  **89, not-just fires**; "This is not just fast, but…" → **89, fires**. The audit's
  mechanism is wrong for this rule: `not-just` does not use `phraseSource` at all —
  it has its own sentence-scoped regex
  (`rules.ts:1373-1390`, `/\bnot\s+(?:just|only)\b[\s\S]*?\b(?:but|yet|…)\b/`),
  which allows an arbitrarily long clause between setup and twist.

### 3.4 Inflection gaps: "delving" vs "delve" — REFUTED; "tapestries" vs "tapestry" — CONFIRMED
- **Delving:** `AI_TELL_PHRASES` lists `delve / delves / delving / delved` explicitly
  (`docs/METHOD.md` ai-tells row). Measured in a 4-cluster context (furthermore +
  moreover + in conclusion + delving): **48, ai-tells fires (4 hits)** — delving is
  caught.
- **Tapestries:** only singular `tapestry` is listed. Same 4-cluster context with
  `tapestry` → **48, fires**; with `tapestries` → **100, silent** (only 3 distinct
  clustered tells, below the 4 minimum). The plural gap is real. Note both probes
  only fire inside a 4-distinct cluster — a lone "delve"/"tapestry" scores 100 by
  design (clustered tells, `rules.ts:2101-2170`).

### 3.5 Generic-CTA blindness ("Click here", "Learn more", "Start now" pass) — REFUTED
- Measured standalone: "Click here." → **76, generic-cta fires**; "Learn more." →
  **76**; "Start now." → **76**. A sentence containing all three → **54** (3 hits).
- They pass only in the documented exemptions: pointing at documentation ("Click here
  to read the documentation." → **100**; "Learn more in the documentation." → **100**)
  or on a heading line (`genericCta`, `rules.ts:1421-1500`). `docs/METHOD.md` Limits
  still claims these pass ("documented here, not claimed as fixed") — **that METHOD.md
  passage is stale**, not the code.

### 3.6 Unsourced-number carve-outs and earnings/academic false positives — PARTLY TRUE (constants right, conclusion stale)
- Constants confirmed: `rules.ts:319` `CITATION_WINDOW = 40`; `:442`
  `NAMED_CITATION_WINDOW = 60`; evidence-link test requires an evidence path word
  (`EVIDENCE_PATH_WORD`) or evidence wording nearby.
- **But the audit's account of the rule is incomplete and its conclusion is stale.**
  The current code also has: a **reporting-sentence exemption** (`isReportingSentence`,
  `rules.ts`: reporting subjects unemployment/revenue/inflation/… + change verbs —
  percentages in such sentences are data, not claims); a **selling-context**
  requirement for bare/spelled numbers (`hasSellingContext`); and a **price-free**
  exemption (`isPriceFree`, "100% FREE"). Measured on the STRESS3 probes: B07
  ("Unemployment increased 2%…") → **100** (was 76); B08 ("Revenue grew 12%… $4.2
  billion") → **100** (was 63); B01 academic → **100** (was 54); C26 ("100% FREE…")
  → **100** (was 76); B36 ("Over a thousand companies…") → **100** (was 76).
- The audit also omits the **sentence-based** citation exemption: an evidence link in
  the *next* sentence clears a number even beyond 40 chars (`hasEvidenceLink`,
  `rules.ts`). Measured: C42 ("We grew 500% last year. The full details are in the
  report at https://example.com/reports/survey-2024…") → **100** (STRESS3.md recorded
  76). The 40-char window is not the whole story.
- What survives of the audit's point: the claim-noun window is 10 words
  (`hasClaimNounAfter`, "10,000 of the most loyal and dedicated and long-standing
  users" — C38 — now fires at 76, fixed since STRESS3), and the spelled-percent
  pattern now accepts hyphens ("five-hundred percent" — C39 — now fires at 76).

---

## §4 — Website analyzer (`src/lib/siteAnalyzer.ts`, `src/lib/siteRules.ts`)

All §4 probes ran `analyzeSite()` in happy-dom on small built pages. (Scores below
include noise from my minimal pages — e.g. missing meta description — the rule
presence/absence is what was measured.)

### 4.1 Tailwind utilities miss pillRadius / glassSurfaces — CONFIRMED
- Page with **40 elements** `class="rounded-full backdrop-blur-md bg-indigo-600
  shadow-2xl"` and a Tailwind-style stylesheet with **one** declaration per utility
  (`.rounded-full{border-radius:calc(infinity * 1px)}`,
  `.backdrop-blur-md{backdrop-filter:blur(12px)}`, `.bg-indigo-600{…#4f46e5}`,
  `.shadow-2xl{box-shadow:0 25px 50px -12px …}`): **pillRadius silent, glassSurfaces
  silent** (1 declaration each, thresholds are ≥3 — `siteRules.ts` pillRadius /
  glassSurfaces). The `calc(infinity * 1px)` form is additionally not matched by the
  pill regex (`/(?:^|\s)(?:\d{3,}px|[6-9]\d*rem|\d{2,}em)/`).
- Control: the same page with 3 raw `border-radius: 9999px/999px/1000px` declarations
  + 3 `backdrop-filter` declarations → **pill-radius x3, glass-surfaces x3 fire**.

### 4.2 bluePurplePalette bypassed "100% of the time" by oklch / hsl(var(--primary)) — PARTLY TRUE
- The value formats themselves bypass: CSS with only `oklch(0.585 0.233 277.117)`,
  `oklch(0.606 0.25 292.717)`, `hsl(var(--primary))`, `oklch(0.627 0.265 303.9)` →
  **blue-purple-palette silent** (measured). The 10 hardcoded hexes
  (`#6366f1, #818cf8, #7c3aed, #8b5cf6, #a855f7, #6d28d9, #4f46e5, #9333ea, #2563eb,
  #3b82f6` — exactly 10, `siteRules.ts` bluePurplePalette) and the literal words
  `indigo|violet|purple` are the only checks — confirmed.
- But "100% of the time" is overstated: the name regex scans the **whole CSS text,
  including selectors**, so a real Tailwind sheet trips it via class names. In the
  40-element probe above, blue-purple-palette **fired x2** — 1× hex `#4f46e5` + 1× the
  word `indigo` in the selector `.bg-indigo-600`. A pure-oklch Tailwind sheet with two
  indigo/violet/purple utility classes would likewise fire. The bypass holds when the
  colour words occur fewer than twice in the CSS (e.g. CSS-variable palettes).

### 4.3 Commented-out / @media print / dead CSS false positives — CONFIRMED
- `siteAnalyzer.ts` only strips `/* … */` comments, then concatenates all collected
  + linked CSS and hands it to `siteRules.ts` with no DOM correlation.
  Measured: stylesheet of **three unused classes** with `border-radius: 9999px/999px/
  1000px` **plus one rule inside `@media print`** → **pill-radius x4 fires** on a
  page that uses none of those classes. The declarations regex
  (`siteRules.ts: declarations()`, `(?:^|[;{])\s*property\s*:\s*([^;}]+)`) matches
  inside `@media` blocks — confirmed.

### 4.4 Caps 400 / 400 / 300 — CONFIRMED
- Code: `deadLinks` slices links at 400, `unnamedControls` at 400, `missingAlt` at 300
  (`siteRules.ts:90,122,136`). Measured with 500 distinct dead anchors + 500 images
  without alt: **dead-link hits = 400, missing-alt hits = 300** (stats deadLinks 400,
  missingAlt 300, score 1). `unnamedControls` cap confirmed by code only (not probed
  behaviourally).

### 4.5 deadLinks dedupes by raw href — 25× href="#" counts once — CONFIRMED
- Measured: 25 footer/nav links all `href="#"` → **dead-link x1, stats.deadLinks = 1**
  (score 32, dominated by that + heading/meta noise). `siteRules.ts: deadLinks` keeps
  a `seen` set of raw href strings.

### 4.6 threeSteps falsely matches stepper / step-brother / multi-step-form — CONFIRMED
- Measured: section headed "How it works" containing three divs with classes
  `stepper-item`, `step-brother`, `multi-step-form` (no real steps) →
  **three-step fires x3**. Selector is `[class*="step"], [class*="Step"]`
  (`siteRules.ts:226`).

### 4.7 SITE_TEXT_LIMIT = 60000 truncation — CONFIRMED
- `siteAnalyzer.ts:84` `SITE_TEXT_LIMIT = 60000`; `:97` slices the text; `:152`
  `textTruncated` flag. Measured on a ~350k-char page: **textTruncated = true**.

### 4.8 body.textContent mashes nav / cookie banners / modals / noscript into copy — PARTLY TRUE
- `visibleText` (`siteRules.ts`) removes only `script, style, noscript, template, svg,
  canvas, iframe` from a body clone, then collapses `textContent`. Measured:
  **nav text INCLUDED, cookie-banner text INCLUDED, hidden modal text (`display:none`)
  INCLUDED** in `copyText`; **`<noscript>` text NOT included** — the audit's noscript
  sub-claim is wrong. So: nav/cookie/modal mashing confirmed, noscript refuted.

### 4.9 "5 files × 2 MB = 10 MB" CSS bundle — CONFIRMED (constants)
- `SiteChecker.tsx:6` `MAX_STYLESHEETS = 5` (3 in proxy mode); `server/fetch.mjs`
  `MAX_CSS_BYTES = 2 * 1024 * 1024`. Concatenation confirmed in `siteAnalyzer.ts`
  (`stripComments([collectCss(doc), ...stylesheets].join('\n'))`).

---

## §5 — Backend, security & frontend (`server/fetch.mjs`, `src/components/SiteChecker.tsx`)

### 5.1 Unguarded `new URL(baseHref, page)` — PARTLY TRUE
- Confirmed as written: `SiteChecker.tsx:66`
  `const base = baseHref ? new URL(baseHref, page) : page` sits **outside** a
  try/catch; the try/catch below it (`:72`) covers only the stylesheet-href loop.
  A malformed `<base href="http://[invalid">` would throw a TypeError here.
- But "throws an **uncaught** TypeError and aborts the entire scan" overstates it:
  `fetchStylesheets` is called inside `scan()`'s outer try/catch (`SiteChecker.tsx:185`,
  with the proxy/api branches calling it inside that block), so the throw is caught
  there — the app does not crash; instead the **whole scan fails with an error status**
  (no partial result, no fallback to scanning without stylesheets). The local
  guard is still missing; the consequence is a failed scan, not an uncaught crash.
  (Not executed in a live browser — subagents have no live browser; verdict rests on
  code reading.)

### 5.2 Unencoded proxy URL — CONFIRMED
- `SiteChecker.tsx:14`: `const proxyUrl = (target: string) =>
  \`${PROXY_PREFIX}${target}\`` — no `encodeURIComponent`. The API branch does encode
  (`/api/css?url=${encodeURIComponent(href)}`, `/api/fetch?url=${encodeURIComponent(
  target)}`); the proxy branch does not, for both page and stylesheet URLs
  (`:92`, `:214`). A target containing `?v=1.2&theme=dark` or `#section` therefore
  lands after `https://proxy.corsfix.com/?` with `&`/`#` intact. Whether corsfix
  misparses that server-side was **not verified** (no request to the proxy was made);
  the client-side construction is unencoded as claimed.

### 5.3 Successful /api/health locks the fallback out permanently — CONFIRMED
- `SiteChecker.tsx`: health is checked **once on mount** (useEffect, no re-check);
  `scan()` picks `mode = apiState === 'ok' ? 'api' : proxyConsent === 'granted' ?
  'proxy' : null` (`:159`); the proxy-consent UI renders only when
  `apiState === 'missing'`. If `/api/fetch` then fails (timeout/rate-limit), the catch
  sets an error and there is no path to the proxy without reloading (and the health
  check would still say ok). No retry, no mode switch.

### 5.4 IPv4 over-blocking: 198.51.0.0/16 and 203.0.0.0/16 — CONFIRMED (measured, 36 cases)
- `server/fetch.mjs:38`: `if (a === 198 && (b === 18 || b === 19 || b === 51)) return
  true;` — blocks all of 198.51.0.0/16. Measured via `isPrivateAddress`:
  `198.51.100.1` blocked (correct, TEST-NET-2) but `198.51.0.1`, `198.51.101.1`,
  `198.51.200.1` also blocked — public addresses.
- `server/fetch.mjs:39`: `if (a === 203 && b === 0) return true;` — blocks all of
  203.0.0.0/16. Measured: `203.0.113.1` blocked (correct, TEST-NET-3) but `203.0.0.1`
  and `203.0.200.1` also blocked. (The /16 figures are 65,536 addresses each, as the
  audit says.) The same file's `192.0.0.0/16` block (`a === 192 && b === 0`) is
  likewise broader than RFC 5737's two /24s — noted, not in the audit.
- `api/fetch.js`, `api/css.js`, `netlify/functions/fetch.mjs`, `netlify/functions/css.mjs`
  and `server.mjs` all import `fetchPage`/`fetchCss` from `server/fetch.mjs`, so the
  one guard is shared — the flaw (and any fix) applies everywhere.

### 5.5 IPv6: "feb missing" — REFUTED (parent's spot-check confirmed independently)
- `server/fetch.mjs:50`: `value.startsWith('fe80') || value.startsWith('fe8') ||
  value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')`.
  Measured: `fe80::1`, `fe8f::1`, `fe9a::1`, `fea0::1`, **`feb0::1`, `febf::1`** all
  blocked; `fec0::1` and `fe00::1` correctly not blocked. fe80::/10 (fe80–febf) is
  fully covered; the audit's "missing feb0::/12" is wrong.

### 5.6 IPv6: NAT64, Teredo, 6to4 gaps — CONFIRMED (measured)
- `64:ff9b::127.0.0.1` and `64:ff9b::8.8.8.8` → **not blocked** (NAT64 64:ff9b::/96
  can encapsulate private IPv4). `2001::1` and a full Teredo address
  `2001:0:4136:e378:8000:63bf:3fff:fdd2` → **not blocked** (Teredo 2001::/32).
  `2002::1` and `2002:808:808::1` → **not blocked** (6to4 2002::/16). No check for
  any of the three exists in `isPrivateAddress`. Correctly blocked for comparison:
  `::1`, `::`, `2001:db8::1`, `ff02::1`, `fc00::1`, `fdff::1`, `::ffff:127.0.0.1`
  (mapped loopback, via recursion); correctly allowed: `8.8.8.8`, `1.1.1.1`,
  `2606:4700:4700::1111`, `::ffff:8.8.8.8`.

### 5.7 Extra finding (not in the audit): current `/^f[cd]/` over-matches
- `server/fetch.mjs:49`: `if (/^f[cd]/.test(value)) return true` is a **textual prefix
  test, not a parsed-group test**, so it blocks any address whose first group merely
  *starts with* `fc`/`fd` as text — including short groups outside fc00::/7:
  measured `fc::1` (0x00fc), `fca::1` (0x0fca), `fd::1` (0x00fd), `fd1::1` (0x0fd1),
  `fc0::1` (0x0fc0) all blocked. Patch A's regex (see §8.3) does not have this flaw.

---

## §6–§7 — Target architecture & roadmap (proposals, not factual claims)

No factual claims to verify; the six-stage roadmap is a plan. Two internal
consistencies matter for §8 and are recorded there: roadmap stage 3 says the sliding
window steps by **25** words (`AUDIT.md` roadmap text) while Patch C's code steps by
**20**; and stage 1 / Patch A omit Teredo (2001::/32) although §5 lists it as a gap.

---

## §8 — The audit's own patches (checked for bugs before use)

### 8.1 Patch C — windowed scoring: step inconsistency CONFIRMED; patch is unwired — PARTLY TRUE
- **Inconsistency confirmed:** roadmap §7 stage 3 says "(step = 25 words)"
  (`AUDIT.md:215`); Patch C's loop is `for (let i = 0; i <= totalWords - WINDOW_WORDS;
  i += 20)` (`AUDIT.md:322`). One of the two numbers is wrong.
- **The patch as pasted does not change scoring.** It defines `adaptiveFloorWords`,
  a new `densityFactor`, and `peakWindowDensityFactor`, but contains **no call site**
  — nothing in the pasted code calls `peakWindowDensityFactor` from `analyze()`, so
  dropping it in would leave scores unchanged. (Also: the loop never evaluates the
  final partial window when `totalWords` is not a multiple of the step, and matches
  straddling a window edge are excluded by `m.start >= winStart && m.end <= winEnd`.)
- The helpers themselves are coherent: `adaptiveFloorWords(1) = 12`, `(5) = 12`,
  `(23) = 50`; `densityFactor(maxHits, 100)` uses effectiveWords 100, so the floor
  does not distort the peak window.

### 8.2 Patch D — Tailwind / oklch detection: hue range mostly right, with edge misses — PARTLY TRUE
- Regex tested in Node against real Tailwind v4 values: `oklch(0.585 0.233 277.117)`
  (indigo-500), `oklch(0.606 0.25 292.717)` (violet-500), `oklch(0.627 0.265 303.9)`
  (purple-500), `oklch(0.623 0.214 259.815)` (blue-500), `oklch(0.511 0.262 276.966)`
  (indigo-600) — **all match**; the 250–310 range covers the indigo/violet/purple/blue
  family.
- **Misses found:** hue exactly `310` does **not** match (`30\d` covers 300–309 only);
  fuchsia `oklch(0.667 0.295 322.15)` does not match (arguably out of scope, but it is
  a purple family colour); the **alpha form** `oklch(0.585 0.233 277.117 / 0.5)` does
  not match (regex requires `)` right after the hue); a `deg` suffix (`277deg`) does
  not match. `oklch(58.5% 0.233 277.117)` does match.
- `domPurpleClasses` (`/\b(?:bg|text|from|via|to|border|ring)-(?:indigo|violet|purple)-
  (?:[4-9]00|50)\b/`) misses shades `-950` and `-100`–`-300`, and bare `bg-indigo`
  with no shade. The `pillRadius` addition (`calc\(infinity`) does match Tailwind v4's
  `calc(infinity * 1px)`. The oklch count still runs over raw CSS, so the dead-CSS
  issue (§4.3) would still apply to it.

### 8.3 Patch A — IPv4/IPv6 SSRF masks: regexes correct, Teredo omitted — PARTLY TRUE
- Tested in Node: `/^fe[89ab][0-9a-f]:/i` matches `fe80::1`, `fe8f::1`, `fe9a::1`,
  `fea0::1`, `feb0::1`, `febf::1` and not `fec0::1`/`fe7f::1` — **covers fe80::/10
  exactly**. `/^f[cd][0-9a-f]{2}:/i` matches `fc00::1`, `fdff::1`, `fd00::1`,
  `fcd0::1` and not `fc::1`/`fca::1`/`fd::1` — **covers fc00::/7 exactly, with no
  over-match** (it requires a full 4-digit group, fixing §5.7). `/^64:ff9b:/i` matches
  `64:ff9b::127.0.0.1`; `/^2002:/i` matches `2002::1`.
- **Gap: Patch A omits Teredo (2001::/32)** although §5 lists it as a bypass — a
  patch applied as written would still leave Teredo open. (2001:db8 is already blocked
  in the current code, so including it is harmless but redundant.)
- Implementation note: the IPv4 lines assume a `c` octet is destructured; the current
  code destructures only `const [a, b] = octets` (`server/fetch.mjs:33`), so the patch
  needs that edit too.

### 8.4 Patch B — base-URL guard & proxy encoding: typo CONFIRMED — PARTLY TRUE (helper right, proxyUrl wrong)
- `AUDIT.md:275`: `` return `PROXYPREFIX{encodeURIComponent(target)}`; `` — **missing
  the `$`** before `{encodeURIComponent(target)}` and using the wrong identifier
  (the code's constant is `PROXY_PREFIX`, `SiteChecker.tsx:7`). As written it returns
  the literal string `PROXYPREFIX{encodeURIComponent(target)}` for every target. The
  same misspelling appears in the §5 prose (`AUDIT.md:162`, `PROXYPREFIX{target}`).
  Correct form: `` return `${PROXY_PREFIX}${encodeURIComponent(target)}`; ``.
- `resolveBaseUrl` in the same patch is correct (try/catch falling back to `pageUrl`).

---

## What I could not verify (and why)

- **The "interactive simulator"** referenced by the audit does not exist (per the task
  brief); all §2 behaviour was verified against the code directly instead.
- **Whether proxy.corsfix.com actually misparses** an unencoded `&`/`#` in the target
  URL (§5.2): no request to the proxy was made; only the client-side construction was
  verified. The audit itself hedges this ("or verify how the proxy parses embedded
  query strings").
- **The malformed-`<base href>` crash in a real browser** (§5.1): subagents have no live
  browser; the verdict rests on code reading (`SiteChecker.tsx:66` vs the `scan()`
  try/catch at `:185`).
- **The GitHub About description via API** (§1.9): verified from a live page-text crawl
  (no description field present, 2026-11-14 21:33 UTC), not from the GitHub API; the
  conclusion is the same either way, but the evidence is crawl-grade.
- **§6/§7 as a design**: the target architecture and roadmap are proposals, not
  checkable claims; only their internal inconsistencies were assessed.
- **A natural partial-overlap dedup probe** (§2.4): proven from the dedup condition in
  code; no two-rule partial overlap was found in the actual phrase lists to demonstrate
  it behaviourally.

## Method note (for reproducibility)

- Re-ran `npx vitest run src/lib/p2-stress3.test.ts` (4/4 pass) and parsed its stdout
  table with a script; recounted `STRESS3.md`'s 124-row table with the same script.
- Copy probes: temporary vitest files in `/tmp/verify/` importing the real
  `src/lib/analyzer`, `src/lib/normalize`, `src/lib/siteAnalyzer` (happy-dom env for
  site probes). Clean filler for dilution probes was seeded pseudo-random word-salad
  (varied vocab/sentence lengths; clean-alone scores 99) so the filler itself would not
  trip diversity rules.
- SSRF probes: plain `node --input-type=module` importing `isPrivateAddress` from
  `server/fetch.mjs` (36 addresses); Patch A/D regexes tested in Node against real
  Tailwind v4 oklch values.
- Line references are to the working copy at commit `1cc0e77` (+ uncommitted redesign).
