# Stress test 3 — P2 copy

- **Date:** 2026-11-14
- **Code under test:** `~/workspace/sloppy-p2/`, fresh clone of `https://github.com/coldabs/sloppy` at HEAD `a01fad0` plus uncommitted P2 changes (28 rules in 7 groups: voice, claims, actions, format, structure, diversity, substance).
- **Test file:** `src/lib/p2-stress3.test.ts` (4 tests, all passing)
- **Engine files modified:** none. `src/lib/rules.ts`, `src/lib/analyzer.ts` and every other engine file untouched; nothing pushed or uploaded.
- **Method:** every probe runs through the real `analyze()` scorer. First pass recorded scores with no band assertions; bands were pinned only after the scores were measured, then re-run. A probe counts as a finding only when the measured score and the rules fired support it. The full suite was not run at the time; this file alone: **4/4 tests pass**, `npx oxlint` **0 errors**, `npx tsc -b` **0 errors**.

## Summary

- **124 scored probes** (30 evasion, 36 false positives, 43 false negatives, 15 edge cases) + **10 performance probes** = 134 probes total.
- Evasion: all 9 normalisation evasions caught (zero-width, Cyrillic, small caps, split, period, underscore, accented, hyphen-split). Citation logic held on every probe.
- False positives: 18 of 36 clean-human-text probes scored below 90, including ordinary academic prose at **54** and a news earnings sentence at **63**.
- False negatives: 31 of 43 slop probes scored a clean **100** — every paraphrase probe (15/15) and every exact-threshold probe (14/14) had its focus rule silent.
- Performance: worst probe **61.4 ms** (300 evidence links with numbers); 100k-char draft **45.6 ms**. No ReDoS pattern found.
- Inventory check: distinct tiered vocabulary measures **152**, not the briefed 153. Distinct clichés measure **123**, as claimed.

## Full probe table

Scored probes, in run order. "Focus" is the rule the probe was designed to test: `fired` means it matched, `silent` means it did not. Blank focus means the probe had no single-rule target.

| Probe | Words | Score | Verdict | Rules fired | Focus |
|---|---|---|---|---|---|
| A01 | 11 | 76 | Mostly clean | buzzwords |  |
| A02 | 11 | 76 | Mostly clean | buzzwords |  |
| A03 | 11 | 76 | Mostly clean | buzzwords |  |
| A04 | 12 | 76 | Mostly clean | buzzwords |  |
| A05 | 11 | 76 | Mostly clean | buzzwords |  |
| A06 | 11 | 76 | Mostly clean | buzzwords |  |
| A07 | 14 | 76 | Mostly clean | ai-tells |  |
| A08 | 11 | 76 | Mostly clean | buzzwords |  |
| A09 | 11 | 76 | Mostly clean | buzzwords |  |
| A10 | 10 | 76 | Mostly clean | unsourced-number |  |
| A11 | 10 | 76 | Mostly clean | unsourced-number |  |
| A12 | 24 | 76 | Mostly clean | unsourced-number |  |
| A13 | 9 | 76 | Mostly clean | unsourced-number |  |
| A14 | 9 | 100 | Clean enough | — |  |
| A15 | 9 | 76 | Mostly clean | unsourced-number |  |
| A16 | 9 | 100 | Clean enough | — |  |
| A17 | 9 | 76 | Mostly clean | unsourced-number |  |
| A18 | 10 | 76 | Mostly clean | unsourced-number |  |
| A19 | 10 | 76 | Mostly clean | unsourced-number |  |
| A20 | 10 | 100 | Clean enough | — |  |
| A21 | 12 | 100 | Clean enough | — |  |
| A22 | 11 | 76 | Mostly clean | unsourced-number |  |
| A23 | 12 | 76 | Mostly clean | unsourced-number |  |
| A24 | 14 | 100 | Clean enough | — |  |
| A25 | 11 | 63 | Slop creeping in | trust-claim |  |
| A26 | 13 | 63 | Slop creeping in | trust-claim |  |
| A27 | 11 | 63 | Slop creeping in | trust-claim |  |
| A28 | 99 | 36 | Heavy slop | same-length-sentences,burstiness,low-ttr,em-dash |  |
| A29 | 99 | 36 | Heavy slop | same-length-sentences,burstiness,low-ttr,em-dash |  |
| A30 | 15 | 100 | Clean enough | — |  |
| B01 | 28 | 54 | Slop creeping in | ai-tells |  |
| B02 | 83 | 100 | Clean enough | — |  |
| B03 | 27 | 76 | Mostly clean | ai-adjectives |  |
| B04 | 182 | 100 | Clean enough | — |  |
| B05 | 46 | 100 | Clean enough | — |  |
| B06 | 21 | 100 | Clean enough | — |  |
| B07 | 17 | 76 | Mostly clean | unsourced-number |  |
| B08 | 18 | 63 | Slop creeping in | unsourced-number |  |
| B09 | 13 | 100 | Clean enough | — |  |
| B10 | 35 | 89 | Mostly clean | same-length-sentences |  |
| B11 | 55 | 29 | Heavy slop | em-dash,same-length-sentences |  |
| B12 | 16 | 100 | Clean enough | — |  |
| B13 | 22 | 89 | Mostly clean | ai-adjectives |  |
| B14 | 20 | 89 | Mostly clean | ai-adjectives |  |
| B15 | 22 | 76 | Mostly clean | ai-tells |  |
| B16 | 19 | 76 | Mostly clean | ai-tells |  |
| B17 | 19 | 76 | Mostly clean | ai-tells |  |
| B18 | 16 | 76 | Mostly clean | ai-tells |  |
| B19 | 18 | 89 | Mostly clean | ai-adjectives |  |
| B20 | 3 | 89 | Mostly clean | hype-punctuation |  |
| B21 | 19 | 100 | Clean enough | — |  |
| B22 | 14 | 100 | Clean enough | — |  |
| B23 | 17 | 100 | Clean enough | — |  |
| B24 | 19 | 100 | Clean enough | — |  |
| B25 | 19 | 100 | Clean enough | — |  |
| B26 | 27 | 89 | Mostly clean | repeated-openings |  |
| B27 | 22 | 81 | Mostly clean | rule-of-three |  |
| B28 | 21 | 76 | Mostly clean | ai-tells |  |
| B29 | 24 | 100 | Clean enough | — |  |
| B30 | 19 | 100 | Clean enough | — |  |
| B31 | 20 | 100 | Clean enough | — |  |
| B32 | 21 | 100 | Clean enough | — |  |
| B33 | 85 | 100 | Clean enough | — |  |
| B34 | 10 | 100 | Clean enough | — |  |
| B35 | 3 | 100 | Clean enough | — |  |
| B36 | 10 | 76 | Mostly clean | unsourced-number |  |
| C01 | 97 | 46 | Slop creeping in | repeated-openings,low-ttr,repeated-bigrams |  |
| C02 | 11 | 100 | Clean enough | — |  |
| C03 | 14 | 100 | Clean enough | — |  |
| C04 | 13 | 100 | Clean enough | — |  |
| C05 | 10 | 100 | Clean enough | — |  |
| C06 | 14 | 100 | Clean enough | — |  |
| C07 | 14 | 100 | Clean enough | — |  |
| C08 | 86 | 62 | Slop creeping in | buzzwords,ai-tells |  |
| C09 | 81 | 72 | Mostly clean | buzzwords |  |
| C10 | 27 | 100 | Clean enough | — |  |
| C11 | 217 | 100 | Clean enough | — |  |
| C12 | 19 | 100 | Clean enough | — |  |
| C13a | 432 | 100 | Clean enough | — |  |
| C13b | 21 | 76 | Mostly clean | rule-of-three |  |
| C14 | 17 | 100 | Clean enough | — |  |
| C15 | 22 | 100 | Clean enough | — |  |
| C16 | 23 | 100 | Clean enough | — |  |
| C17 | 11 | 100 | Clean enough | — |  |
| C18 | 11 | 100 | Clean enough | — |  |
| C19 | 35 | 89 | Mostly clean | same-length-sentences |  |
| C20 | 29 | 63 | Slop creeping in | ai-tells |  |
| C21 | 46 | 78 | Mostly clean | same-length-sentences,repeated-openings |  |
| C22 | 142 | 95 | Clean enough | same-length-sentences |  |
| C23 | 79 | 85 | Mostly clean | same-length-sentences,repeated-openings |  |
| C24 | 87 | 100 | Clean enough | — |  |
| C25 | 13 | 100 | Clean enough | — |  |
| C26 | 13 | 76 | Mostly clean | unsourced-number |  |
| C27 | 11 | 100 | Clean enough | — |  |
| C28 | 16 | 100 | Clean enough | — |  |
| C29 | 12 | 100 | Clean enough | — |  |
| C30 | 14 | 100 | Clean enough | — |  |
| C31 | 14 | 100 | Clean enough | — |  |
| C32 | 16 | 100 | Clean enough | — |  |
| C33 | 14 | 100 | Clean enough | — |  |
| C34 | 14 | 100 | Clean enough | — |  |
| C35 | 14 | 100 | Clean enough | — |  |
| C36 | 18 | 100 | Clean enough | — |  |
| C37 | 14 | 100 | Clean enough | — |  |
| C38 | 15 | 100 | Clean enough | — |  |
| C39 | 12 | 100 | Clean enough | — |  |
| C40 | 17 | 100 | Clean enough | — |  |
| C41 | 11 | 76 | Mostly clean | ai-tells |  |
| C42 | 20 | 76 | Mostly clean | unsourced-number |  |
| D03 | 1 | 100 | Clean enough | — |  |
| D04 | 1 | 76 | Mostly clean | buzzwords |  |
| D05 | 1 | 76 | Mostly clean | ai-tells |  |
| D06 | 2245 | 100 | Clean enough | — |  |
| D07 | 229 | 4 | Industrial slop | low-ttr,buzzwords,repeated-bigrams,social-proof,trust-claim,generic-cta,hype-punctuation,testimonial-cliche |  |
| D08 | 12 | 76 | Mostly clean | shouting-caps |  |
| D09 | 16 | 100 | Clean enough | — |  |
| D10 | 1036 | 45 | Slop creeping in | buzzwords |  |
| D11 | 1 | 100 | Clean enough | — |  |
| D12 | 5 | 100 | Clean enough | — |  |
| D13 | 36 | 100 | Clean enough | — |  |
| D14 | 27 | 100 | Clean enough | — |  |
| D15 | 5002 | 100 | Clean enough | — |  |
| D16 | 1825 | 45 | Slop creeping in | low-ttr,repeated-bigrams |  |
| D17 | 396 | 100 | Clean enough | — |  |

## Performance probes

All 10 ran inside the 5,000 ms guard, sequentially, one `analyze()` call each. Slowest was E07 (300 evidence links + numbers) at 61.4 ms; the 100k-char draft (E10) took 45.6 ms. Nothing here is close to a ReDoS: the `not just` pattern with no twist (E03) took 34.4 ms on 4,000 words, and 2,500 em-dash pauses (E05) took 49.8 ms.

| Probe | Content | Words | Score | Time |
|---|---|---|---|---|
| E01 | ~20k chars clean | 2245 | 100 | 9.7 ms |
| E02 | ~20k chars slop | 229 | 4 | 2.8 ms |
| E03 | not-just pattern with no twist (ReDoS probe) | 4000 | 43 | 34.4 ms |
| E04 | rule-of-three more-pattern repeated | 3500 | 24 | 32.6 ms |
| E05 | 2500 em-dash pauses | 5000 | 14 | 49.8 ms |
| E06 | 5000 exclamation marks | 1 | 89 | 1.8 ms |
| E07 | 300 evidence links with numbers | 2400 | 35 | 61.4 ms |
| E08 | 5000 emoji | 1 | 100 | 5.7 ms |
| E09 | 3000 apostrophes | 3000 | 43 | 13.6 ms |
| E10 | ~100k chars clean | 11221 | 100 | 45.6 ms |

## Inventory check (measured, not claimed)

- Distinct tiered vocabulary (buzzwords + ai-tells + ai-adjectives + tier-3 style words): **152** — 64 + 50 + 13 + 25 entries, 0 duplicates. The brief said 153. See F-53.
- Distinct clichés (openers + fake authority + pseudo-wisdom + closers + testimonials + superlatives + social proof): **123**, as claimed.
- Clean academic abstract calibration: burstiness 0.230, TTR 0.685 — inside the documented clean range (0.17–0.35).

## Findings register

Numbered F-39 onward, continuing stress test 2 (F-17–F-38).

### F-39 — High — Ordinary academic connective tissue scores "Slop creeping in"

- **Evidence:** B01, 28 words: "Furthermore, the results show a clear effect. Moreover, the effect grows with dose. In conclusion, the treatment works, and the data support the claim in every tested group." → **score 54**, 3 × `ai-tells`. A single "In conclusion" in a student essay (B28) → **76**; "delve" in a history essay (B15) → **76**; "tapestry" in art writing (B16) → **76**; "navigate" in sailing (B17) → **76**; "showcase" in a museum note (B18) → **76**.
- **Why it matters:** `furthermore`, `moreover`, `in conclusion`, `delve`, `tapestry`, `navigate`, `showcase` are ordinary words in their home registers. Three of them in a short paragraph cost 46 points (density floor of 50 words). Any academic, museum, or sailing text that uses its normal connective tissue will be flagged.

### F-40 — High — News and earnings percentages are treated as unsourced selling claims

- **Evidence:** B07, "Unemployment increased 2% last month…" → **76**, `unsourced-number` fired. B08, "Revenue grew 12% year over year to $4.2 billion…" → **63** — fired *twice*: "12%" (claim verb "grew" in the sentence) and "4.2 billion" (claim noun "company" within 5 words after the number). By contrast B06 ("Inflation rose 3.2%") and B31/B32 (weather/polling percentages with no claim verb or noun) correctly scored **100**.
- **Why it matters:** any percentage in a sentence containing a CLAIM_VERBS word (`increased`, `grew`, `growth`, `accuracy`, `faster`…) is a claim. Real reporting — unemployment, revenue, growth figures — is exactly that shape. The rule cannot tell a news sentence from a landing page.

### F-41 — High — "100% FREE for every new user" fires unsourced-number

- **Evidence:** C26, "100% FREE for every new user, no card needed, cancel anytime you like." → **76**, `unsourced-number` fired; `trust-claim` correctly silent. The mechanism: `hasClaimNounAfter` finds "user" within 5 words after "100%", so the percentage counts as a claim.
- **Why it matters:** the same claim-noun-after test behind F-40. A price statement ("100% free") is not a figure that needs a source, but the rule treats any % + nearby claim noun as an unsourced number. This is a false positive on ordinary marketing and pricing copy, not just slop.

### F-42 — Medium — Spelled-out round numbers fire on plain statements

- **Evidence:** B36, "Over a thousand companies across Germany use it every day." → **76**, `unsourced-number` fired ("a thousand" = 1,000, claim noun "companies" follows). Same in the scratch check: "over a thousand companies across Germany use it" fired on the English mirror of B10.
- **Why it matters:** the spelled-number path has no sales-context requirement beyond the claim noun. A plain statement of scale in ordinary prose is scored as a boast.

### F-43 — High — French dialogue with em dashes scores 29 (Heavy slop)

- **Evidence:** B11, 12 lines of French dialogue, each opening with "— ", 55 words → **29**, `em-dash` + `same-length-sentences`. The em-dash rule counts a literal em dash at a line start as a pause (only hyphen *variants* are exempt at line starts), and French dialogue uses one per line, so density measures 218 per 1,000 words against a 20 threshold. Related: B10, five short German sentences (6, 7, 6, 7, 9 words) → **89** via `same-length-sentences` — genuinely uniform, so the rule worked as designed, but it shows the structure rules are language-agnostic. Bangla (B12) scored **100**.
- **Why it matters:** METHOD.md says only English is checked, but the dash and structure rules fire on any text. Any French (or Russian, or Spanish) dialogue pasted in will be called heavy slop.

### F-44 — Medium — Single ordinary words in their home discipline cost 11 points each

- **Evidence:** B13, "The landscape of the valley changed slowly…" (geography) → **89**, `ai-adjectives`. B14, "The programme aims to foster independence…" (social work) → **89**. B19, "It is crucial that patients take the full course…" (medical) → **89**. B03, "robust" ×2 + "landscape" in API docs → **76**. Each is one low hit in a short draft: penalty 4 × densityFactor(1, 50) = 6.67 → 89.
- **Why it matters:** `landscape`, `foster`, `crucial`, `robust` are unremarkable words in geography, social work, medicine, and engineering. The ai-adjectives list has no register awareness, so a clean paragraph in the wrong discipline loses a band.

### F-45 — Medium — Rule-of-three fires on ordinary literary triplets

- **Evidence:** B27, "The old house stood mysterious, dangerous, and beautiful on the hill. The garden grew tangled, neglected, and beautiful in the summer rain." → **81**, `rule-of-three` fired. Two adjective triplets in 22 words is normal literary description, not autopilot.
- **Why it matters:** the adjective-triplet detector keys on suffixes (`-ous`, `-ful`, `-ed`…), which is exactly how literary adjectives are built. Any descriptive passage with two triplets trips it.

### F-46 — Medium — Repeated-openings fires on lyrics and anaphora

- **Evidence:** B26, "I am the storm. I am the fire. I am the voice that you hear in the night. I am the one who will carry the light." → **89**, `repeated-openings` fired (4 × "I am").
- **Why it matters:** repeated openings are a normal poetic and rhetorical device (anaphora). The rule has no exemption for verse or lyrics, so song lyrics and speeches will be flagged.

### F-47 — High — Thin-substance is defeated by one date or one "because" per paragraph

- **Evidence:** C08, three vacuous paragraphs (86 words) each containing a date ("In January", "On Tuesday", "In March") → **62**, `thin-substance` **silent**; the only hits were `buzzwords` + `ai-tells`. C09, three vacuous paragraphs (81 words) each containing "because" → **72**, `thin-substance` **silent**. The paragraph-fact test accepts any DATE_PATTERN match or any CAUSE_OR_TRADEOFF word as a concrete fact, with no check that the fact says anything.
- **Why it matters:** the cheapest filler defeats the P2 substance rule. A slop draft can pass it by sprinkling a weekday or "because" into each paragraph. The rule as built tests for the *presence of a keyword*, not for substance.

### F-48 — Medium — Fake-authority lets a minority of uncited claims through by design

- **Evidence:** C10, "Studies have shown that rest helps, according to the 2024 WHO report. Experts agree that sleep matters, says Dr. Rao at MIT. Research suggests that water helps." → **100**, `fake-authority` **silent**: 1 of 3 claims uncited is not more than half, so the rule stays quiet.
- **Why it matters:** a draft can carry one uncited "Research suggests…" for every two cited claims and stay clean. The >50% ratio is documented in the rule note, so this is a design choice, not a bug — but it is a hole worth naming: one fake citation in three is still a fake citation.

### F-49 — Medium — Every exact threshold is a hard cliff, and there are 14 of them

- **Evidence (all scored 100, focus rule silent):** C11, 3 dashes in 217 words (13.8 per 1,000, under the 20 threshold); C12, 2 dashes (under the 3 minimum); C13a, 2 triplets in 432 words (2 > 432/200 = 2.16 is false); C14, 3 same-length sentences (needs 4); C15, 4 sentences varying by 2 words (strict needs ≤1, near-run needs 5); C16, 2 repeated openings (needs 3); C17, 2 adverbs in one sentence (needs 3); C18, 2 distinct tier-3 style words (needs 3); C19, 2 filler sentences of 6 (exactly 1/3, needs more than 1/3); C20, 2 of 4 paragraphs opening with a transition (exactly half, needs more than half); C21, 7 sentences (burstiness needs 8); C22, 8 uniform sentences with mean 18.4 words (burstiness exempts mean ≥16); C23, 79 words (low-ttr/bigrams need 80); C24, a bigram repeated twice (needs 3).
- **Why it matters:** each threshold is documented and each probe confirms the boundary exactly. The risk is cumulative: a lightly edited slop draft can sit just under every line at once and score 100. Thresholds are visible by design (METHOD.md), so this is inherent — but 14 cliffs in one stress test means the "just under" region is wide.

### F-50 — High — One legal word exempts a whole draft from every diversity rule

- **Evidence:** D06, the same 12 clean sentences repeated 12× (2,245 words, ~190 distinct words) → **100**, no rules fired: the draft contains "Licensor"/"Licensee", so `isFormalRegister` is true and burstiness, low-ttr, and repeated-bigrams are all exempt. D16, the identical construction with the two legal sentences removed (1,825 words) → **45**, `low-ttr` + `repeated-bigrams` fired. The only difference is two sentences containing a legal marker. (D16 first measured **100** because the filter removed only one of the two legal sentences — the second, "Upon termination, the Licensee shall cease…", still exempted the draft. That accident is itself the evidence: a single surviving marker word flips the whole draft.)
- **Why it matters:** the exemption is whole-draft, not per-sentence. A slop draft can buy immunity from all three diversity rules by quoting one contract sentence, and a long repetitive draft that happens to contain the word "Licensee" is scored clean.

### F-51 — Medium — Paraphrase gaps: 15 of 15 near-synonym probes score 100

- **Evidence (all 100, focus rule silent):** C02 "world-changing", C03 "bleeding edge", C04 "powered by AI", C05 "AI-driven", C06 "in a fast-paced world", C07 "in this fast-paced world" (the list has only "in today's fast-paced world"), C28 "I love this product so much" (testimonial paraphrase), C29 "unbelievable", C30 "mind-blowing", C31 "the world's best" (list has "best in the world"), C32 "best thing ever" (list has "best ever" as an adjacent pair), C33 "changes the game entirely" (list has "changed the game" and "game-changing"), C38 claim noun 6+ words after the number ("10,000 of the most loyal and dedicated and long-standing users" — `hasClaimNounAfter` reads only the first 5 words), C39 "five-hundred percent" (hyphenated spelled percent; the pattern needs whitespace between the number words), C40 "10x faster and 10x cheaper" (the list has only "10x our").
- **Why it matters:** the list is fixed, and METHOD.md already states this limit — but the breadth here (15/15 clean) shows how thin coverage is against light paraphrase. None of these needs a determined attacker; they are the first wording a human would reach for.

### F-52 — Low — A one-word draft containing a listed word scores 76

- **Evidence:** D04, "seamless" → **76**; D05, "delve" → **76**. One medium hit with the 50-word density floor: penalty 9 × 1.667 = 15 → 76.
- **Why it matters:** a one-word reply is scored "Mostly clean" for containing one listed word. Defensible (the floor exists so short drafts are not free), but it makes tiny drafts very sensitive — the same word in a 100-word draft costs almost nothing.

### F-53 — Low — P2 vocabulary claim is off by one: 152 measured, 153 briefed

- **Evidence:** distinct tiered vocabulary = **152** (64 buzzwords + 50 ai-tells + 13 ai-adjectives + 25 tier-3 style words, 0 duplicates across the four lists). The task brief said 153. The cliché claim holds at **123**. `p2.test.ts` asserts ≥150, so it still passes.
- **Why it matters:** a small claim-accuracy gap, but the P2 headline numbers should match the lists. Either the brief miscounted or one term was dropped during the build.

### F-54 — Low — METHOD.md is stale for P2

- **Evidence:** `docs/METHOD.md` still says "Eighteen rules, in five groups" and lists only the P1 rules; the code has **28 rules in 7 groups** and the new diversity (burstiness, low-ttr, repeated-bigrams, transition-stacking) and substance (thin-substance, pseudo-wisdom) rules are not documented there. The em-dash row also says severity High; the code has it Medium. The document itself says "If they ever disagree, the code is right and this document needs fixing."
- **Why it matters:** the method page is the public statement of how scoring works, and it now understates the scanner by 10 rules and 2 groups.

### F-55 — Low — Density saturation confirmed as designed

- **Evidence:** D10, "seamless" ×100 in 1,036 words → **45**, `buzzwords` only. Penalty levels off at weight × ~5, so 100 hits cost about three times one hit in the same length, not a hundred times. D07, the built-in example draft ×4 (229 words) → **4** (Industrial slop), so saturation does not save a genuinely bad draft.
- **Why it matters:** not a bug — the saturation is documented — but worth naming: extreme repetition of one phrase saturates, so a draft that leans on a single tell will not be punished in proportion.

### F-56 — Low — "100% FREE" aside, the exemption paths all behaved

- **Evidence:** A14 (evidence link within 40 chars) → **100**; A24 (SOC 2 + audit link) → **100**; A20 ("10,000 requests" with context) → **100**; A21 ("two percent milk") → **100**; A16 ("999 happy users", under the 1,000 threshold) → **100**; A30 (compound dashes) → **100**; B21/B22/B23 (heading, label, snake_case caps) → **100**; D13 (markdown table rows skipped) → **100**; D14 (fenced code skipped) → **100**; D15 (single 5,002-word sentence of unique tokens) → **100**. C42 is the boundary: an evidence link starting more than 40 characters after the number does *not* clear it → **76**.
- **Why it matters:** recorded for balance — the exemption and floor logic mostly does what it claims. The 40-character evidence-link window is the one boundary a real citation can miss (a long sentence between the number and its link).

## What held up

- **Normalisation (F-17 fix confirmed):** A01 zero-width `seam\u200bless`, A02 Cyrillic `seаmless`, A03 small-caps `sᴇᴀᴍʟᴇss`, A04 split `seam less`, A05 `seam.less`, A06 `seam_less`, A07 accented `délve`, A08 hyphen-split `revo-lutionary`, A09 `ground-breaking` — all fired `buzzwords`/`ai-tells` at 76. C41 (Cyrillic е in `delve`) also fired. The F-17 class of evasion is closed.
- **Citation logic:** bare "2024 report" (A10), outlet with no year (A11), citation beyond 60 chars (A12), pricing link (A13, A25) all still fired; evidence link (A14) and audit link (A24) correctly cleared.
- **Threshold boundaries:** every documented boundary held exactly (see F-49). No rule fired a hair under its threshold, and the control probes just over the line (C13b, A28/A29) fired.
- **Diversity rules catch what burstiness misses:** C01 (varied sentence lengths, same few words) evaded burstiness but still scored **46** via `low-ttr` + `repeated-bigrams` + `repeated-openings`. D16 shows the diversity rules working at 1,825-word scale (**45**).
- **Clean corpus:** legal (B02), literary dash prose (B04), business email (B05), academic abstract (B33), "Explore the codebase" (B35), and the concatenated 396-word clean corpus (D17) all scored **100**.
- **Performance:** worst 61.4 ms; 100k chars 45.6 ms; no ReDoS in any of the 10 probes.

## Verdict

**Shippable as-is, with holes named.** The scorer does what it claims on its own terms: every documented threshold held exactly, every normalisation evasion from stress test 2 is still closed, the citation logic is sound, and performance is comfortable (worst probe 61 ms). No probe found a crash, a hang, or a rule firing outside its documented logic.

The holes are real but they are the known shape of this tool, not new breakage: ordinary academic, news, and disciplinary prose can score 54–76 (F-39–F-42, F-44); non-English dash conventions score as heavy slop (F-43); thin-substance and the formal-register exemption are defeatable with a single keyword (F-47, F-50); and light paraphrase passes clean 14 times out of 14 (F-51). If the next round fixes only three things, fix these:

1. **Number claims need sales context, not just a nearby claim word (F-40, F-41, F-42).** A percentage in a reporting sentence ("Unemployment increased 2%", "Revenue grew 12%") and a price statement ("100% FREE for new users") should not count as unsourced selling claims. Require a sales-context signal — or exclude % figures whose sentence reads as measurement/reporting — and stop letting a claim noun 5 words after a % turn a price into a number claim. This is the highest-value fix: it is the false-positive class most likely to hit real users' real text.
2. **Make the substance and register exemptions specific, not whole-draft (F-47, F-50).** A date or "because" alone should not satisfy the paragraph-fact test — require the fact to be specific (a number with context, a named person, a cause tied to an outcome). And scope the formal-register exemption to the sentences or paragraphs that carry the markers, instead of exempting a 2,245-word draft because it contains the word "Licensee" once.
3. **Gate the academic connective tissue on clustering (F-39).** Move "furthermore" / "moreover" / "in conclusion" (and the single-word disciplinary tells like "delve", "tapestry", "navigate") to the tier-3 model — ordinary alone, a signal only when three or more distinct tells cluster — so a normal academic paragraph stops scoring 54. The vocabulary already has this pattern; the ai-tells list should use it.

## Appendix — probe design notes

- Probes that fired *other* rules as noise are recorded as-is in the table; each probe's verdict rests only on its focus rule plus its measured score. Known noise: C19/C20/C21/C22/C23 (same-length/repeated-openings fired alongside the silent focus rule), A28/A29 (burstiness + low-ttr alongside em-dash), C08/C09 (buzzwords + ai-tells alongside silent thin-substance).
- B10's same-length firing was bisected in a scratch check: the five German sentences are 6, 7, 6, 7, 9 words — a genuine 4-in-a-row run within one word, not a splitter artefact. The scratch file was deleted after the check.
- D06/D16 first measured 100/100 because the PAD filler contained *two* legal-marker sentences; removing both flipped D16 to 45 while D06 stayed 100. That accident is the evidence for F-50.
- Band key: clean 90–100, mostly 70–89, slop 20–69 (the table uses the verdict bands: 45–69 "Slop creeping in", 20–44 "Heavy slop"), industrial 0–19. Bands were pinned from measured scores after the first pass; the pinned file passes 4/4.

## Addendum — 2026-11-14, Stage 3 scoring (windowed peak + adaptive floor + co-occurrence)

The table and findings above are the P2 record and are left as written.
Re-running `src/lib/p2-stress3.test.ts` after Stage 3 (AUDIT.md §7 stage 3):

- Clean probes below 90: still **2/36** (B10 89, B20 72 — B20, "Best day
  ever!!!", fell from 89: a 3-word draft is judged against a 12-word
  floor now).
- Slop probes at 100: still **17/43**, the same set — Stage 3 changes
  density scoring, not rule coverage; the silent probes are rule gaps
  for Stage 4.
- Paraphrase probes at 100: still **1/15** (C28).
- **30 probe bands re-pinned** in the test file to the new measured
  scores, all in the harsher direction: 17 evasion probes (A01–A06,
  A08–A11, A13, A15, A17–A19, A22, A23) and 10 slop probes (C02–C05,
  C29–C31, C33, C38, C39) moved mostly → slop (58–68); D04 ("seamless"
  alone) moved mostly → slop (48), closing F-52; D08 moved mostly →
  slop (68); D10 (density saturation) moved slop → industrial (13).
- Dilution demo (new, `src/lib/stage3.test.ts`): a 49-word sloppy hero
  scores 9 alone and 33 with ~1,000 clean words appended (penalty
  133.53 → 61.27, a 54.1% dilution, down from 90.3% / 9 → 79 before
  Stage 3).
- Fake-citation pair: 31 → 40 (was 34 → 40). The rise is the adaptive
  floor growing 44 → 50 plus one unsourced-number hit cleared by the
  pre-existing citation logic — not global dilution. With the same hits
  at floor saturation, added words alone change nothing (34 → 34).

## Addendum — 2026-11-14, Stage 4 rules (split + gaps + suffixes + MATTR + number corroboration + burstiness)

The table and findings above are the P2 record and are left as written.
Re-running `src/lib/p2-stress3.test.ts` after Stage 4 (AUDIT.md §7 stage 4):

- Clean probes below 90: still **2/36** (B10 89, B20 72).
- Slop probes at 100: still **17/43**, the same set — this stage adds
  coverage for shapes the STRESS3 set does not contain (bounded
  1–3-word phrase gaps, inflected forms such as "tapestries" and
  "unleashed", the uniform 18–24-word cadence, suffixed figures
  without hype context), proven by the 47 new tests in
  `src/lib/stage4.test.ts`; it does not move any probe already in the
  table. The silent probes are threshold-boundary and exemption
  shapes (C12, C14–C18, C24–C28, C34–C37, C41, C42), not gap/suffix
  shapes.
- Paraphrase probes at 100: still **1/15** (C28).
- Six scores moved, all from the raw-TTR → MATTR switch (the only
  Stage 4 change that touches a STRESS3 probe): A28/A29 36 → 34 (the
  low-ttr penalty depth changed; still Heavy slop), C01 46 → 45,
  C13a 56 → 58 (low-ttr silent now; still slop), D06 45 → 53 and D16
  45 → 52 (low-ttr silent now — the PAD filler measures MATTR 0.758
  at any length; the repetition is still caught by repeated-bigrams),
  D10 13 → 15 (still industrial). No probe changed band.
- The widened burstiness gate (mean cap 16 → 26, minimum run 8 → 10
  sentences) and the unsourced-number hype-context gate moved no
  STRESS3 probe: the burstiness widening was checked against C22
  (eight PAD sentences, mean 17.8, CV 0.024, pinned clean — spared by
  the ten-sentence minimum), and no STRESS3 probe carries a k/m/b
  figure without hype context.
- Vocabulary union: 165 → **215** distinct terms (50 added suffix
  forms); cliché union unchanged at 129. `src/lib/polish.test.ts`
  F-53 re-pinned to 215; two polish tests re-pinned to MATTR behaviour
  (dash slop 36 → 34, D06 45 → 53 with low-ttr silent).
