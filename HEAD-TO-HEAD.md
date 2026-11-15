# Head-to-head: sloppy P2 vs slopdetector.org

Date: 2026-11-14. Sloppy scores below were measured through the real
`analyze()` scorer in this copy (P2, 28 rules). SlopDetector scores were measured live in the browser on 2026-11-14, 12:18-12:22 CET, each probe pasted verbatim in order. Scales run opposite ways: sloppy 100 = clean, SlopDetector 100 = sloppiest. No probe scored above 32 on SlopDetector; it labelled 25-32 'LOW SLOP' and lower scores 'Not Slop'. The exact probe texts are
included below so anyone can repeat the comparison: paste each one into
slopdetector.org verbatim — changing a probe changes the test.

## How to read it

- Sloppy scores 0–100, higher is cleaner. SlopDetector scores 0–100
  slop level, higher is sloppier — the scales run opposite ways. To
  compare, read SlopDetector as "100 minus sloppy" only roughly: a
  SlopDetector 80 on a text sloppy scores 20 is agreement; a
  SlopDetector 20 on the same text is a miss.
- The bar for this comparison: sloppy wins or ties on fake claims,
  evasions, and clean-text false positives; sloppy no longer loses on
  vocabulary or diversity probes.
- One honest caveat, measured below: adding clean words to a draft
  dilutes sloppy's density scoring, so a fake-citation variant of a
  text can score a few points higher than the base text without any
  flag being cleared. The flags stay on; the score moves through
  dilution, not through the citation working.

## Results (sloppy P2, measured)

| Probe | Words | Sloppy P2 | Verdict | Rules fired | SlopDetector |
| --- | --- | --- | --- | --- | --- |
 | explore-codebase | 3 | 100 | Clean enough | — | not scored (min 50 chars) | 
 | nasa-fbi | 11 | 100 | Clean enough | — | 2 (dims 0/0/0/0/2) | 
 | soc2-audit | 14 | 100 | Clean enough | — | 0 (dims 0/0/0/0/0) | 
 | server-10000 | 10 | 100 | Clean enough | — | 2 (dims 0/0/0/0/2) | 
 | example-draft | 58 | 9 | Industrial slop | trust-claim, buzzwords, generic-cta, testimonial-cliche, social-proof, hype-punctuation | 30 (dims 20/0/2/3/5) | 
 | repetitive-clean-vocab-86w | 86 | 87 | Mostly clean | burstiness, same-length-sentences | 14 (dims 0/0/6/0/8) | 
 | repetitive-same-words-150w | 150 | 39 | Heavy slop | repeated-bigrams, same-length-sentences, low-ttr, repeated-openings | 23 (dims 0/0/0/15/8) | 
 | fake-number | 20 | 34 | Heavy slop | trust-claim, unsourced-number | 5 (dims 0/0/0/0/5) | 
 | fake-number-plus-fake-citation | 29 | 40 | Heavy slop | trust-claim, unsourced-number | 0 (dims 0/0/0/0/0) | 
 | academic-abstract | 85 | 100 | Clean enough | — | 8 (dims 2/0/4/0/2) | 
 | legal | 83 | 100 | Clean enough | — | 9 (dims 0/0/4/3/2) | 
 | technical-docs | 88 | 100 | Clean enough | — | 5 (dims 0/0/0/0/5) | 
 | literary-dash-200w | 182 | 100 | Clean enough | — | 14 (dims 0/0/4/2/8) | 
 | business-email | 46 | 100 | Clean enough | — | 3 (dims 0/0/3/0/0) | 
 | clean-landing | 49 | 100 | Clean enough | — | 5 (dims 0/0/0/0/5) | 
 | vocab-slop | 36 | 18 | Industrial slop | ai-tells, buzzwords, vague-solution | 32 (dims 20/0/4/0/8) | 
 | dash-slop | 99 | 36 | Heavy slop | em-dash, burstiness, low-ttr, same-length-sentences | 29 (dims 0/0/9/7/13) | 
 | thin-substance | 83 | 40 | Heavy slop | thin-substance, buzzwords, ai-tells | 29 (dims 14/8/4/3/0) | 
 | fake-authority | 16 | 54 | Slop creeping in | fake-authority | 29 (dims 0/15/6/0/8) | 
 | rule-of-three-slop | 31 | 72 | Mostly clean | rule-of-three | 25 (dims 13/0/4/0/8) | 
 | clean-200w-news | 166 | 100 | Clean enough | — | 2 (dims 0/0/2/0/0) | 

Before → after (P1/fix2 baseline → P2), same probe texts:

| Probe | Before | After |
| --- | --- | --- |
| repetitive-clean-vocab-86w | 93 | 87 |
| repetitive-same-words-150w | not measured in P1 | 39 |
| technical-docs | 76 | 100 |
| literary-dash-200w | 66 | 100 |
| business-email | 63 | 100 |
| vocab-slop | 26 | 18 |
| example-draft | 6 | 9 |
| fake-number | 34 | 34 |
| clean corpus (all six texts) | 100 except the three above | 100 |

The example draft moved 6 → 9 because P2 no longer flags its single
trailing dash ("- Jamie, CEO") at em-dash density; it is still
Industrial slop. The fake-number variant moved 15 → 22 under current
scoring (the P2 table above still shows the pre-Stage-3 34 → 40); the
rise is the density change alone — the floor is now the draft's own
length (20 → 29 words) — and the fake citation clears
nothing — the trust-claim and unsourced-number flags are still on.
The old 31 → 40 pair included one hit cleared by the pricing link
(fixed 2026-11-15, F17); the 31 → 34 pair was the old floor
(44 → 50) under F17 (floor and 0.15/0.85 blend changed 2026-11-15,
F21).

## Probe texts (paste verbatim)

### explore-codebase
```
Explore the codebase.
```

### nasa-fbi
```
NASA and the FBI published the joint report in March 2024.
```

### soc2-audit
```
We are SOC 2 compliant. See the audit at https://example.com/reports/soc2-audit-2024 for the full report.
```

### server-10000
```
Last Tuesday the server handled 10,000 requests in one hour.
```

### example-draft
```
Our revolutionary AI-powered platform is the next generation of team collaboration. Built to supercharge your workflow, it helps you leverage synergies and take productivity to the next level. Trusted by 10,000+ teams, we serve 99.9% uptime with enterprise-grade security. Get started today and unlock seamless results for your whole team!! "Honestly, it changed my life." - Jamie, CEO
```

### repetitive-clean-vocab-86w
```
The team met on Monday morning to review the plan. The engineers checked the database before the deploy. The manager wrote the release notes after lunch. The designer updated the homepage with new photos. The support team answered forty tickets during the day. The analysts prepared the weekly report for Friday. The developers fixed three bugs in the checkout flow. The writer drafted the help page for new users. The team shipped the update on Thursday evening. The manager closed the sprint with a short review.
```

### repetitive-same-words-150w
```
The team plans the work every week. The team builds the work every week. The team ships the work every week. The team reviews the work every week. The team plans the next work every week. The team builds the next work every week. The team ships the next work every week. The team reviews the next work every week. The team plans the work and the team builds the work. The team ships the work and the team reviews the work. The team plans the work for the week. The team builds the work for the week. The team ships the work for the week. The team reviews the work for the week. The team plans the work, the team builds the work, the team ships the work, and the team reviews the work. The team plans the work every week and the team ships the work every week.
```

### fake-number
```
Our platform delivers 99.9% uptime and serves 10,000 happy users. We grew 500% last year and our accuracy is 99%.
```

### fake-number-plus-fake-citation
```
Our platform delivers 99.9% uptime and serves 10,000 happy users. We grew 500% last year and our accuracy is 99%, according to a 2024 report. See https://example.com/pricing for details.
```

### academic-abstract
```
We measured sentence-length variation in 412 published essays and 380 machine-generated essays written between January and June 2024. Human essays showed a mean sentence length of 18.4 words with a standard deviation of 11.2 words. Machine-generated essays averaged 17.9 words with a standard deviation of 6.1 words. The difference in variance was significant at p < 0.01. These results suggest that variance, rather than mean length, separates the two groups in this corpus. The dataset and the analysis code are available in the project repository.
```

### legal
```
The Licensor grants the Licensee a non-exclusive, non-transferable licence to use the Software for internal business purposes only. The Licensee shall not sublicense, distribute, or publicly display the Software without the prior written consent of the Licensor. Either party may terminate this Agreement by giving thirty days written notice to the other party. Upon termination, the Licensee shall cease all use of the Software and delete all copies within fourteen days. This Agreement is governed by the laws of the State of California.
```

### technical-docs
```
Install the package with npm install sloppy. Run npx sloppy check draft.txt to score a file. The command prints a score from 0 to 100 and lists every matched phrase with its line number. Use the --json flag to print the result as JSON. The configuration file is sloppy.config.json in the project root. It accepts two keys: rules, a list of rule ids to enable, and threshold, the minimum score that passes the check. Exit code 0 means the draft passed; exit code 1 means it did not.
```

### literary-dash-200w
```
The river was low that summer, and the town kept to the shade after noon. Tom came down to the landing with a fishing pole over his shoulder and a tin pail in his hand, whistling a tune his father had taught him years before, when the mill was still running and the boats still stopped here. He sat on the warm boards and watched the water slide past — slow, brown, and patient — and thought about nothing in particular, which suited him fine. By evening the heat had broken, and the first cool wind off the river smelled of rain — the kind of rain that comes down hard for ten minutes and then stops, leaving the dust settled and the air clean. He walked home past the closed shops and the dark windows of the schoolhouse, counting his steps the way he always did when he had nothing else to count. His mother was waiting on the porch with supper on the table and a look that said she had already heard about the fish he had not caught.
```

### business-email
```
Hi Ana, the invoice for March is attached. The total is 1,240 euros, due on 28 March. Please check the hours on page 2 — I logged 14 hours on the migration and 6 on the review. Let me know if anything looks wrong. Thanks, Marek
```

### clean-landing
```
Paste your draft into the box. The checker lists every matched phrase, shows the rule it broke, and gives a score from 0 to 100. Nothing is uploaded: the whole check runs in your browser. It reads plain text and Markdown. It does not read images, PDFs, or spreadsheets.
```

### vocab-slop
```
Our platform leverages cutting-edge AI to unlock transformative outcomes. Delve into a realm of unparalleled possibilities as we showcase intricate solutions that underscore our commitment to excellence. Furthermore, our meticulous approach garners advancements that surpass expectations.
```

### dash-slop
```
The platform is fast — and it is simple. The team is bold — and the work is clean. The design is bright — and the code is tight. The launch is near — and the users are ready. The price is fair — and the value is clear. The support is kind — and the answers are quick. The roadmap is open — and the future is bright. The data is safe — and the servers are fast. The product is ready — and the market is waiting. The story is simple — and the ending is good.
```

### thin-substance
```
Our platform is truly transformative and it helps teams in amazing ways every single day. It makes every workflow smoother and every meeting shorter.

The key is to find balance and unlock your potential in a fast-paced world. You will feel the difference from the very first day.

Everything works seamlessly together to deliver outstanding results for everyone involved. No other tool does so much for so many people.

In March 2024, the team in Berlin shipped version 2.1 after fixing 14 bugs.
```

### fake-authority
```
Studies have shown that exercise helps. Experts agree that sleep matters. Research suggests that rest helps.
```

### rule-of-three-slop
```
Our platform is efficient, scalable, and reliable. The tool is fast, secure, and simple. The service is modern, smart, and flexible. It makes you more productive, more focused, and more fulfilled.
```

### clean-200w-news
```
The council voted on Tuesday to repair the bridge over the Miller River, a project that has waited three years for funding. Engineers found cracks in two of the support pillars during an inspection last spring, and the state ordered the crossing closed to trucks over ten tonnes. Local shops on the north bank say trade fell by a third while lorries took the long route around the valley. The repair will take fourteen weeks. Work starts in April, when the river is low, and the road will stay open to cars in one direction, controlled by temporary lights. A second crew will resurface the approach road at the same time. The total cost is 2.4 million euros, paid from the regional transport budget. The mayor said the council had chosen the cheapest of three tenders, from a firm based in Linz. Residents can read the full schedule at the town hall, where the plans are pinned to the notice board until the end of March.
```

## Verdict

Sloppy P2 wins the head-to-head. On fake claims it is decisive: fake-number sloppy 34 (Heavy slop) vs SlopDetector 5; fake-number plus a fake citation sloppy 40 vs SlopDetector 0 — the fake citation cleared SlopDetector completely. On obvious slop it is stronger: example-draft sloppy 9 vs SlopDetector 30, vocab-slop 18 vs 32, thin-substance 40 vs 29, repetitive-same-words 39 vs 23. On clean texts both agree they are clean (sloppy 100, SlopDetector 0-14), with SlopDetector slightly noisier on literary/academic/legal (8-14). SlopDetector never called any probe more than LOW SLOP.

## Addendum — 2026-11-14, Stage 3 scoring

The table above is the P2 record and is left as written. Re-running all
21 probes after Stage 3 (windowed peak scoring, adaptive floor,
co-occurrence multiplier): 18 probes score exactly as before. Three
moved, all lower (harsher): fake-number 34 → 31, fake-authority 54 → 47,
repetitive-same-words-150w 39 → 38. No clean probe moved. The
fake-citation pair now reads 31 → 34; the rise is the adaptive floor
growing from 44 to 50 across the pair, and the fake citation clears
nothing — the pricing-link bypass was fixed 2026-11-15 (F17), so the
fake-citation probe moved 40 → 34. The old 31 → 40 pair was the floor
rise plus one unsourced-number hit cleared by the pricing link; the
caveat above that the rise came "solely because the extra words
inflated effectiveWords" was wrong for this pair: the old flat floor
was 50 for both versions, so the old 34 → 40 rise was the cleared
hit alone.
