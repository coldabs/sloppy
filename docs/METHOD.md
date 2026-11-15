# Method

How sloppy scores a draft, in full. Everything here comes from
`src/lib/rules/` (one module per rule group, re-exported by the
`src/lib/rules.ts` barrel) and `src/lib/analyzer.ts`. The page renders its rule
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

## Website mode

Style signals are counted from the CSS the page actually uses, not
from the raw stylesheet text. Each stylesheet rule counts only when
its selector matches an element in the document (checked with the
selector engine, with a class/id/type token fallback for selectors
it cannot evaluate, such as `:hover`); inline `style="..."` attributes
count because the element carrying them exists. Rules inside
`@media print` and `@media speech` do not count, and neither do
`@keyframes` or `@font-face`. That kills the old false positive where
three unused framework utilities, or one rule inside a print block,
fired pill-radius on a page that used none of them — but a real
stylesheet whose classes elements do use still fires exactly as
before.

Tailwind utilities are counted in the DOM as well, from element class
attributes: `rounded-full`, `backdrop-blur-md`, `bg-indigo-600`,
`shadow-2xl` and their kin (including variant-prefixed forms such as
`sm:rounded-full`). Forty elements using `rounded-full` count as
forty pill uses even though the sheet defines the utility once. The
reported total is used-CSS signals plus DOM utility uses, minus the
signals that came from the definition of a utility the DOM already
counted — a Tailwind sheet's one `.rounded-full` definition is not a
forty-first pill. The thresholds did not move: pill radius and glass
surfaces need 3, radial orbs 2, the blue-purple palette 2, the
background grid 1, oversized shadows 3, glow clusters 2.

Colours are read as colours, not strings. The palette rule counts
the ten hex codes and the colour words as before, plus `oklch()` hues
from 250 to 330 with chroma above 0.02 (indigo ~277, violet ~293,
purple ~304, fuchsia ~322; hue exactly 310 counts, as do the alpha
form `oklch(... / 0.5)` and a `deg` suffix), `hsl()` hues from 215
to 330 with saturation above zero (hsl runs on a different hue scale
from oklch — indigo is ~239 there, blue ~217), `rgb()` hues on the
same 215–330 range, and `var(--*)` references resolved from the
custom properties the document defines, including `hsl(var(--primary))`
where the property holds bare channel values. A `var()` named for
indigo, violet, purple or fuchsia counts even when its definition was
not fetched. A grey `oklch()` (zero chroma) or a green `hsl()` hue
does not count. The palette still covers every Tailwind shade from
50 to 950 plus the bare colour (`bg-indigo`).

Dead links are counted, not deduplicated: twenty-five footer links
that all point at `#` are twenty-five dead links. Unnamed controls
and images without alt are counted the same way. The findings list is
still sliced for display — dead links and unnamed controls at 400,
missing alt at 300 — but the count and the penalty reflect every
occurrence found, not just the ones shown: the first shown hit carries
the full count. The three-step rule matches the whole class token `step` (any case)
or `step` plus a number (`step-1`, `step_2`, `step3`); `stepper`,
`step-brother` and `multi-step-form` are not steps. The ordered-list
check is unchanged: a genuine three-item `<ol>` still fires.

Limits of the correlation: selector matching is approximate for
compound selectors (`.a .b` counts when both classes occur somewhere,
not necessarily nested), attribute selectors such as
`[class*="step"]` are assumed used, CSS nesting (`&`) inside a rule
body is not parsed, and a `var()` fallback containing parentheses is
not expanded. Text extraction is unchanged: only `script`, `style`,
`noscript`, `template`, `svg`, `canvas` and `iframe` are removed, so
navigation menus, cookie banners and hidden modals are still mashed
into the copy analysis as if they were prose. That is a known
limitation — there is no visibility engine — not a claim that the
copy text is clean prose.

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
   2.5 times the low weight. The standard penalty is density measured
   twice and blended: once over the whole draft, and once over the
   worst 100-word sliding window (step 25 words), combined as
   0.15 * global + 0.85 * peak, so a sloppy passage cannot be washed
   out by clean filler. A sentence where three or more distinct
   phrase-rule groups fire carries an extra 25% of its apportioned
   penalty share: co-occurring signals in one sentence are one
   concentrated piece of evidence, not independent tells. Only the
   phrase-level groups (voice, claims, actions, format) count;
   document-level rules span whole sentences or paragraphs, so they
   are not sentence-local evidence and take no part in the boost.
2. One hit in a short draft costs far more than the same hit in a long
   one. Short drafts are scored against an adaptive floor,
   min(50, max(8, words)): a draft is judged at its own length, with
   a minimum of 8 words and a cap of 50. A draft under 8 words is too
   short to score — the verdict says so and the number is not
   meaningful (a one-word draft containing a listed word, "seamless",
   carries the "Too short to score" verdict). The old floor
   (min(50, max(12, round(words * 2.2)))) inflated a 21-word draft
   to 46 words, so adding clean words washed a single hit out
   (fixed 2026-11-15, F21).
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
scans as "seamless" while "v2.0" is untouched — unless the separator
sits inside a domain name, file path, or common slash compound, which
stay whole ("nextjs.org", "src/lib/rules.ts", "and/or"). A dash is judged by the
letters that survive normalisation on either side of it, so a
zero-width character next to a hyphen cannot turn a compound word into
a pause. Findings are mapped back to the exact span in the original
text, so the highlighted copy is always what was pasted.

An empty draft scores nothing: the result says "Nothing to score"
instead of calling an empty page clean.

## The rules

Twenty-nine rules, in seven groups.

### Voice

Words that perform confidence instead of naming a capability.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Em dash (`em-dash`) | Medium | Pause-dashes at density only: more than 20 pause-dashes per 1,000 words, and at least 3 of them. One dash in a short note is left alone, and so is dash-heavy literary prose at about 10 per 1,000. Its HTML forms `&mdash;` and `&#8212;` count. En dashes, double hyphens, and spaced hyphens count the same way, because the draft is normalised before scanning. An em dash inside a word is a compound separator, not a pause, and is left alone. So is a dash that is document structure: a list bullet, a line with no words on it (a table separator or horizontal rule), or a dash between two links. A dash that opens a line of dialogue — the French, Russian, and Spanish convention, "— Bonjour" — is a speaker turn, not a pause, and is left alone, and dialogue lines do not count toward same-length sentence runs. A minus sign, as in e^(-penalty / 55), is not a pause either. A command-line flag such as `--json` is not a pause. A pair of dashes that opens and closes one interruption counts once, not twice. | Use a comma, colon, period, or parentheses. |
| Hype vocabulary (`buzzwords`) | Medium | "ai-powered" / "ai powered", "revolutionary", "revolutionize" / "revolutionizing", "next-generation" / "next generation", "cutting-edge" / "cutting edge", "groundbreaking", "unparalleled", "seamless" / "seamlessly", "game-changing" / "game changing" / "game changer" / "game changers", "unleash" / "unleashes" / "unleashed" / "unleashing", "supercharge" / "supercharges" / "supercharged" / "supercharging", "turbocharge" / "turbocharges" / "turbocharged" / "turbocharging", "state-of-the-art" / "state of the art", "best-in-class", "world-class", "industry-leading", "market-leading", "award-winning", "transformative", "disruptive", "synergy" / "synergies", "paradigm shift" / "paradigm shifts", "empower" / "empowers" / "empowered" / "empowering", "effortless" / "effortlessly", "innovative", "turnkey", "leverage" / "leverages" / "leveraged" / "leveraging", "elevate your" / "elevates your" / "elevating your", "take it to the next level", "in today's fast-paced world", "future-proof" / "future proof", "next-level", "top-tier" / "top tier", "unprecedented", "unmatched", "unrivaled" / "unrivalled", "unbeatable", "trailblazing", "skyrocket" / "skyrockets" / "skyrocketed" / "skyrocketing", "one-of-a-kind" / "one of a kind", "second to none" / "second-to-none", "like never before", "like no other", "world-changing" / "world changing", "bleeding edge" / "bleeding-edge", "powered by ai", "ai-driven" / "ai driven", "unbelievable", "mind-blowing" / "mind blowing", "changes the game" / "change the game" / "changing the game", and the split spellings "seam less", "revo lutionary", "ground breaking". Bare "next level" without a hyphen is not flagged — it is also a game level and a level of detail. | Swap in a concrete capability, or delete the word. |
| AI tell phrases (`ai-tells`) | Medium | "delve" / "delves" / "delving" / "delved", "tapestry" / "tapestries", "furthermore", "moreover", "in conclusion", "embark" / "embarks" / "embarking" / "embarked", "realm", "navigate" / "navigates" / "navigating" / "navigated", "it's important to note" / "it is important to note", "worth noting", "dive into", "in today's digital age", "as an AI language model", "welcome to the future of work", "unlock your potential", "unlock your * potential" (one to three words in between, such as "full" or "full true"), "join us on this journey", "showcase" / "showcases" / "showcased" / "showcasing", "underscore" / "underscores" / "underscored" / "underscoring", "intricate" / "intricacies" / "intricacy" / "intricately", "meticulous" / "meticulously", "commendable", "garner" / "garners" / "garnered" / "garnering", "surpass" / "surpasses" / "surpassed" / "surpassing", "boast" / "boasts" / "boasted" / "boasting". The clustered tells — furthermore, moreover, in conclusion, delve, tapestry, navigate, showcase, embark, realm — only count when four or more distinct ones appear in the same draft, because each is ordinary in its home register; the rest fire on their own. A `*` in a phrase matches one to three words, so a modifier inserted into a listed phrase ("unlock your full true potential") no longer breaks detection; a four-word gap does not match. | Delete the phrase, or say what actually happened. |
| AI adjectives (`ai-adjectives`) | Low | "crucial", "pivotal", "foster" / "fosters" / "fostered" / "fostering", "robust", "landscape", "quintessential", "exemplary", "unwavering", "steadfast", "paramount". They only count when three or more distinct ones appear in the same draft, because each is ordinary in its home discipline. | Name the specific quality, or delete the word. |
| Style words in a cluster (`style-words`) | Low | Formal style words that are ordinary on their own — "align" / "aligns" / "aligned" / "aligning", "emphasize" / "emphasise" / "emphasizes" / "emphasises" / "emphasized" / "emphasised" / "emphasizing" / "emphasising", "advancement" / "advancements", "pioneer" / "pioneers" / "pioneered" / "pioneering", "notably" / "notable", "additionally", "consequently", "ultimately", "undoubtedly", "remarkably", "exceptional", "extraordinary", "profound" / "profoundly", "holistic", "invaluable", "indispensable", "comprehensive", "spearhead" / "spearheads" / "spearheaded" / "spearheading", "champion" / "champions" / "championed" / "championing", "orchestrate" / "orchestrates" / "orchestrated" / "orchestrating", "cultivate" / "cultivates" / "cultivated" / "cultivating". They only count when three or more distinct ones appear in the same draft — the clustering, not the word, is the signal. Distinct means distinct lemmas: "align", "aligned", and "aligning" are one term, not three, so one stem in three forms cannot satisfy the cluster on its own. A single term, however often repeated, never fires on its own. | Use the plain word, or say what actually happened. |
| Template opener (`overused-opener`) | Low | "in today's world", "in today's fast-paced world", "in today's online world", "in a world where", "imagine a world", "ever wondered", "we've all been there", "let's face it", "here's the thing", "in an era of", "picture this", "imagine this", "in the digital age", "in the modern world", "in our modern world", "in this day and age", "have you ever", "what if i told you", "the truth is", "listen up", "dear reader", "once upon a time", "it is no secret that", "there is no denying that", "needless to say", "in a fast-paced world" / "in a fast paced world", "in this fast-paced world" / "in this fast paced world" | Start with the claim itself. |
| Template closer (`template-closer`) | Low | "to sum up", "to summarize", "in summary", "in closing", "all in all", "to wrap up", "wrapping up", "in a nutshell", "long story short", "thanks for reading", "stay tuned", "until next time", "that is all", "let me know what you think" | End on the claim itself, or just stop. |
| Not just X, but Y (`not-just`) | Low | The stock cadence "not just X, but Y", where the twist arrives in the same sentence, however long the clause is — or on the next line, when the setup line ends with a comma. "Yet" counts as a twist too. | State the claim once, directly. |
| Hype punctuation (`hype-punctuation`) | Low | Repeated `!` or `?` marks, celebration emoji: fire, rocket, sparkle, party popper, 100, heart-eyes, partying face, raising hands, clapping hands, flexed biceps, party, and glowing star — and the same emoji three or more times in a row. A single ordinary emoji on its own is left alone | Keep one period and let the sentence carry the weight. |

### Claims

Numbers, credentials, and praise that arrive without proof.

| Rule | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| Unsourced number (`unsourced-number`) | Medium | A percentage, a number with a `k`, `m`, or `b` suffix, a spelled-out percentage such as "five hundred percent" or "five-hundred percent", a multiplier claim such as "10x faster", or a large round number used as a selling claim (10,000 happy users, ten thousand teams, 10 million readers), with no source nearby. A percentage only counts when it is a claim — a claim noun or a claim verb nearby, such as "grew" or "uptime" — so a plain measurement such as "The battery is at 50%." is left alone. A number in a reporting sentence is data, not a claim: unemployment, revenue, inflation, or prices with a change verb ("Unemployment increased 2%", "Revenue grew 12%") is left alone. A price statement ("100% FREE") is left alone. A bare or spelled number also needs selling context in its sentence — the seller speaking (we / our / us), a selling verb, or a boast adjective next to the number — so "Over a thousand companies across Germany use it every day" is left alone. A number with a `k`, `m`, or `b` suffix needs hype context too — the seller speaking, or a claim verb in the sentence — so "Revenue was $4.2b", "The study enrolled 10m participants", and "The fund manages $10m in assets" are left alone, while "We serve 10m users" and "We grew to 10m users" still count. A claim noun on its own is not hype context: "The report lists 10m users" is data, not a boast. A number with context — a date, a version, a measurement, "the server handled 10,000 requests" — is left alone | Link the source, or cut the number. |
| Unverified trust claim (`trust-claim`) | High | "SOC 2", "ISO 27001", "GDPR-compliant", "HIPAA-compliant", "enterprise-grade security", "bank-level encryption", "military-grade encryption", "100% secure", "100% uptime", "99.x% uptime" | Link the audit, or remove the claim. |
| Unattributed social proof (`social-proof`) | Medium | "trusted by", "loved by", "used by", "join thousands", "join millions", "join over", "join 10,000", "join the thousands", "loved by millions", "trusted by millions", "used by millions", "join the millions", "loved by thousands", "trusted by thousands" | Name real customers, or delete the line. |
| Testimonial cliche (`testimonial-cliche`) | Medium | "changed my life", "life-changing", "10x our", "best decision we've made", "best decision i've made", "can't imagine", "blown away", "a must-have", "game changer for me", "changed the game", "could not be happier", "couldn't be happier", "highly recommend", "worth every penny", "best purchase ever", "i wish i had found this sooner", "total game-changer" | Quote a named customer with a source, or cut the section. |
| Vague superlative (`vague-superlative`) | Medium | "best tool", "best choice", "ultimate choice", "ultimate tool", "perfect fit", "perfect choice", "best in the world", "best ever", "the very best", "number one", "number 1", "top rated", "top-rated", "highest rated", "most popular", "world's best", "best thing ever" | Say what is actually better, and compared to what. |
| Uncited authority claim (`fake-authority`) | Medium | "studies have shown", "studies show", "studies confirm", "research shows", "research suggests", "research confirms", "experts agree", "experts say", "scientists say", "science says", "data shows", "the data speaks for itself", "it is well known", "it is widely known", "everyone knows", "as we all know", "history shows", "evidence shows", "it has been proven", "doctors recommend". A claim that names its source is left alone: a link that looks like evidence, a named publication with a year, or the person who said it. Any uncited claim fires. | Name the study, the expert, or the number — or cut the claim. |

The unsourced number rule leaves a number alone only with a real
citation. A link counts only when it looks like evidence: its path
carries an evidence word such as report, survey, study, or audit.
Wording next to a bare link does not count — a pricing link with
the word "report" beside it used to clear a hit, and no longer does
(fixed 2026-11-15, F17). A link to a pricing page, a
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
| Urgency and scarcity wording (`urgency-scarcity`) | Low | "while stocks last", "while supplies last", "grab yours", "act now", "don't miss out", "limited time offer", "last chance", "only today", "offer ends" | Drop the deadline, or say when it actually ends. |
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
| Flat sentence rhythm (`burstiness`) | Low | Sentence after sentence landing at almost the same length. Burstiness is the population standard deviation of sentence lengths divided by the mean. It fires below 0.12, with at least 10 sentences, at least 80 words, and a mean sentence length under 26 words. The penalty scales with how far the value sits below the threshold, up to 2.5 times the low weight. | Vary the lengths: shorten one sentence, lengthen another. |
| Narrow vocabulary range (`low-ttr`) | Low | The text keeps reaching for the same words. Moving-average type-token ratio is the mean type-token ratio over every consecutive 100-word window, stepping one word at a time. It fires below 0.60. The penalty scales with how far the ratio sits below the threshold, up to 2.5 times the low weight. It does not fire under 80 words. | Use the specific word for each thing instead of the same few words. |
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
  0.08. The threshold is 0.12, with at least 10 sentences, at least
  80 words, and a mean sentence under 26 words. The mean cap was 16
  until Stage 4, which missed the uniform 18–24-word cadence
  entirely (a ten-sentence run at mean 19.7 with CV 0.099 now
  fires); the minimum run rose from 8 to 10 with it, because eight
  sentences at mean 17.8 with near-zero variance also occur in clean
  filler (STRESS3 C22, eight PAD sentences, CV 0.024, pinned clean).
  A nine-sentence uniform run at mean 20 still escapes — the
  documented cost of keeping C22 clean. No published range was
  used: the ranges detector guides quote disagree with each other,
  and the largest direct measurement puts human academic writing
  at a mean CV of 0.449 (AI rewrites 0.376) across 60,779 paired
  texts (TextPulse Research 2026, "Sentence-Length Burstiness as a
  Cross-Disciplinary and Cross-Model Signal of AI Rewriting") —
  and clean text in this corpus measures 0.17–0.35. The threshold
  was calibrated on the corpus instead. Burstiness is
  fragile: a draft with two long sentences and the rest short can
  measure high while still being repetitive, so the threshold is
  deliberately low and the rule is a supporting signal only.
- Moving-average type-token ratio (MATTR, 100-word windows): the
  mean type-token ratio over every consecutive 100-word window,
  stepping one word at a time. Raw TTR falls as any text gets
  longer, which forced the old step-function bands (0.45 under 200
  words, 0.40 under 500, 0.35 above) and their cliffs at 200/500
  words. MATTR is length-invariant by construction — each window is
  the same size — so repeating varied text does not narrow it: the
  PAD filler measures 0.759 whether it appears once (188 words) or
  twelve times (2,245 words, 0.758), while its raw TTR collapses
  from 0.708 to 0.059. The threshold is 0.60, calibrated on the corpus in
  `src/lib/stage4.test.ts`: clean text measures 0.65–0.86 (binding
  case the academic abstract at 0.685; the legal paragraph at 0.647
  is formal-stripped before measuring, so it never reaches the rule)
  and the repetitive probes 0.12–0.53 (binding case the repeated
  example draft at 0.530). The threshold sits in the gap, nearer the
  clean side, because this is a supporting signal and a false
  positive costs more than a missed repetition. The 80-word minimum
  stands, and the penalty still scales with depth, up to 2.5 times
  the low weight. Global repetition that MATTR no longer sees — the
  same twelve varied sentences repeated — is still caught by
  repeated-bigrams.
- Em dash: published human essays run 0.33–17.12 em dashes per
  1,000 words (mean 3.23, eight essays, 57,232 words; Freeburg
  2026, "The Last Fingerprint", arXiv, March 2026), and a
  Twain-style passage in the corpus measures about 10 per 1,000
  and scores 100. The rule fires above 20 per 1,000 — above the
  highest rate in that sample — with at least 3 pause-dashes. That
  threshold is the corpus calibration with the published human
  range as supporting evidence, not a copy of another tool's
  threshold.
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
  with a clean/slop test for each term. The vocabulary union is 215
  distinct terms; the cliche union is 129 distinct phrases. Every
  term and phrase has a test that checks it fires on a slop frame and
  stays silent on a clean one.
- Only English is checked in P2. The em dash and number rules still
  fire on any text, because dashes and digits are not English, but
  the phrases are. The sentence-rhythm rules (same-length
  sentences, burstiness) do not judge a draft that is likely not
  English — their thresholds are calibrated on English, so a German
  paragraph with a steady rhythm is not flagged for it (fixed
  2026-11-15, F33; the check counts function words in German,
  French, Spanish, Italian, Portuguese, and Dutch against English
  ones). A dash that opens a line of dialogue is not
  counted as a pause in any language. A non-English corpus is not part of this release.

## Scoring constants

The severity weights (high 15, medium 9, low 4), the decay
constant (55), the density saturation (10), the window blend
(0.15 global / 0.85 peak), the adaptive floor (own length, minimum
8, cap 50), and the co-occurrence boost (25%) were measured
against the labelled benchmark corpus (`bench/corpus.jsonl`) in
November 2026, by sweeping each constant and recording the
dev/test precision and recall and the grey-zone agreement
(`bench/CALIBRATION.md` has the full table and the method). The
discriminating metric is the grey zone, not the binary
precision/recall: binary precision/recall stay at 100% over wide
ranges of every constant, so they cannot tell a good constant from
a bad one, while the seven grey entries sit near the 70–89 band
edges and move when a constant changes.

Three constants are pinned by the corpus — each has exactly one
swept value that keeps all seven grey entries in band, bracketed
on both sides by values that push entries out: the low weight 4
(at 2, C11/C23 escape upward to 92–94; at 5, C06/C07/C20/C27
fall to 65–69), the decay 55 (at 45, C06/C07/C27 fall to 65–69;
at 65, C11 escapes to 91), and the density saturation 10 (at 5,
C11 escapes to 90; at 20, C06/C07/C20/C27 fall to 63–69). The
window blend is constrained to peak-heavy (0.75–1.0 keeps 7/7;
0.5–0.65 loses one), and 0.85 sits in the middle of that flat
region. The rest are design choices the corpus cannot
distinguish: high (10–25) and medium (6–15) all keep the
benchmark green, so 15 and 9 are kept for the ordering they
encode; the floor cap (25–100) and the co-occurrence multiplier
(1.0–2.0, including no boost at all) likewise. The minimum
scoreable length 8 is the F21 value, and it is the largest value
that keeps every grey entry scorable (C27, at 11 words, is the
binding case).

The honest limit: the corpus labels were pinned from the scorer's
own output at these constants, so the sweep measures each
constant's margin — how far it can move before a pinned
expectation breaks — not an independent validation. An
independent held-out set (real LLM output vs real human text,
labelled outside this repo) is still missing; with one, the
sweep could be re-run against labels the scorer did not produce.
The grey-zone gate in `bench/bench.test.ts` keeps the
calibration in CI: a constant change that pushes a grey entry out
of its band fails the bench.

## Limits

- The list is fixed. A phrase that is not on it scores nothing, however
  familiar it sounds. Common machine-made wording outside the
  twenty-eight rules will pass clean. Some paraphrases are caught by
  the lists ("world-changing", "bleeding edge", "powered by AI",
  "AI-driven", "unbelievable", "mind-blowing", "changes the game",
  "in a fast-paced world", "world's best", "best thing ever",
  "five-hundred percent", "10x faster", "unlock your full true
  potential", "tapestries", "unleashed", "skyrocketed"), and some
  are caught by the shape rules instead — burstiness, MATTR, and
  substance do not care which words a draft uses. The rest cannot be
  caught by a pattern checker and pass clean: a bare sentiment with
  no listed word ("I love this product so much") and a "not just X"
  twist split across two sentences with no comma. Those are
  documented here, not claimed as fixed. (An earlier version of this
  paragraph also listed standalone generic calls to action — "Click
  here", "Learn more", "Start now" with no object — as passing
  clean. That was stale: they fire, unless they point at the
  documentation or sit on a heading line.)
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
- Density has an adaptive floor: a draft is scored at its own length,
  min(50, max(8, words)) — so a one-word draft is judged as 8 words,
  not 50. A draft under 8 words is too short to score: the verdict
  says so and the number is not meaningful. A single word on its own
  is never clean if the word is listed, but the verdict is "Too short
  to score", not a band. Below 50 words the floor is the draft's own
  length, so adding words to a short draft raises its score by honest
  density even when nothing is cleared; the floor caps at 50, so the
  effect ends at 50 words.
- The diversity signals are supporting signals, not verdicts. Burstiness
  is fragile on short drafts, MATTR can stay high when varied
  sentences repeat (that repetition is the repeated-bigram rule's
  job), and a repeated bigram can be a legitimate refrain. They
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
  the same hit in a long one. Adding clean words still softens the
  global term, but the peak 100-word window holds the worst passage:
  a 49-word sloppy hero scores 9 alone and 25 with 1,000 clean words
  appended (penalty 135.09 to 76.13), where the old global-only
  scoring let it rise to 79. A fake-citation variant of a flagged text
  can still score higher than the original — the literal HEAD-TO-HEAD
  pair moves 15 to 22 — but not through dilution and not through a
  cleared hit: the floor is the draft's own length (20 to 29 words
  across that pair), and the fake citation clears nothing (the rule
  still fires, with all three unsourced-number hits). Before the F17
  fix the pair moved 31 to 40, because the pricing link cleared one
  hit whenever the word "report" sat beside it; under the old floor
  the pair was 31 to 34. At or above the 50-word floor cap, with
  the same hits, added words alone change nothing.
- False positives are normal. The common ones are handled — "Explore
  the codebase", a compliance claim that links its audit, known
  acronyms such as NASA — but a single emphasised word can still be
  flagged when it sits next to other capitalised words, and a number
  can still be flagged when its source is too far away to count as a
  citation.
- Only English text is checked. The em dash and number rules still fire
  on any text, because dashes and digits are not English, but the
  phrases are. The sentence-rhythm rules do not judge a draft that
  is likely not English (F33). Layout, images, motion, and code are out of reach. A
  high score is not proof of quality, and a low score is not proof of
  slop.

These limits are part of the method, not footnotes to it. Any change to
the rules should update this document in the same pull request.
