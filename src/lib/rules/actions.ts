// Actions — labels that hide what the click actually does.

import {
  matchPhrases,
  sentenceIndexAt,
  sentenceSpans,
  wordsIn,
  type RawMatch,
  type RuleDefinition,
} from './common'

// Words that make "explore" and "discover" documentation navigation
// rather than a sales button: Explore the codebase, Explore the API.
const DOCS_NOUNS = new Set([
  'codebase',
  'code',
  'docs',
  'documentation',
  'repository',
  'repo',
  'api',
  'reference',
  'examples',
  'example',
  'source',
  'guide',
  'contributing',
  'changelog',
  'readme',
  'tutorial',
  'handbook',
  'wiki',
  'sdk',
  'cli',
])

// A "get started" that is followed by a command is an instruction,
// not a sales button: "To get started, run npm install."
const CODE_COMMAND =
  /\b(?:npm|yarn|pnpm|pip|bun)\s+(?:install|run|start|build|test|add|init)\b|\brun\s+(?:npm|yarn|node|docker|git|npx)\b|\bgit\s+clone\b/i

const genericCta = (text: string): RawMatch[] => {
  const base = matchPhrases([
    'get started',
    'learn more',
    'try now',
    'try it now',
    'explore',
    'discover',
    'click here',
    'read more',
    'sign up today',
    'sign up',
    'sign up to continue',
    'start now',
    'start your free trial',
    'start a free trial',
    'find out more',
    'buy now',
    'subscribe today',
    'subscribe now',
    'subscribe',
    'download it free',
    'download now',
    'download free',
    'download',
    'book a demo',
    'get a quote',
  ])(text)
  const spans = sentenceSpans(text)
  return base.filter((match) => {
    const matched = text.slice(match.start, match.end).toLowerCase()
    // A call to action on a heading line is a label, not sales copy in
    // a paragraph: a markdown heading ("## GET STARTED") or a short
    // line of capitalised words with no sentence terminator ("GET
    // STARTED"). A mixed-case line with no terminator, such as "Get
    // started today", is still a call to action, not a heading, so it
    // is not exempt. A real sentence keeps its period, so it is not
    // exempt either.
    const lineStart = text.lastIndexOf('\n', match.start - 1) + 1
    const nextNewline = text.indexOf('\n', match.end)
    const lineEnd = nextNewline === -1 ? text.length : nextNewline
    const line = text.slice(lineStart, lineEnd).trim()
    const lineWords = line.split(/\s+/).filter(Boolean)
    const headingLine =
      !/[.!?]/.test(line) &&
      (/^#+\s/.test(line) ||
        (lineWords.length >= 1 &&
          lineWords.length <= 5 &&
          lineWords.every((word) => /^[A-Z0-9][A-Z0-9'’\-:]*$/.test(word))))
    if (headingLine) return false
    const sentenceIndex = sentenceIndexAt(spans, match.start)
    const sentence = spans[sentenceIndex]
    if (!sentence) return true
    const body = text.slice(sentence.start, sentence.end)
    if (
      matched === 'explore' ||
      matched === 'discover' ||
      matched === 'learn more' ||
      matched === 'click here'
    ) {
      const after = body.slice(match.end - sentence.start)
      const words = wordsIn(after).slice(0, 4)
      if (words.some((word) => DOCS_NOUNS.has(word))) return false
    }
    if (matched === 'get started' && CODE_COMMAND.test(body)) return false
    return true
  })
}

// Words that make "solutions" a maths term rather than a product noun:
// "Find all solutions to the equation." The check looks at the
// sentence itself and the one before it, so "There are two solutions."
// in the sentence after the equation is covered too.
// Words that make "solutions" a literal domain term rather than
// a product noun: "the aqueous solutions were heated", "a storage
// solution for the backups" (F26). Same sentence-or-previous check
// as MATH_WORDS. "storage" is the risky one — "we offer storage
// solutions" is a product pitch — but the audit's literal use is
// the same shape, so the collocation wins and the pitch goes
// unflagged; the rest of a pitch still has plenty of signals.
const SOLUTION_DOMAIN_WORDS = new Set([
  'aqueous',
  'saline',
  'buffer',
  'chemical',
  'solvent',
  'molar',
  'storage',
])

const MATH_WORDS = new Set([
  'equation',
  'solve',
  'solves',
  'solving',
  'solved',
  'proof',
  'theorem',
  'derivative',
  'integral',
  'matrix',
  'matrices',
  'polynomial',
  'variable',
  'function',
  'calculate',
  'calculates',
  'algebra',
  'calculus',
  'geometry',
  'arithmetic',
  'formula',
  'compute',
  'computes',
])

// Scarcity and urgency sales wording — "while stocks last", "act
// now", "don't miss out". The website scanner already flags the same
// family of phrases on landing pages (siteRules.ts); the copy engine
// did not, so a one-sentence sales blast scored clean. Low severity:
// the phrases are salesy, not deceptive on their own.
const URGENCY_PHRASES = [
  'while stocks last',
  'while supplies last',
  'grab yours',
  'act now',
  "don't miss out",
  'limited time offer',
  'last chance',
  'only today',
  'offer ends',
]

const vagueSolution = (text: string): RawMatch[] => {
  const base = matchPhrases([
    'solutions',
    'solution for',
    'solutions for',
    'all-in-one',
    'one-stop shop',
    'everything you need',
    'end-to-end',
    'does it all',
  ])(text)
  const spans = sentenceSpans(text)
  return base.filter((match) => {
    if (!text.slice(match.start, match.end).toLowerCase().includes('solution')) {
      return true
    }
    const sentenceIndex = sentenceIndexAt(spans, match.start)
    for (const index of [sentenceIndex, sentenceIndex - 1]) {
      if (index < 0 || index >= spans.length) continue
      const body = text.slice(spans[index].start, spans[index].end)
      if (
        wordsIn(body).some(
          (word) => MATH_WORDS.has(word) || SOLUTION_DOMAIN_WORDS.has(word),
        )
      )
        return false
    }
    return true
  })
}

export const actionsRules: RuleDefinition[] = [
  {
    id: 'generic-cta',
    label: 'Generic call to action',
    group: 'actions',
    severity: 'medium',
    note: 'The label tells you nothing about what happens next. "Explore the codebase" and "To get started, run npm install" are instructions, not sales buttons, and are left alone — as are "Learn more" and "Click here" when they point at the documentation, and a call to action that sits on a heading line.',
    fix: "Name the action: 'Paste your draft', 'See the rules'.",
    scan: genericCta,
  },
  {
    id: 'urgency-scarcity',
    label: 'Urgency and scarcity wording',
    group: 'actions',
    severity: 'low',
    note: 'Deadline and scarcity phrases that pressure the reader instead of making a case: while stocks last, act now, only today. The website scanner flags the same family on landing pages.',
    fix: 'Drop the deadline, or say when it actually ends.',
    scan: matchPhrases(URGENCY_PHRASES),
  },
  {
    id: 'vague-solution',
    label: 'Vague product noun',
    group: 'actions',
    severity: 'low',
    note: "A 'solution' or 'platform' names no job that anyone needs done. The word in a maths sentence, such as 'solutions to the equation', is left alone.",
    fix: 'Name the specific task the product performs.',
    scan: vagueSolution,
  },
]
