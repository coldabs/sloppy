# Method

How sloppy scores a draft, in full. Everything here comes from
`src/lib/rules.ts` and `src/lib/analyzer.ts`. The page renders its rule
ledger from the same data, so this document and the scanner cannot drift
apart. If they ever disagree, the code is right and this document needs
fixing.

This document covers copy mode. Website mode checks fetched markup and CSS
with the rules in `src/lib/siteRules.ts`. It uses the same severity weights
and the same decay curve. Every occurrence of a structure or style signal
is counted and reported, and the penalty for a rule levels off as its
occurrences grow, so twenty dead links cost more than two without
deciding a page on their own. Style signals together contribute at most
15 penalty points, so a page with honest copy cannot be dragged halfway
to slop by its palette and shadows alone. Website mode scans only the
first 60,000 characters of visible page text, and the panel says so
when a page is longer than that. The server resolves a hostname once
and connects to the address it validated, so a hostname whose DNS
answer changes mid-fetch cannot redirect the request to a private
address. See the README for the fetch guards and the static-analysis limits.

## Scoring

1. Each rule is weighted by severity: high 15, medium 9, low 4, and
   scaled by how often it appears per 100 words. The scale levels off,
   so repeating one phrase costs more than saying it twice, but never
   without limit. All hits are listed, and the panel paginates them ten
   at a time with an exact count of what is still hidden. A span
   matched by two rules counts once, at the higher severity, and so
   does a span that sits entirely inside another match: "99.9% uptime"
   is one claim, not a trust claim plus a number. A number that is the
   crowd in a social-proof claim — "Trusted by 10,000 teams" — is
   left to the social-proof rule for the same reason. Document-level
   rules — structure, diversity, and substance — span whole sentences
   or the whole draft, so they never take part in that merging: a
   buzzword inside a same-length run is separate evidence. Two
   document-level rules, flat rhythm and narrow vocabulary range,
   compute their own penalty instead of the standard one: it scales
   with how far the measured value sits past the threshold, up to
   2.5 times the low weight.
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

Before scanning, the draft is normalised: Unicode NFKD folding with
combining marks stripped, zero-width characters stripped, Cyrillic,
Greek, Armenian, and small-capital lookalikes folded to Latin, dash
and hyphen variants unified, and underscores treated as separators. A
period or slash between two letters is a separator too, so "seam.less"
scans as "seamless" while "v2.0" is untouched. A dash is judged by the
letters that survive normalisation on either side of it, so a
zero-width character next to a hyphen cannot turn a compound word into
a pause. Findings are mapped back to the exact span in the original
text, so the highlighted copy is always what was pasted.

An empty draft scores nothing: the result says "Nothing to score"
instead of calling an empty page clean.

## The rules

Twenty-eight rules, in seven groups.

### Voice

Words that perform confidence instead of naming a capability.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Em dash (`em-dash`) | Medium | Pause-dashes at density only: more than 20 pause-dashes per 1,000 words, and at least 3 of them. One dash in a short note is left alone, and so is dash-heavy literary prose at about 10 per 1,000. Its HTML forms `&mdash;` and `&#8212;` count. En dashes, double hyphens, and spaced hyphens count the same way, because the draft is normalised before scanning. An em dash inside a word is a compound separator, not a pause, and is left alone. So is a dash that is document structure: a list bullet, a line with no words on it (a table separator or horizontal rule), or a dash between two links. A dash that opens a line of dialogue — the French, Russian, and Spanish convention, "— Bonjour" — is a speaker turn, not a pause, and is left alone, and dialogue lines do not count toward same-length sentence runs. A minus sign, as in e^(-penalty / 55), is not a pause either. A command-line flag such as `--json` is not a pause. A pair of dashes that opens and closes one interruption counts once, not twice. | Use a comma, colon, period, or parentheses. |
| Hype vocabulary (`buzzwords`) | Medium | "ai-powered" / "ai powered", "revolutionary", "revolutionize" / "revolutionizing", "next-generation" / "next generation", "cutting-edge" / "cutting edge", "groundbreaking", "unparalleled", "seamless" / "seamlessly", "game-changing" / "game changing" / "game changer", "unleash", "supercharge", "turbocharge" / "turbocharged", "state-of-the-art" / "state of the art", "best-in-class", "world-class", "industry-leading", "market-leading", "award-winning", "transformative", "disruptive", "synergy" / "synergies", "paradigm shift", "empower", "effortless" / "effortlessly", "innovative", "turnkey", "leverage", "elevate your", "take it to the next level", "in today's fast-paced world", "future-proof" / "future proof", "next-level", "top-tier" / "top tier", "unprecedented", "unmatched", "unrivaled" / "unrivalled", "unbeatable", "trailblazing", "skyrocket" / "skyrockets" / "skyrocketing", "one-of-a-kind" / "one of a kind", "second to none" / "second-to-none", "like never before", "like no other", "world-changing" / "world changing", "bleeding edge" / "bleeding-edge", "powered by ai", "ai-driven" / "ai driven", "unbelievable", "mind-blowing" / "mind blowing", "changes the game" / "change the game" / "changing the game", and the split spellings "seam less", "revo lutionary", "ground breaking". Bare "next level" without a hyphen is not flagged — it is also a game level and a level of detail. | Swap in a concrete capability, or delete the word. |
| AI tell phrases (`ai-tells`) | Medium | "delve" / "delves" / "delving" / "delved", "tapestry", "furthermore", "moreover", "in conclusion", "embark" / "embarks" / "embarking" / "embarked", "realm", "navigate" / "navigates" / "navigating" / "navigated", "it's important to note" / "it is important to note", "worth noting", "dive into", "in today's digital age", "as an AI language model", "welcome to the future of work", "unlock your potential", "unlock your * potential" (one word in between, such as "full"), "join us on this journey", "showcase" / "showcases" / "showcased" / "showcasing", "underscore" / "underscores" / "underscored" / "underscoring", "intricate" / "intricacies" / "intricacy", "meticulous" / "meticulously", "commendable", "garner" / "garnered" / "garnering", "surpass" / "surpasses" / "surpassing", "boast" / "boasts" / "boasting". The clustered tells — furthermore, moreover, in conclusion, delve, tapestry, navigate, showcase, embark, realm — only count when four or more distinct ones appear in the same draft, because each is ordinary in its home register; the rest fire on their own. | Delete the phrase, or say what actually happened. |
| AI adjectives (`ai-adjectives`) | Low | "crucial", "pivotal", "foster" / "fosters" / "fostered" / "fostering", "robust", "landscape", "quintessential", "exemplary", "unwavering", "steadfast", "paramount". They only count when three or more distinct ones appear in the same draft, because each is ordinary in its home discipline. | Name the specific quality, or delete the word. |
| Style words in a cluster (`style-words`) | Low | Formal style words that are ordinary on their own — "aligns", "emphasizing" / "emphasising", "advancements", "pioneering", "notably" / "notable", "additionally", "consequently", "ultimately", "undoubtedly", "remarkably", "exceptional", "extraordinary", "profound" / "profoundly", "holistic", "invaluable", "indispensable", "comprehensive", "spearheaded" / "spearheading", "championed", "orchestrated", "cultivated". They only count when three or more distinct ones appear in the same draft — the clustering, not the word, is the signal. A single term, however often repeated, never fires on its own. | Use the plain word, or say what actually happened. |
| Template opener (`overused-opener`) | Low | "in today's world", "in today's fast-paced world", "in today's online world", "in a world where", "imagine a world", "ever wondered", "we've all been there", "let's face it", "here's the thing", "in an era of", "picture this", "imagine this", "in the digital age", "in the modern world", "in our modern world", "in this day and age", "have you ever", "what if i told you", "the truth is", "listen up", "dear reader", "once upon a time", "it is no secret that", "there is no denying that", "needless to say", "in a fast-paced world" / "in a fast paced world", "in this fast-paced world" / "in this fast paced world" | Start with the claim itself. |
| Template closer (`template-closer`) | Low | "to sum up", "to summarize", "in summary", "in closing", "all in all", "to wrap up", "wrapping up", "in a nutshell", "long story short", "thanks for reading", "stay tuned", "until next time", "that is all", "let me know what you think" | End on the claim itself, or just stop. |
| Not just X, but Y (`not-just`) | Low | The stock cadence "not just X, but Y", where the twist arrives in the same sentence, however long the clause is — or on the next line, when the setup line ends with a comma. "Yet" counts as a twist too. | State the claim once, directly. |
| Hype punctuation (`hype-punctuation`) | Low | Repeated `!` or `?` marks, and celebration emoji: fire, rocket, sparkle, party popper, 100, heart-eyes, partying face, raising hands, clapping hands, flexed biceps, party, and glowing star | Keep one period and let the sentence carry the weight. |

### Claims

Numbers, credentials, and praise that arrive without proof.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Unsourced number (`unsourced-number`) | Medium | A percentage, a number with a `k`, `m`, or `b` suffix, a spelled-out percentage such as "five hundred percent" or "five-hundred percent", a multiplier claim such as "10x faster", or a large round number used as a selling claim (10,000 happy users, ten thousand teams, 10 million readers), with no source nearby. A percentage only counts when it is a claim — a claim noun or a claim verb nearby, such as "grew" or "uptime" — so a plain measurement such as "The battery is at 50%." is left alone. A number in a reporting sentence is data, not a claim: unemployment, revenue, inflation, or prices with a change verb ("Unemployment increased 2%", "Revenue grew 12%") is left alone. A price statement ("100% FREE") is left alone. A bare or spelled number also needs selling context in its sentence — the seller speaking (we / our / us), a selling verb, or a boast adjective next to the number — so "Over a thousand companies across Germany use it every day" is left alone. A number with context — a date, a version, a measurement, "the server handled 10,000 requests" — is left alone | Link the source, or cut the number. |
| Unverified trust claim (`trust-claim`) | High | "SOC 2", "ISO 27001", "GDPR-compliant", "HIPAA-compliant", "enterprise-grade security", "bank-level encryption", "military-grade encryption", "100% secure", "100% uptime", "99.x% uptime" | Link the audit, or remove the claim. |
| Unattributed social proof (`social-proof`) | Medium | "trusted by", "loved by", "used by", "join thousands", "join millions", "join over", "join 10,000", "join the thousands", "loved by millions", "trusted by millions", "used by millions", "join the millions", "loved by thousands", "trusted by thousands" | Name real customers, or delete the line. |
| Testimonial cliche (`testimonial-cliche`) | Medium | "changed my life", "life-changing", "10x our", "best decision we've made", "best decision i've made", "can't imagine", "blown away", "a must-have", "game changer for me", "changed the game", "could not be happier", "couldn't be happier", "highly recommend", "worth every penny", "best purchase ever", "i wish i had found this sooner", "total game-changer" | Quote a named customer with a source, or cut the section. |
| Vague superlative (`vague-superlative`) | Medium | "best tool", "best choice", "ultimate choice", "ultimate tool", "perfect fit", "perfect choice", "best in the world", "best ever", "the very best", "number one", "number 1", "top rated", "top-rated", "highest rated", "most popular", "world's best", "best thing ever" | Say what is actually better, and compared to what. |
| Uncited authority claim (`fake-authority`) | Medium | "studies have shown", "studies show", "studies confirm", "research shows", "research suggests", "research confirms", "experts agree", "experts say", "scientists say", "science says", "data shows", "the data speaks for itself", "it is well known", "it is widely known", "everyone knows", "as we all know", "history shows", "evidence shows", "it has been proven", "doctors recommend". A claim that names its source is left alone: a link that looks like evidence, a named publication with a year, or the person who said it. Any uncited claim fires. | Name the study, the expert, or the number — or cut the claim. |

The unsourced number rule leaves a number alone only with a real
citation. A link counts only when it looks like evidence: its path
carries an evidence word such as report, survey, study, or audit, or
evidence wording sits next to it. A link to a pricing page, a
homepage, or a bare domain does not clear a number. The link has to
start within 40 characters of the number, or sit in the same sentence
as the number or the next one — a real citation can sit further than
40 characters past the number and still be its source, but a link two
sentences away does not count. A named publication
counts too: a capitalised outlet name together with a year, such as
"the 2025 Gartner survey", with the publication word starting within
60 characters of the number. A bare "2024 report" with no outlet
named is not a citation. The words "data" and "per" on their own never
count. A bare number counts only when it is at least 1,000 and a claim
noun — users, customers, teams, readers, and the like — follows it
within ten words. A plain four-digit year is never a claim. The
trust claim rule has the same kind of exemption: a compliance claim is
left alone when a link to its audit sits in the same sentence, or the
one after it, together with audit language. A link to anything else,
such as a pricing page, does not clear it.

### Actions

Labels that hide what the click actually does.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Generic call to action (`generic-cta`) | Medium | "get started", "learn more", "try now", "try it now", "explore", "discover", "click here", "read more", "sign up today", "sign up", "sign up to continue", "start now", "start your free trial", "start a free trial", "find out more", "buy now", "subscribe today", "subscribe now", "subscribe", "download it free", "download now", "download free", "download", "book a demo", "get a quote". "Explore" or "discover" followed by documentation words — the codebase, the API, the docs — is navigation, not a sales button, and is left alone. So are "learn more" and "click here" when they point at the documentation, and "get started" followed by a command, as in "run npm install". A call to action that sits on a heading line — a markdown heading, or a short line of capitalised words with no sentence terminator — is a label, not sales copy, and is left alone | Name the action, for example "Paste your draft" or "See the rules". |
| Vague product noun (`vague-solution`) | Low | "solutions", "solution for", "all-in-one", "one-stop shop", "everything you need", "end-to-end", "does it all". "Solutions" in a maths sentence, such as "solutions to the equation", is left alone | Name the specific task the product performs. |

### Format

Typographic habits borrowed from templates.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| All-caps shouting (`shouting-caps`) | Low | Runs of three or more capital letters, except for a fixed allowlist of real acronyms such as AI, API, GDPR, SOC, NASA, FBI, and WCAG. One capitalised word alone in a sentence, such as FREE shipping, is emphasis or a label and is left alone, and so is a short all-caps label at the start of a sentence, such as FREE SHIPPING on all orders. A whole line of capitals with no sentence terminator is a heading, including a markdown heading such as "## GET STARTED". A sustained run, such as SALE ENDS TODAY, still counts | Use sentence case and let the wording carry the emphasis. |

### Structure

The shape of the writing, not its words.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Same-length sentences (`same-length-sentences`) | Low | Four or more consecutive sentences, each at least three words long, whose lengths differ by at most one word. Five or more in a row whose lengths differ by at most two words count too, as a near-run. Four sentences that only vary by two words do not count. | Break the rhythm: shorten one sentence, lengthen another. |
| Repeated sentence openings (`repeated-openings`) | Low | Three or more consecutive sentences that open with the same two words. Two in a row do not count. Pronoun-led openings (I am, We are) are rhetorical anaphora and are left alone. | Vary the openings, or merge the sentences. |
| Adverb-stuffed sentence (`adverb-density`) | Low | A sentence carrying three or more -ly adverbs, not counting words such as only, early, and daily, which are not adverbs. Two adjacent sentences carrying two each count the same way. Three adverbs split 2-and-1 across two sentences do not count. | Keep the strongest adverb, or name what actually happened. |
| Rule of three on autopilot (`rule-of-three`) | Low | Everything arriving in tidy triplets: "more X, more Y, more Z", or a triplet of single-word adjectives such as "efficient, scalable, and reliable". The "more" shape fires at two triplets; adjective triplets need three, because two triplets is also a literary paragraph. Either way the count has to be more than one per 200 words. An ordinary list of nouns, such as "apples, oranges, and bananas", is not caught. | Say the one thing that matters, or give the list a reason to exist. |

### Diversity

How varied the writing is. Every rule in this group is length-aware,
and every one is a supporting signal: no single one of them decides a
score on its own. The formal-register exemption is per sentence, not
per draft: sentences that carry a legal or technical marker are
removed before the first three rules are measured, and the rules do
not fire if too little text is left. One legal sentence in a long
draft does not exempt the rest of it.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Flat sentence rhythm (`burstiness`) | Low | Sentence after sentence landing at almost the same length. Burstiness is the population standard deviation of sentence lengths divided by the mean. It fires below 0.12, with at least 8 sentences, at least 80 words, and a mean sentence length under 16 words. The penalty scales with how far the value sits below the threshold, up to 2.5 times the low weight. | Vary the lengths: shorten one sentence, lengthen another. |
| Narrow vocabulary range (`low-ttr`) | Low | The text keeps reaching for the same words. Type-token ratio is unique words divided by total words. It fires below 0.45 under 200 words, below 0.40 under 500 words, and below 0.35 above 500 words. The penalty scales with how far the ratio sits below the band, up to 2.5 times the low weight. It does not fire under 80 words. | Use the specific word for each thing instead of the same few words. |
| Repeated word pairs (`repeated-bigrams`) | Low | The same two-word pair, with a content word in it, three or more times in a draft of at least 80 words. Pairs of pure stopwords, such as "of the", do not count. | Vary the phrasing, or cut the repetition. |
| Transition stacking (`transition-stacking`) | Low | At least half of a piece's paragraphs open with a formal transition word: furthermore, moreover, additionally, ultimately, consequently, therefore, however, meanwhile, nevertheless, nonetheless, firstly, secondly, thirdly, finally, overall, in conclusion, in summary, in addition. Needs at least three paragraphs. | Open paragraphs with the point, not the join. |

### Substance

Whether the text says anything concrete.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Substance-poor paragraphs (`thin-substance`) | Medium | More than half of the paragraphs carry no concrete fact: no name, no number with context, no cause tied to an outcome. A date alone does not count — "In January, everything changes" says nothing specific — and neither does a cause on its own: "because it helps teams" is a claim, not a fact. A cause counts only when the same sentence also carries a number or a name. A bare boastful number does not count as a fact: "99.9% uptime" is the claim being checked, not evidence for the paragraph. A number counts only when it is not flagged by the unsourced-number rule, and a bare four-digit year does not count. Needs at least three paragraphs of at least 10 words each, and 80 words in total. | Give each paragraph one concrete thing: a name, a sourced number, a cause tied to an outcome. |
| Pseudo-wisdom filler (`pseudo-wisdom`) | Low | Sentences that sound profound and mean nothing — "the key is to find balance", "success is a journey, not a destination", "at the end of the day", "the bottom line is", "believe in yourself", "anything is possible", "the sky is the limit", "dream big", "stay positive", "good things take time", "life is too short", "follow your dreams", "never give up", "live laugh love", "true growth comes from within", "it's not about the destination, it's about the journey", "when it comes down to it", "remember to be kind to yourself". Counted by the delete test: remove the sentence and the paragraph loses nothing. That test is a heuristic approximation here, using this fixed list of stock sentences. It fires only when at least a third of the sentences in a passage of at least three sentences are filler, and at least two sentences are filler. | Delete the sentence, or replace it with the specific thing that happened. |

## Calibration

The thresholds in the diversity group and the em-dash density rule
were measured on a calibration corpus, not copied from another tool.
The corpus: an academic abstract, a legal paragraph, technical
documentation, a literary pastiche, a short business email, and a
clean landing page, plus deliberately repetitive and slop-heavy probes
of the same sizes.

- Burstiness (population standard deviation of sentence lengths
  divided by the mean): clean human text in the corpus measures
  0.17–0.35; a ten-sentence run of same-length sentences measures
  0.08. The threshold is 0.12. The published range often quoted for
  this measure (human 0.6–1.2, machine 0.2–0.4) does not transfer to
  short drafts, so it was not used. Burstiness is fragile: a draft
  with two long sentences and the rest short can measure high while
  still being repetitive, so the threshold is deliberately low and
  the rule is a supporting signal only.
- Type-token ratio (unique words divided by total words): clean texts
  in the corpus measure 0.65–0.71 at 85–167 words; a 150-word text
  that repeats the same words measures 0.08. The bands are 0.45 under
  200 words, 0.40 under 500, and 0.35 above 500, with an 80-word
  minimum. The ratio falls with length in all writing, which is why
  the bands are length-adjusted.
- Em dash: published human writing runs about 3.7–10 pause-dashes per
  1,000 words (a Twain-style passage in the corpus measures about
  10 per 1,000 and scores 100). The rule fires above 20 per 1,000,
  with at least 3 pause-dashes. That threshold is the corpus
  calibration with the published human range as supporting evidence,
  not a copy of another tool's threshold.
- Vocabulary: the word lists are drawn from Kobak et al. 2024
  ("Quantifying Large Language Model Usage in Scientific
  Communication Through Excess Vocabulary", arXiv:2406.07016), which
  measured excess vocabulary in more than 15 million PubMed abstracts
  from 2010–2024 and found at least 13.5% of 2024 abstracts were
  LLM-processed (up to 40% in subcorpora), with "delve" used about
  28 times its pre-LLM rate, and from Juzek & Ward 2024/2025
  ("Don't Use a Cannon to Kill a Mosquito: Why an LLM Is Not an
  AI-Text Detector", arXiv:2412.11385), which lists 21 focal words:
  advancements, aligns, boasts, comprehending, delve(d/s/ving),
  emphasizing, garnered, groundbreaking, intricacies, intricate,
  realm, showcases, showcasing, surpasses, surpassing, underscore(s),
  underscoring. The buzzword list adds corporate verb inflation
  (revolutionize, turbocharge, future-proof, top-tier, skyrocket)
  with a clean/slop test for each term. The vocabulary union is 165
  distinct terms; the cliche union is 129 distinct phrases. Every
  term and phrase has a test that checks it fires on a slop frame and
  stays silent on a clean one.
- Only English is checked in P2. The em dash and number rules still
  fire on any text, because dashes and digits are not English, but
  the phrases are. A dash that opens a line of dialogue is not
  counted as a pause in any language. A non-English corpus is not part of this release.

## Limits

- The list is fixed. A phrase that is not on it scores nothing, however
  familiar it sounds. Common machine-made wording outside the
  twenty-eight rules will pass clean. Some paraphrases are caught by
  the lists ("world-changing", "bleeding edge", "powered by AI",
  "AI-driven", "unbelievable", "mind-blowing", "changes the game",
  "in a fast-paced world", "world's best", "best thing ever",
  "five-hundred percent", "10x faster"), and some are caught by the
  shape rules instead — burstiness, type-token ratio, and substance
  do not care which words a draft uses. The rest cannot be caught by
  a pattern checker and pass clean: a bare sentiment with no listed
  word ("I love this product so much"), a "not just X" twist split
  across two sentences with no comma, and a generic call to action
  that names no action ("Click here", "Learn more", "Start now" with
  no object). Those are documented here, not claimed as fixed.
- Splitting a listed phrase, or swapping a character for a lookalike,
  no longer hides it: the draft is normalised before scanning. Dropping
  the part the pattern needs, such as the `%` sign on a number, still
  works around it.
- A number is exempt only with a real citation next to it: a link that
  looks like evidence, starting within 40 characters of the number or
  sitting in the same sentence as the number or the next one, or
  a named publication with a year, with the publication word starting
  within 60 characters. A bare "2024 report" with no outlet named is
  not a citation. A link two sentences away, or a pricing link, does
  not clear a number.
- The structural thresholds are exact, and they are visible here rather
  than hidden: same-length sentences need four in a row within one word
  (or five in a row within two); repeated openings need three in a row;
  adverb density needs three -ly adverbs in one sentence, or two each
  in two adjacent sentences; the rule of three needs two "more"
  triplets, or three adjective triplets, and more than one per 200
  words; transition stacking needs at least half of at least three
  paragraphs; pseudo-wisdom needs at least a third of the sentences
  filler and at least two filler sentences. Writing that varies just
  enough to sit outside a threshold passes clean. The two ratio rules
  (pseudo-wisdom, transition stacking) use an inclusive threshold —
  exactly a third or exactly half fires — while the others use a
  strict one. The rest of the thresholds are still hard cliffs by
  design: a draft one unit under a threshold passes, and one unit
  over it does not.
- Density has a floor: a draft under 50 words is scored as if it were
  50 words, so a one-word draft that contains a listed word ("seamless")
  scores 76. That is the floor working as designed, not a bug — but it
  means a single word on its own is never clean if the word is listed.
- The diversity signals are supporting signals, not verdicts. Burstiness
  is fragile on short drafts, the type-token ratio falls with length in
  all writing, and a repeated bigram can be a legitimate refrain. They
  are calibrated to fire on repetition, but a single one firing on its
  own moves a score by a few points at most. Convergence is the signal:
  several diversity findings together with vocabulary or substance
  findings is what drags a score down.
- The pseudo-wisdom rule is a heuristic approximation of the delete
  test, using a fixed list of stock sentences. A sentence that is
  filler but not on the list passes clean; a sentence on the list that
  is doing real work in context is still flagged when at least a
  third of the passage is filler.
- The substance rules cannot verify truth. A paragraph that names a
  person or a contextual number counts as substantive
  whether the fact is true or not. A date alone does not count, and
  neither does a cause on its own. The rules check that something
  concrete is said, not that it is so.
- The score is density-aware, but it is still penalty only. A draft
  that repeats one pattern many times is scored worse than one that
  says it twice, and a single hit in a short draft costs more than
  the same hit in a long one. Adding clean words dilutes the penalty,
  so a fake-citation variant of a flagged text can score a few points
  higher than the original without any flag being cleared.
- False positives are normal. The common ones are handled — "Explore
  the codebase", a compliance claim that links its audit, known
  acronyms such as NASA — but a single emphasised word can still be
  flagged when it sits next to other capitalised words, and a number
  can still be flagged when its source is too far away to count as a
  citation.
- Only English text is checked. The em dash and number rules still fire
  on any text, because dashes and digits are not English, but the
  phrases are. Layout, images, motion, and code are out of reach. A
  high score is not proof of quality, and a low score is not proof of
  slop.

These limits are part of the method, not footnotes to it. Any change to
the rules should update this document in the same pull request.
