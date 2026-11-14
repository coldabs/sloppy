# Method

How sloppy scores a draft, in full. Everything here comes from
`src/lib/rules.ts` and `src/lib/analyzer.ts`. The page renders its rule
ledger from the same data, so this document and the scanner cannot drift
apart. If they ever disagree, the code is right and this document needs
fixing.

## Scoring

1. Each rule is weighted by severity: high 15, medium 9, low 4, and
   scaled by how often it appears per 100 words. The scale levels off,
   so repeating one phrase costs more than saying it twice, but never
   without limit. All hits are listed, and the panel paginates them ten
   at a time with an exact count of what is still hidden. A span
   matched by two rules counts once, at the higher severity.
2. One hit in a short draft costs far more than the same hit in a long
   one. Drafts under 50 words are scored as if they were 50 words.
3. The penalty decays on a curve:

   `score = round(100 * e^(-penalty / 55))`

   A draft with no hits scores 100.

Verdict bands:

| Score | Verdict |
| --- | --- |
| 90 to 100 | Clean enough |
| 70 to 89 | Mostly clean |
| 45 to 69 | Slop creeping in |
| 20 to 44 | Heavy slop |
| 0 to 19 | Industrial slop |

The score is normalised by length. One hit in a three-word draft costs
far more than the same hit in a five-thousand-word draft. Repeats cost
more the more they appear, with diminishing returns. See
[Limits](#limits) for what the formula still cannot see.

Before scanning, the draft is normalised: Unicode NFKC folding,
zero-width characters stripped, Cyrillic and Greek lookalikes folded to
Latin, dash and hyphen variants unified, and underscores treated as
separators. Findings are mapped back to the exact span in the original
text, so the highlighted copy is always what was pasted.

## The rules

Eighteen rules, in five groups.

### Voice

Words that perform confidence instead of naming a capability.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Em dash (`em-dash`) | High | An em dash used as a pause, and its HTML forms `&mdash;` and `&#8212;`. En dashes, double hyphens, and spaced hyphens count the same way, because the draft is normalised before scanning. An em dash inside a word is a compound separator, not a pause, and is left alone. So is a dash that is document structure: a list bullet, a line with no words on it (a table separator or horizontal rule), or a dash between two links. A minus sign, as in e^(-penalty / 55), is not a pause either. | Use a comma, colon, period, or parentheses. |
| Hype vocabulary (`buzzwords`) | Medium | "ai-powered" / "ai powered", "revolutionary", "next-generation" / "next generation", "cutting-edge" / "cutting edge", "groundbreaking", "unparalleled", "seamless" / "seamlessly", "game-changing" / "game changing" / "game changer", "unleash", "supercharge", "state-of-the-art" / "state of the art", "best-in-class", "world-class", "industry-leading", "transformative", "disruptive", "synergy" / "synergies", "paradigm shift", "empower", "effortless" / "effortlessly", "innovative", "turnkey", "leverage", "elevate your", "take it to the next level", "in today's fast-paced world", and the split spellings "seam less", "revo lutionary", "ground breaking" | Swap in a concrete capability, or delete the word. |
| AI tell phrases (`ai-tells`) | Medium | "delve", "tapestry", "furthermore", "moreover", "in conclusion", "embark", "realm", "navigate", "it's important to note", "in today's digital age", "as an AI language model", "welcome to the future of work", "unlock your potential", "join us on this journey" | Delete the phrase, or say what actually happened. |
| AI adjectives (`ai-adjectives`) | Low | "crucial", "pivotal", "foster", "robust", "landscape" | Name the specific quality, or delete the word. |
| Template opener (`overused-opener`) | Low | "in today's world", "in today's fast-paced world", "in a world where", "imagine a world", "ever wondered", "we've all been there", "let's face it", "here's the thing", "in an era of" | Start with the claim itself. |
| Not just X, but Y (`not-just`) | Low | The stock cadence "not just X, but Y", where the twist arrives in the same sentence, however long the clause is | State the claim once, directly. |
| Hype punctuation (`hype-punctuation`) | Low | Repeated `!` or `?` marks, and celebration emoji: fire, rocket, sparkle, party popper, 100, heart-eyes, partying face, raising hands, clapping hands, flexed biceps, party, and glowing star | Keep one period and let the sentence carry the weight. |

### Claims

Numbers, credentials, and praise that arrive without proof.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Unsourced number (`unsourced-number`) | Medium | A percentage, a number with a `k`, `m`, or `b` suffix, or a large round number used as a selling claim (10,000 happy users, ten thousand teams, 10 million readers), with no source nearby. A number with context — a date, a version, a measurement, "the server handled 10,000 requests" — is left alone | Link the source, or cut the number. |
| Unverified trust claim (`trust-claim`) | High | "SOC 2", "ISO 27001", "GDPR-compliant", "HIPAA-compliant", "enterprise-grade security", "bank-level encryption", "military-grade encryption", "100% secure", "100% uptime", "99.x% uptime" | Link the audit, or remove the claim. |
| Unattributed social proof (`social-proof`) | Medium | "trusted by", "loved by", "used by", "join thousands", "join millions", "join over", "join 10,000" | Name real customers, or delete the line. |
| Testimonial cliche (`testimonial-cliche`) | Medium | "changed my life", "life-changing", "10x our", "best decision we've made", "can't imagine", "blown away", "a must-have" | Quote a named customer with a source, or cut the section. |
| Vague superlative (`vague-superlative`) | Medium | "best tool", "best choice", "ultimate choice", "ultimate tool", "perfect fit", "perfect choice" | Say what is actually better, and compared to what. |

The unsourced number rule leaves a number alone only with a real
citation within 40 characters of it: a link, or a named report, study,
survey, audit, paper, review, index, or ranking together with a year.
The words "data" and "per" on their own never count, and neither does a
bare mention of a report. A bare number counts only when it is at
least 1,000 and a claim noun — users, customers, teams, readers, and
the like — follows it within a few words. A plain four-digit year is
never a claim. The trust claim rule has the same kind of exemption: a
compliance claim is left alone when a link to its audit sits in the
same sentence, or the one after it, together with audit language. A
link to anything else, such as a pricing page, does not clear it.

### Actions

Labels that hide what the click actually does.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Generic call to action (`generic-cta`) | Medium | "get started", "learn more", "try now", "try it now", "explore", "discover", "click here", "read more", "sign up today", "sign up", "sign up to continue", "start now", "start your free trial", "start a free trial", "find out more", "buy now", "subscribe today", "subscribe now", "subscribe", "download it free", "download now", "download free", "download", "book a demo", "get a quote". "Explore" or "discover" followed by documentation words — the codebase, the API, the docs — is navigation, not a sales button, and is left alone. So is "get started" followed by a command, as in "run npm install" | Name the action, for example "Paste your draft" or "See the rules". |
| Vague product noun (`vague-solution`) | Low | "solutions", "solution for", "all-in-one", "one-stop shop", "everything you need", "end-to-end", "does it all". "Solutions" in a maths sentence, such as "solutions to the equation", is left alone | Name the specific task the product performs. |

### Format

Typographic habits borrowed from templates.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| All-caps shouting (`shouting-caps`) | Low | Runs of three or more capital letters, except for a fixed allowlist of real acronyms such as AI, API, GDPR, SOC, NASA, FBI, and WCAG. One capitalised word alone in a sentence, such as FREE shipping, is emphasis or a label and is left alone, and a whole line of capitals with no sentence terminator is a heading. A sustained run, such as SALE ENDS TODAY, still counts | Use sentence case and let the wording carry the emphasis. |

### Structure

The shape of the writing, not its words.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Same-length sentences (`same-length-sentences`) | Low | Four or more consecutive sentences, each at least three words long, whose lengths differ by at most one word | Break the rhythm: shorten one sentence, lengthen another. |
| Repeated sentence openings (`repeated-openings`) | Low | Three or more consecutive sentences that open with the same two words | Vary the openings, or merge the sentences. |
| Adverb-stuffed sentence (`adverb-density`) | Low | A sentence carrying three or more -ly adverbs, not counting words such as only, early, and daily, which are not adverbs | Keep the strongest adverb, or name what actually happened. |

## Limits

- The list is fixed. A phrase that is not on it scores nothing, however
  familiar it sounds. Common machine-made wording outside the eighteen
  rules, and any paraphrase of a listed phrase, will pass clean.
- Splitting a listed phrase, or swapping a character for a lookalike,
  no longer hides it: the draft is normalised before scanning. Dropping
  the part the pattern needs, such as the `%` sign on a number, still
  works around it.
- A number is exempt only with a real citation next to it: a link, or a
  named publication together with a year, within 40 characters.
- The score is density-aware, but it is still penalty only. A draft
  that repeats one pattern many times is scored worse than one that
  says it twice, and a single hit in a short draft costs more than the
  same hit in a long one.
- False positives are normal. The common ones are handled — "Explore
  the codebase", a compliance claim that links its audit, known
  acronyms such as NASA — but a single emphasised word can still be
  flagged when it sits next to other capitalised words, and a number
  can still be flagged when its source is too far away to count as a
  citation.
- Only English text is checked. Layout, images, motion, and code are out
  of reach. A high score is not proof of quality, and a low score is not
  proof of slop.

These limits are part of the method, not footnotes to it. Any change to
the rules should update this document in the same pull request.
