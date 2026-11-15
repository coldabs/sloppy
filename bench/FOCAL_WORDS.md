# Focal words on marketing copy — pilot validation (F56)

The 21 focal words come from Juzek & Ward (arXiv:2412.11385, Table 2),
which sampled 10,000 human PubMed abstracts from 2020, summarised and
re-wrote them with ChatGPT-3.5, and measured which words spiked. The
paper's register is scientific abstracts. Nothing in the repo validated
the vocabulary against marketing copy. This note is that validation, at
pilot scale — and its result is that the vocabulary carries almost no
signal in this register at all.

## The list is accurate

The 21 forms in the code and in `docs/METHOD.md` match Juzek & Ward
Table 2 exactly (checked against the arXiv HTML, 2026-11-15):
advancements, aligns, boasts, comprehending, delve, delves, delved,
delving, emphasizing, garnered, groundbreaking, intricate, intricacies,
realm, showcases, showcasing, surpasses, surpassing, underscore,
underscores, underscoring.

## The labelled corpus cannot validate it

Measured 2026-11-15 on `bench/corpus.jsonl` (131 entries), counting the
21 forms with word boundaries, case-insensitive:

| Label | Entries | Words | Focal-word hits | Per 1,000 words |
| --- | --- | --- | --- | --- |
| clean | 72 | 7,564 | 2 (both "delve") | 0.26 |
| grey | 8 | 413 | 0 | 0.00 |
| slop | 51 | 6,812 | 0 | 0.00 |

The slop entries contain no focal words at all — they were built to test
other rules (buzzwords, fake claims, evasions), not this vocabulary. The
corpus carries no focal-word signal in either class, so it cannot
validate the vocabulary. That is the gap F56 names, measured rather
than asserted.

## Real marketing copy: a 10-page pilot

Fetched 2026-11-15 with curl (browser user-agent), visible text only
(script/style/nav/footer stripped), whole page counted.

Clean side — established products, chosen for specific, restrained copy
(judgement, not by score): stripe.com, linear.app, basecamp.com,
notion.com, github.com, figma.com.

Slop side — hype-heavy template copy, chosen by overall impression
(superlatives, vague promises, "revolutionary" / "unlock" /
"game-changing" in the visible copy), NOT selected on focal-word
presence: rahmai.com, trymarx.com,
landing.pivotal.digital/pivotal/landing-home, unlockkeypotential.com.

Excluded: two pages that render no copy server-side (a Bubble template
app and a bolt.new shell) — nothing to measure.

| Side | Pages | Words | Focal-word hits | Per 1,000 words |
| --- | --- | --- | --- | --- |
| clean | 6 | 7,126 | 0 | 0.00 |
| slop | 4 | 12,517 | 1 ("aligns") | 0.08 |
| total | 10 | 19,643 | 1 | 0.05 |

## Conclusion

The focal words are essentially absent from real marketing copy — clean
and slop alike. One occurrence in ~19,600 words. Marketing hype uses
different words (revolutionary, unlock, game-changing, seamless,
cutting-edge); the focal words are academic-abstract words. So the
vocabulary neither fires on marketing slop nor false-positives on clean
marketing copy: it is inert in this register, not wrong. The ai-tells
rule's marketing signal comes from its other phrases ("unlock your
potential", "in today's digital age", and the rest), not from the focal
words, and the clustered-tells gate (four or more distinct tells in one
draft) can essentially never trip on focal words alone in marketing
copy.

## Limits of this pilot

- Small (n = 10 pages, single rater, my own clean/slop labelling).
- Homepages only, English only, one fetch each (copy changes).
- This measures the vocabulary, not the scorer. As context only, the
  full scorer rated 300-word excerpts of these pages 21–68 with no
  separation between the clean and slop groups — but those excerpts
  are page furniture (navigation, activity feeds, statistics), not
  drafts, so that is out-of-distribution text, not a valid clean/slop
  test. The GitHub excerpt, for example, scores 21 mostly on
  repeated-bigrams and unsourced-number hits from its live activity
  feed ("push from …", "repo starred by …", "225M+ developers").

## What is still open

A larger, independently labelled marketing corpus would be needed to
say anything stronger — e.g. whether any focal word ever earns its
keep on marketing copy, or whether the focal-word subset should be
scoped to academic-style drafts. That corpus does not exist here, and
this pilot does not create it (third-party page text is not committed
to the repo; only these aggregate counts and the source list above).
