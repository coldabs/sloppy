# Calibration of the scoring constants (F28, 2026-11-15)

The scoring formula's constants — the severity weights, the decay,
the density saturation, the window blend, the adaptive floor, the
co-occurrence boost — were named and exported but carried no
derivation: nothing said why 15/9/4 or 55 rather than any other
numbers. This note records how each one was measured, what the
measurement constrains, and what it does not.

## Method

A one-off sensitivity sweep (script kept outside the repo; the
procedure is reproducible from this note). For each constant, a
candidate value was substituted into the source, `npm run bench`
was run, and the dev/test precision and recall and the grey-zone
agreement were recorded; the source was restored after every run
(`git status` clean at the end). The bench labels are the corpus
labels from `bench/corpus.jsonl`, with "flagged" defined as
score < 90 and the grey zone as the entries labelled `grey`
(8 scorable; a ninth, B20, is too short to score and is excluded).

## What the measurement can and cannot say

Read this before the table, because it changes what the numbers
mean. The corpus labels were pinned from the scorer's own measured
output (see `bench/README.md`), at these very constants. So the
sweep does **not** independently validate the values: a constant
that reproduces the pinned labels is partly reproducing its own
history. What the sweep does measure, honestly, is each constant's
**margin** — how far it can move before a pinned expectation
breaks — and which constants the corpus actually constrains at
all. A constant with a wide flat region is a design choice the
benchmark cannot tell from its neighbours; a constant with a
narrow peak is pinned by the corpus, and the table says which
entries do the pinning.

The discriminating metric is the grey-zone agreement, not the
binary precision/recall. Binary precision/recall stay at 100%
over wide ranges of every constant — the 90-point flag threshold
sits far from most entries' scores — so they cannot tell a good
constant from a bad one. The eight grey entries sit near the
70–89 band edges, so they are the ones that move when a constant
changes. The grey-zone gate in `bench/bench.test.ts`
(`expect(inBand).toBe(grey.length)`) is what keeps this
calibration in CI: a constant change that pushes a grey entry out
of its band fails the bench.

## Results

Dev and test precision/recall were 100.0% / 100.0% at every swept
value except severity low = 8 (dev precision 97.0% — one false
positive). The table below is the grey-zone agreement (of 8) at
each value; the current value is marked `*`.

| Constant | Swept values → grey in band |
| --- | --- |
| severity high (15*) | 10→8, 12→8, 15→8, 18→8, 20→8, 25→8 |
| severity medium (9*) | 6→8, 7→8, 9→8, 11→8, 12→8, 15→8 |
| severity low (4*) | 2→5, 3→7, **4→8**, 5→4, 6→3, 8→3 |
| SCORE_DECAY (55*) | 35→3, 45→5, **55→8**, 65→7, 75→7, 90→5 |
| DENSITY_SATURATION (10*) | 5→7, 7→7, **10→8**, 14→7, 20→4, 30→4 |
| DENSITY_FLOOR_WORDS (50*) | 25→8, 35→8, 50→8, 75→8, 100→8 |
| MIN_SCORE_WORDS (8*) | 4→8, 6→8, 8→8, 10→8, 12→7 of 7 |
| COOCCURRENCE_MULTIPLIER (1.25*) | 1.0→8, 1.1→8, 1.25→8, 1.5→8, 2.0→8 |
| WINDOW_PEAK_WEIGHT (0.85*) | 0.5→7, 0.65→7, 0.75→8, 0.85→8, 1.0→8 |

Baseline grey scores (current constants): B10 85, C06 74, C07 74,
C11 89, C20 74, C21 77, C23 85, C27 71. C11 sits at the top edge
(89) and C27 near the bottom edge (71), so they are the entries
that bind first.

## Derivation per constant

- **severity low = 4 — pinned by the corpus.** The unique swept
  value that keeps all eight grey entries in band. At 2, three
  entries escape upward (B10 92, C11 94, C23 92 — the low hits
  stop costing enough, so borderline drafts look clean). At 5,
  four escape downward (C06 68, C07 68, C20 69, C27 65 — the low
  hits cost too much, so borderline drafts look like slop). At 3,
  7/8. So 4 is bracketed on both sides: the grey band pins it.
- **SCORE_DECAY = 55 — pinned by the corpus.** The unique swept
  value with 8/8. At 45, three entries fall out the bottom (C06
  69, C07 69, C27 65 — a steeper curve punishes the same penalty
  harder). At 65, one escapes the top (C11 91 — a flatter curve
  lifts it past 89). So 55 is bracketed: the grey band pins it to
  the 45–65 range, with 55 the value that holds all eight.
- **DENSITY_SATURATION = 10 — pinned by the corpus.** The unique
  swept value with 8/8 (5, 7, and 14 each give 7/8). At 5, C11
  escapes the top (90 — a lower saturation caps the density
  factor lower, so a repeated phrase costs less and C11 scores
  higher). At 20, four fall out the bottom (C06 68, C07 68, C20
  69, C27 63 — a higher saturation lets repeats cost more, so
  borderline drafts score lower). So 10 is bracketed on both
  sides.
- **severity high = 15, severity medium = 9 — held by design,
  not measured.** The corpus does not discriminate them: 10–25
  (high) and 6–15 (medium) all keep the benchmark green. The
  grey entries' penalties are dominated by medium and low hits,
  so moving high or medium does not push any grey entry across a
  band edge. The values are kept for the ordering they encode —
  a high-severity hit costs more than a medium one, which costs
  more than a low one (15 > 9 > 4) — not because the corpus
  measured 15 and 9. A future corpus with borderline entries
  that carry high-severity hits could constrain them.
- **DENSITY_FLOOR_WORDS = 50 (cap) — held by design.** 25–100
  all keep the benchmark green. The cap only binds for drafts
  longer than the cap, and no corpus entry's score crosses a band
  edge anywhere in that range. 50 is kept because it is the F21
  value (the floor is the draft's own length, capped at 50) and
  because it matches the window size: a draft longer than 50
  words is judged on at least half a window.
- **MIN_SCORE_WORDS = 8 — held by design, with a binding case.**
  4–10 all keep the benchmark green. 8 is the value from F21:
  below 8 words there is too little evidence to judge (the
  one-word "seamless" verdict, "Slop creeping in" at 48, was
  indefensible). At 12, C27 (11 words) becomes too short to
  score and drops out of the benchmark (grey 7 of 7) — so 8 is
  the largest value that keeps every grey entry scorable, and
  the binding case is C27 at 11 words.
- **COOCCURRENCE_MULTIPLIER = 1.25 — held by design.** 1.0 (no
  boost at all) through 2.0 all keep the benchmark green. The
  corpus does not constrain it: the boost only fires when three
  distinct phrase groups co-occur in one sentence, and no grey
  entry's score crosses a band edge anywhere in that range. The
  25% is deliberately modest (a confidence boost on
  co-occurring evidence, not a new severity), per the code
  comment in `src/lib/analyzer.ts`.
- **WINDOW_PEAK_WEIGHT = 0.85 — constrained to peak-heavy.**
  0.75–1.0 all keep 8/8; 0.5 and 0.65 each lose one grey entry
  (7/8). So the blend must be peak-heavy (≥ 0.75) — a
  global-heavy blend washes a sloppy passage out, which is the
  F21 finding that moved the blend from 0.65 to 0.85 peak. 0.85
  sits in the middle of the flat 0.75–1.0 region; the corpus
  does not distinguish 0.75, 0.85, and 1.0.

## What is still missing

An independent held-out set — real LLM output and real human
text from outside the repo, labelled by someone other than the
scorer — is still missing (see `bench/README.md`). With one, the
sweep above could be re-run against labels the scorer did not
produce, and the "pinned by the corpus" claims would become
independent measurements instead of margin measurements. Until
then, the honest statement is: these constants reproduce the
project's own pinned expectations with the margins above, and
three of them (low, decay, saturation) sit at a measured optimum
on that corpus while the rest are design choices the corpus
cannot distinguish.
