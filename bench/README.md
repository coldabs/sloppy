# Benchmark corpus

## What it is

`corpus.jsonl` is the project's frozen labelled corpus: 131 entries,
one JSON object per line (`id`, `text`, `label`, `split`, `source`).

- **STRESS3 probes (124)** — every probe from `src/lib/p2-stress3.test.ts`,
  with its pinned band as the label: `slop`/`industrial` → `slop`,
  `clean` → `clean`, `mostly` → `grey`.
- **P2 clean corpus (6)** — the six clean human texts from
  `src/lib/p2.test.ts` (academic abstract, legal, technical docs,
  literary prose, business email, clean landing page), labelled `clean`.
- **Example draft (1)** — the head-to-head slop draft, labelled `slop`.

Labels are frozen. The split is deterministic and stratified: within
each label, entries sorted by id, every 10th (`index % 10 < 3`) goes to
the held-out `test` split (45 entries); the rest are `dev` (86).

## How it runs

`npm run bench` runs `bench/bench.test.ts`, which scores every entry
with the real `analyze()` and reports:

- **Binary precision/recall/F1** on the `slop`/`clean` entries
  (`grey` excluded): flagged means score < 90. Reported for all, dev,
  and test splits. **CI gates: test-split precision ≥ 0.85 and
  recall ≥ 0.60** — the run fails below either.
- **Grey-zone agreement**: how many `grey` entries land in 70–89
  (reported, no gate).
- **Per-rule precision**: for each rule, the share of its firings that
  land on slop-labelled entries (diagnostic, no gate — a rule firing
  mostly on clean entries is noise, not signal).

The bench test also runs under plain `npm test`, so the gates bite on
every CI run.

## What the numbers do and do not mean

Read this before quoting them. The labels were pinned from the
scorer's own measured output (the stress test pins each probe's band
after measuring it), so the current baseline — precision 1.000,
recall 1.000 — is agreement with the project's own expectations, not
an independent measurement of real-world detection. The corpus is
hand-written probes plus six hand-written clean texts; there is no
real LLM output vs real human text in it, no held-out set from an
outside source, and no per-rule precision measured on anything but
these entries.

What the benchmark is for: **regression detection and tuning
discipline**. If a change breaks a probe, the bench fails. Thresholds
are tuned on the `dev` split only — never on `test`, and never by
editing a label to make the engine pass.

## Changing the corpus

- **Deliberate label changes** (with a note, never silent):
  - 2026-11-15 (F20): `C28` `clean` → `grey`. The probe was pinned `clean` only because the testimonial cliche ("I love this product so much") was missed at 100; the F20 fix now flags it (score 70, in the grey zone), and the stress-test band was re-pinned `clean` → `mostly` in the same change.
  - 2026-11-15 (F21): `A12`, `C10`, `C13b`, `C19`, `C28`, `C32` `grey` → `slop`, and `C11` `clean` → `grey`. The floor is now the draft's own length, so the same hits score lower (A12 62, C10 64, C13b 65, C19 65, C28 53, C32 53) and the stress-test bands were re-pinned `mostly` → `slop` in the same change; C11 moved 90 → 89 on the 0.15/0.85 blend, one point across the clean boundary, and its band was re-pinned `clean` → `mostly`.
- **Too short to score**: entries under `MIN_SCORE_WORDS` (8 words) have no meaningful score, so the bench excludes them from every metric and reports them as skipped (7 of 131: B20, B35, D03, D04, D05, D11, D12). Their labels stay in the frozen corpus but are inert.
- **Adding entries**: append new lines with a fresh id, a label, and
  a split (keep the 70/30 balance roughly). Record the addition here.
- **Never change a label to make the engine pass.** If an entry's
  label looks wrong, say so in the fix list and change it deliberately
  with a note — the count assertion in the bench test fails loudly on
  any silent edit.
- **What is still missing**: an independent held-out set — real LLM
  output and real human text from outside this repo, labelled by
  someone other than the scorer. That is the real fix for the
  self-grading problem, and it is not in this batch.
