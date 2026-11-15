# Engineering Audit of coldabs/sloppy (v0.2.0)

Pasted by the user 2026-11-14 ~22:25 CET. This file is the verbatim spec for the
verify-then-implement job. The audit referenced "the interactive simulator above"
— there is no simulator in this chat; verify against the code directly.

---

coldabs/sloppy (v0.2.0) has a respectable premise—a deterministic, zero-LLM,
privacy-first linter for AI-generated copy and template-cloned websites—but under
a rigorous engineering audit, it currently fails at its core mathematical and
detection job. Use the interactive simulator above to inspect its single biggest
mathematical flaw: toggle between Padding Exploit, Hero Slop + Clean Docs, and
Single-Word Floor, or drag the Total Document Word Count slider rightward to watch
how adding clean filler text washes out severe violations in src/lib/analyzer.ts
compared to a dilation-resistant 100-word sliding-window model.

## 1. Executive Verdict: What Actually Works vs. Where It Breaks

Before tearing into the failures, credit where it is earned: the repository
maintains clean zero-dependency server primitives in server.mjs, thoughtful
DNS-rebinding protection via IP pinning in server/fetch.mjs (lookupPinned
preserving TLS SNI while connecting to validated IPs), an index-preserving
homoglyph/zero-width normalizer in src/lib/normalize.ts, and unusually honest
self-benchmarking in HEAD-TO-HEAD.md and STRESS3.md.

That honesty, however, exposes a sobering reality documented right inside your own
STRESS3.md benchmark:

- 50% False-Positive Rate on Clean Human Prose: 18 out of 36 clean human probes
  scored below 90 in STRESS3.md, flagging ordinary academic writing (54),
  Wikipedia-style exposition (62), and routine corporate earnings sentences (63)
  as slop.
- 72% False-Negative Rate on Adversarial Slop: 31 out of 43 slop probes scored a
  pristine 100 in STRESS3.md—15 of 15 paraphrase probes and 14 of 14
  threshold-boundary probes completely bypassed src/lib/rules.ts.
- Self-Inflicted AI-Slop & Codebase Smells: A repository dedicated to fighting slop
  shipped with a blank GitHub "About" description on coldabs/sloppy, an
  unmodularized 2,839-line regex monolith in src/lib/rules.ts, a 1,963-line global
  stylesheet in src/index.css, and documentation drift where STRESS3.md notes your
  tiered vocabulary count is 152 rather than the claimed 153.

## 2. Scoring Math & Algorithmic Audit (src/lib/analyzer.ts)

Your scoring engine in src/lib/analyzer.ts computes rule penalties using a
document-wide word denominator (DENSITY_FLOOR_WORDS = 50, DENSITY_SATURATION = 10,
SCORE_DECAY = 55):

per100 = (hits × 100) / max(words, 50), densityFactor = per100 / (1 + per100 / 10),
Score = round(100 · e^(−penalty / 55))

Flaw 1 — The Global Density-Dilution Exploit: Because densityFactor in
src/lib/analyzer.ts divides hits * 100 by total document words across the entire
payload (up to 60,000 characters in src/lib/siteAnalyzer.ts), an AI-generated SaaS
landing page with an atrocious 80-word hero section ("Revolutionary AI-powered
military-grade encryption...") followed by 1,000 words of clean privacy/terms or
documentation text sees its penalty diluted by more than 75%. Worse, as your own
HEAD-TO-HEAD.md admits, appending a fake unverified citation (fake-number-plus-fake-
citation) increased the cleanliness score from 34 to 40 without clearing a single
violation solely because the extra words inflated effectiveWords.

Flaw 2 — The 50-Word Floor Absurdity: Setting DENSITY_FLOOR_WORDS = 50 in
src/lib/analyzer.ts forces a 1-word draft consisting exclusively of "seamless" (or
a 6-word AI hero tagline) to be evaluated as if 49 clean words surrounded it,
handing a 100% buzzword draft a passing score of 76 ("Mostly clean") as noted in
docs/METHOD.md.

Flaw 3 — Naive Span-Containment Deduplication: In src/lib/analyzer.ts,
dedupeMatches drops a match only when other.start <= item.start && item.end <=
other.end and severityRank[other.rule.severity] <= severityRank[item.rule.severity].
Partial overlaps ([10, 25] and [20, 35]) double-count the overlapping tokens, while
co-occurring signals in the same sentence (e.g., an unsourced-number inside a
not-just frame with a buzzwords adjective) are summed linearly instead of boosting
confidence via joint probability.

Flaw 4 — Uncalibrated Statistical Thresholds: In docs/METHOD.md and
src/lib/rules.ts, burstiness (sigma_pop / mean under 0.12 only when mean < 16
words) misses the classic GPT-4o/Claude cadence where sentences uniformly hover
around 18–24 words with low variance. Meanwhile, low-ttr uses step-function
cliffs at 200 and 500 words (0.45, 0.40, 0.35) instead of a continuous
length-invariant lexical diversity metric like Moving-Average Type-Token Ratio
(MATTR) or Herdan's C = log V / log N.

## 3. Normalizer & Copy Rule Vulnerabilities (src/lib/normalize.ts, src/lib/rules.ts)

Collateral Damage in normalizeForScan ('/' and '.' Corruption): In
src/lib/normalize.ts, any '.' or '/' between two letters
(isLetter(effectivePrev) && isLetter(effectiveNext)) is converted into
UNDERSCORE_PLACEHOLDER (\uE000), and phraseSource in src/lib/rules.ts treats
\uE000 as a word boundary separator alongside whitespace and dashes. This silently
mutates domain names (nextjs.org, github.com/coldabs/sloppy), file paths
(src/lib/rules.ts), and standard English conjunctions (and/or, client/server,
input/output) into space-separated words during scanning.

Brittle Wildcard & Lexical Matching in phraseSource: In src/lib/rules.ts,
phraseSource replaces * with [^\s\-\u2014\uE000]+ (matching strictly a single
token). Inserting a two-word modifier or determiner (e.g., "not just a fast tool,
but..." vs "not just fast, but...") or inflecting a verb ("delving" vs "delve",
"tapestries" vs "tapestry") where explicit stems are omitted breaks detection—
explaining why 15 of 15 paraphrase probes in STRESS3.md sailed through with a
score of 100.

Blindness to Objectless CTAs: As docs/METHOD.md concedes, generic-cta in
src/lib/rules.ts lets standalone "Click here", "Learn more", and "Start now" pass
in several contexts to avoid false positives, missing the most ubiquitous
low-effort CTA pattern on the web.

Hardcoded Financial/Academic False Positives in unsourced-number: Despite
carve-outs in src/lib/rules.ts, any quantitative prose that uses multipliers,
percentages, or round figures without a URL within 40 characters or a
(Publication, YYYY) pattern within 60 characters gets hammered—which is why your
own STRESS3.md earnings and academic probes failed (54 and 63). A single-sentence
press quote or abstract summarizes numbers without inline URLs; treating it
identically to landing-page hype ("10x your workflow!") is a category error.

## 4. Website Analyzer & CSS Parser Audit (src/lib/siteAnalyzer.ts, src/lib/siteRules.ts)

Regex-Based CSS "Parsing" Completely Misses Modern Tailwind & CSS Variables: In
src/lib/siteRules.ts, declarations(css, property) scans raw stylesheet text with a
flat regex ((?:^|[;{}])\s*property\s*:\s*([^;}]+)). It has zero awareness of:

- Tailwind v3/v4 utility classes in HTML: If a page uses Tailwind
  (class="rounded-full backdrop-blur-md bg-indigo-600 shadow-2xl") where
  rounded-full is border-radius: calc(infinity * 1px) or 9999px defined once in the
  atomic stylesheet and applied 40 times in the DOM, pillRadius (count >= 3 in CSS
  declarations) and glassSurfaces (count >= 3 in CSS declarations) in
  src/lib/siteRules.ts only see 1 declaration in the CSS file and never fire!
- Modern CSS Color Spaces (oklch, hsl, rgb, CSS Custom Properties):
  bluePurplePalette in src/lib/siteRules.ts only checks 10 hardcoded hex codes
  (#6366f1, #8b5cf6, etc.) and the literal words indigo|violet|purple. Tailwind v4
  and modern shadcn/ui templates emit oklch(...) or hsl(var(--primary)), bypassing
  bluePurplePalette 100% of the time.
- Commented-Out or @media print / Dead CSS Rules: Because src/lib/siteAnalyzer.ts
  merely strips /* ... */ comments and hands the entire concatenated CSS bundle (up
  to 5 files × 2 MB = 10 MB) to src/lib/siteRules.ts, unused utility classes inside
  a framework stylesheet trigger false positives even if no element in context.doc
  ever uses them.

DOM Rule Blindness & Arbitrary Caps:

- deadLinks, unnamedControls, and missingAlt in src/lib/siteRules.ts slice at 400,
  400, and 300 elements respectively, and deadLinks deduplicates by raw href
  string—so a page with 25 broken href="#" placeholder links in its footer and nav
  only counts href="#" once!
- threeSteps in src/lib/siteRules.ts checks [class*="step"], [class*="Step"], which
  falsely matches classes like stepper, step-brother, or multi-step-form.
- SITE_TEXT_LIMIT = 60000 in src/lib/siteAnalyzer.ts silently truncates long pages,
  while extracting document.body.textContent mashes navigation menus, cookie
  banners, hidden modals, and <noscript> fallbacks into the copy analyzer as if
  they were prose paragraphs.

## 5. Backend, Security & Frontend Bugs (server/fetch.mjs, src/components/SiteChecker.tsx)

Crash Bug — Unguarded new URL(baseHref, page) in src/components/SiteChecker.tsx:
Inside fetchStylesheets in src/components/SiteChecker.tsx, const base = baseHref ?
new URL(baseHref, page) : page executes outside a try/catch block (unlike the
stylesheet href loop below it). Any target webpage containing a malformed
<base href="http://[invalid"> tag throws an uncaught TypeError and aborts the
entire scan.

Unencoded Query String Bug in Proxy Mode (src/components/SiteChecker.tsx):
proxyUrl constructs PROXYPREFIX{target} (https://proxy.corsfix.com/?${target})
without encodeURIComponent(target). If the scanned URL or stylesheet URL contains
?v=1.2&theme=dark or #section, the & and # are parsed as parameters/fragments of
proxy.corsfix.com rather than the target URL, breaking stylesheet and page fetches.

Broken Static-Host Fallback Logic (src/components/SiteChecker.tsx): If /api/health
succeeds on mount (apiState === 'ok'), SiteChecker.tsx locks into 'api' mode
permanently. If /api/fetch subsequently fails due to serverless timeout or
rate-limiting, the user is never offered the proxy fallback.

IPv4 Over-Blocking & IPv6 SSRF Gaps in server/fetch.mjs:

- IPv4 False Positives: In isPrivateAddress (server/fetch.mjs), if (a === 198 &&
  b === 51) return true; blocks the entire 198.51.0.0/16 (65,536 public IPs)
  instead of RFC 5737 198.51.100.0/24 (c === 100). Likewise, if (a === 203 &&
  b === 0) return true; blocks all of 203.0.0.0/16 instead of 203.0.113.0/24
  (c === 113).
- IPv6 Bypasses: Link-local IPv6 (fe80::/10) spans fe80 through febf, but
  isPrivateAddress only checks fe80, fe8, fe9, and fea—missing feb0::/12. It also
  fails to block NAT64 (64:ff9b::/96, which can encapsulate private IPv4 addresses
  like 64:ff9b::127.0.0.1), Teredo (2001::/32), and 6to4 (2002::/16).

## 6. Target State-of-the-Art Architecture

To elevate coldabs/sloppy from a brittle regex toy into the gold standard of
deterministic slop detection, replace raw regex string-scanning and global
word-count division with a multi-stage DOM-Scoped + Sliding-Window + Used-CSS AST
Pipeline. (The audit included an SVG diagram of this pipeline; its six nodes, in
order, are: Semantic Chunker — "Hero vs Body DOM"; Lemma + POS Matcher — "Stem +
syntax frames"; N-Gram Entropy — "MATTR + Zipf slope"; DOM + Tailwind AST — "Used
classes + oklch"; Windowed Scorer — "Peak 100w + Global"; SARIF + CLI + UI — "PR
diff & CI gate".)

## 7. Step-by-Step Engineering Roadmap to Make sloppy State-of-the-Art

Follow these six ordered engineering stages to fix every bug identified above and
upgrade the engine:

1. Patch SSRF, Proxy Encoding, and Base-URL Crashes Immediately
   Fixes server/fetch.mjs and src/components/SiteChecker.tsx
   Correct the RFC 5737 IPv4 /24 masks and IPv6 fe80::/10 + 64:ff9b::/96 ranges in
   server/fetch.mjs, wrap new URL(baseHref, page) in a safe helper inside
   src/components/SiteChecker.tsx, and URL-encode target URLs passed to
   proxy.corsfix.com (or verify how the proxy parses embedded query strings).
2. Fix Normalizer Boundary Corruption on URLs, Paths, and Slashes
   Fixes src/lib/normalize.ts
   Stop converting . and / into \uE000 (UNDERSCORE_PLACEHOLDER) when the surrounding
   token is a URL, domain name, file path, or common slash conjunction (and/or,
   input/output, client/server, true/false). Only fold obfuscation separators when
   neither side forms a known compound or URI token.
3. Replace Global Density Dilution with a Sliding-Window Peak + Adaptive Floor Scorer
   Upgrades src/lib/analyzer.ts
   Compute penalties over both the full document and a 100-word sliding window
   (step = 25 words), combining 0.35 * globalPenalty + 0.65 * peakWindowPenalty so a
   sloppy hero section cannot be washed out by a 1,000-word footer. Replace the flat
   50-word floor with an adaptive Bayesian prior floor (Math.min(50, Math.max(12,
   words * 2.2))) and apply a sentence-level co-occurrence multiplier when 3 or more
   distinct rule groups fire in the same sentence.
4. Upgrade Lexical Rules to Stemmed Construction Frames and MATTR
   Upgrades src/lib/rules.ts
   Split the 2,839-line src/lib/rules.ts monolith into per-group modules
   (src/lib/rules/voice.ts, claims.ts, diversity.ts, etc.). Replace single-word *
   wildcards in phraseSource with bounded 1-to-3 token gaps ((?:\S+\s+){1,3}), add
   morphological suffixes (delv(?:e|es|ed|ing)), replace raw TTR with a 100-word
   Moving-Average Type-Token Ratio (MATTR), and require hype-context corroboration
   before unsourced-number penalizes financial or academic prose.
5. Correlate CSS Rules with DOM Usage and Tailwind/OKLCH Utilities
   Upgrades src/lib/siteRules.ts and src/lib/siteAnalyzer.ts
   Instead of regex-grepping raw CSS files without checking whether selectors match
   the DOM, inspect both element.classList in context.doc (catching Tailwind classes
   like rounded-full, backdrop-blur-*, bg-indigo-*, from-purple-*, shadow-2xl) and
   resolved CSS custom properties / oklch() / hsl() hues. Stop deduplicating
   deadLinks by raw href="#" so 20 dead placeholder links carry a 20-link penalty.
6. Ship a Standalone CLI, GitHub Action SARIF Reporter, and Web Worker Offloading
   New capabilities in package.json
   Run analyze() and analyzeSite() inside a browser Web Worker so pasting 60,000
   characters never blocks the main UI thread, and expose a "bin": { "sloppy":
   "./bin/sloppy.mjs" } CLI in package.json that outputs JSON or GitHub Code
   Scanning SARIF so teams can gate pull requests on copy and landing-page slop
   in CI.

## 8. Drop-In Code Patches for Immediate Bugs & Scoring Upgrades

### Patch A: Fix IPv4/IPv6 SSRF Masks in server/fetch.mjs

In server/fetch.mjs, replace the over-broad IPv4 /16 checks (198.51.* and 203.0.*)
and incomplete IPv6 prefix checks with exact CIDR bitmask bounds:

```js
// server/fetch.mjs — exact RFC 5737 / RFC 4291 / RFC 6052 checks
if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2 only)
if (a === 203 && b === 0 && c === 113) return true;  // 203.0.113.0/24  (TEST-NET-3 only)

// In IPv6 check: cover full fe80::/10 (fe80..febf), Unique Local fc00::/7, NAT64 64:ff9b::/96, 6to4 2002::/16
if (
  /^fe[89ab][0-9a-f]:/i.test(normalised) ||
  /^f[cd][0-9a-f]{2}:/i.test(normalised) ||
  /^64:ff9b:/i.test(normalised) ||
  /^2001:db8:/i.test(normalised) ||
  /^2002:/i.test(normalised)
) {
  return true;
}
```

### Patch B: Fix <base href> Crash & Unencoded Proxy URLs in src/components/SiteChecker.tsx

In src/components/SiteChecker.tsx, guard new URL(baseHref, page) and encode target
URLs passed to the CORS proxy:

```tsx
// src/components/SiteChecker.tsx
function proxyUrl(target: string): string {
  return `PROXYPREFIX{encodeURIComponent(target)}`;
}

function resolveBaseUrl(doc: Document, pageUrl: string): string {
  const baseHref = doc.querySelector('base[href]')?.getAttribute('href')?.trim();
  if (!baseHref) return pageUrl;
  try {
    return new URL(baseHref, pageUrl).href;
  } catch {
    return pageUrl;
  }
}
```

### Patch C: Replace Global Density Dilution with Windowed Peak Scoring in src/lib/analyzer.ts

In src/lib/analyzer.ts, add a 100-word sliding window (WINDOW_WORDS = 100) and
adaptive short-text floor so neither 1-word buzzword drafts nor 1,500-word padded
pages can game the score:

```ts
// src/lib/analyzer.ts — Dilation-Resistant Windowed Scoring
const WINDOW_WORDS = 100;

export function adaptiveFloorWords(words: number): number {
  if (words <= 0) return 1;
  // A 5-word tagline uses a 12-word floor instead of 50; scales smoothly up to 50
  return Math.min(DENSITY_FLOOR_WORDS, Math.max(12, Math.round(words * 2.2)));
}

export function densityFactor(hits: number, words: number): number {
  if (hits <= 0) return 0;
  const effectiveWords = Math.max(words, adaptiveFloorWords(words));
  const per100 = (hits * 100) / effectiveWords;
  return per100 / (1 + per100 / DENSITY_SATURATION);
}

export function peakWindowDensityFactor(
  matchOffsets: readonly { start: number; end: number }[],
  wordSpans: readonly { start: number; end: number }[],
): number {
  const totalWords = wordSpans.length;
  if (matchOffsets.length === 0 || totalWords === 0) return 0;
  if (totalWords <= WINDOW_WORDS) {
    return densityFactor(matchOffsets.length, totalWords);
  }
  let maxHitsInWindow = 0;
  for (let i = 0; i <= totalWords - WINDOW_WORDS; i += 20) {
    const winStart = wordSpans[i].start;
    const winEnd = wordSpans[Math.min(totalWords - 1, i + WINDOW_WORDS - 1)].end;
    const hits = matchOffsets.filter(m => m.start >= winStart && m.end <= winEnd).length;
    if (hits > maxHitsInWindow) maxHitsInWindow = hits;
  }
  const globalDF = densityFactor(matchOffsets.length, totalWords);
  const peakDF = densityFactor(maxHitsInWindow, WINDOW_WORDS);
  return Math.max(globalDF, 0.35 * globalDF + 0.65 * peakDF);
}
```

### Patch D: Detect Tailwind Utility Slop & Modern Color Spaces in src/lib/siteRules.ts

In src/lib/siteRules.ts, augment raw CSS regex scanning with DOM utility-class
inspection so Tailwind and shadcn/ui sites are caught accurately:

```ts
// src/lib/siteRules.ts — Count both CSS declarations AND DOM Tailwind utility usage
function countDomClassMatches(doc: Document, pattern: RegExp): number {
  let count = 0;
  const elements = doc.querySelectorAll('[class]');
  for (const el of elements) {
    const cls = el.getAttribute('class') || '';
    if (pattern.test(cls)) count += 1;
  }
  return count;
}

// Inside pillRadius:
const cssPillCount = declarations(context.css, 'border-radius')
  .filter(v => /(?:^|\s)(?:\d{3,}px|[6-9]\d*rem|\d{2,}em|calc\(infinity)/i.test(v)).length;
const domPillCount = countDomClassMatches(context.doc, /\brounded-full\b/);
const totalPills = Math.max(cssPillCount, domPillCount);

// Inside bluePurplePalette: also catch oklch() hues (250..310 deg) and Tailwind indigo/violet/purple classes
const oklchPurpleMatches = context.css.match(/oklch\(\s*[\d.]+%?\s+[\d.]+\s+(?:2[5-9]\d|30\d)(?:\.\d+)?\s*\)/gi) ?? [];
const domPurpleClasses = countDomClassMatches(
  context.doc,
  /\b(?:bg|text|from|via|to|border|ring)-(?:indigo|violet|purple)-(?:[4-9]00|50)\b/
);
```
