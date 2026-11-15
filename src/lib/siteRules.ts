import type { Severity } from './rules'

export type SiteGroup = 'structure' | 'style'

export interface SiteHit {
  excerpt: string
  count?: number
}

export interface SiteRuleMeta {
  id: string
  label: string
  group: SiteGroup
  severity: Severity
  note: string
  fix: string
}

export interface SiteRule extends SiteRuleMeta {
  detect: (context: SiteContext) => SiteHit[]
}

export interface SiteContext {
  doc: Document
  css: string
  text: string
  url: string
}

export const siteGroupMeta: Record<SiteGroup, { label: string; blurb: string }> = {
  structure: {
    label: 'Structure',
    blurb: 'Markup and content decisions that a static fetch can see.',
  },
  style: {
    label: 'Style signals',
    blurb:
      'Repeated CSS choices, counted instead of judged one declaration at a time.',
  },
}

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim()

const excerpt = (value: string, limit = 100) => {
  const text = collapse(value)
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}\u2026` : text
}

const textOf = (element: Element | null) => collapse(element?.textContent ?? '')

// A rule that can fire hundreds of times (dead links, unnamed controls,
// missing images) counts every occurrence it found, but only shows the
// first `cap` hits in the findings list, so the panel stays readable.
// The convention that makes the two agree: the first shown hit carries
// the full count, and every other shown hit carries count 0, so the
// sum over hits — which is how analyzeSite computes occurrences and
// the penalty — is the true total, not the number displayed. A rule
// whose total fits under the cap returns plain hits (count undefined,
// meaning 1 each) and is unaffected.
const sliceForDisplay = (hits: SiteHit[], cap: number): SiteHit[] => {
  if (hits.length <= cap) return hits
  const shown = hits.slice(0, cap)
  shown[0] = { ...shown[0], count: hits.length }
  for (let i = 1; i < shown.length; i++) {
    shown[i] = { ...shown[i], count: 0 }
  }
  return shown
}

const HIDDEN_TEXT_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
])

// Whether an element hides its subtree from a reader: the `hidden`
// attribute, aria-hidden, or an inline display:none /
// visibility:hidden (F38). Class-based hiding cannot be judged
// without a visibility engine — a stylesheet's `.hidden` is not
// visible to this check, and that limit is stated in METHOD.md.
const isHiddenElement = (element: Element): boolean => {
  if (element.hasAttribute('hidden')) return true
  if (element.getAttribute('aria-hidden') === 'true') return true
  for (const decl of declarationsOf(element.getAttribute('style') ?? '')) {
    if (decl.property === 'display' && decl.value === 'none') return true
    if (
      decl.property === 'visibility' &&
      (decl.value === 'hidden' || decl.value === 'collapse')
    ) {
      return true
    }
  }
  return false
}

const visibleText = (doc: Document) => {
  if (!doc.body) return ''
  // Walk the tree instead of cloning it (F38): a hidden subtree is
  // skipped at its root, so hidden modals, cookie banners, and
  // off-screen boilerplate never reach the copy analysis. Text nodes
  // join with no separator, exactly like the textContent the old
  // clone produced, so visible copy counts identically.
  const parts: string[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? '')
      return
    }
    if (node.nodeType !== 1) return
    const element = node as Element
    if (
      HIDDEN_TEXT_TAGS.has(element.tagName.toLowerCase()) ||
      isHiddenElement(element)
    ) {
      return
    }
    for (const child of Array.from(element.childNodes)) walk(child)
  }
  walk(doc.body)
  return collapse(parts.join(''))
}

const accessibleName = (doc: Document, element: Element) => {
  const ariaLabel = element.getAttribute('aria-label')?.trim()
  if (ariaLabel) return ariaLabel

  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    // aria-labelledby takes a space-separated list of ids, and the
    // accessible name is their text joined (F39): passing the whole
    // string to getElementById looked for an id containing a space,
    // which cannot exist, so every multi-id control was wrongly
    // flagged unnamed. An id that does not exist is skipped.
    const text = labelledBy
      .split(/\s+/)
      .map((id) => textOf(doc.getElementById(id)))
      .filter(Boolean)
      .join(' ')
    if (text) return text
  }

  const text = textOf(element)
  if (text) return text

  if (element instanceof HTMLInputElement && element.value.trim()) {
    return element.value.trim()
  }

  const image = element.querySelector('img[alt]')
  const alt = image?.getAttribute('alt')?.trim()
  if (alt) return alt

  return element.getAttribute('title')?.trim() ?? ''
}

const deadLinks = (context: SiteContext): SiteHit[] => {
  const hits: SiteHit[] = []
  // No dedupe by href, and no slicing before counting: twenty-five
  // footer links that all point at "#" are twenty-five dead links, not
  // one. The display list is sliced afterwards (see sliceForDisplay),
  // so the count and penalty still reflect every link found.
  const links = Array.from(context.doc.querySelectorAll('a[href]'))

  for (const link of links) {
    const raw = link.getAttribute('href')?.trim() ?? ''
    if (!raw) continue

    let dead = false
    if (raw === '#' || /^javascript:/i.test(raw)) {
      dead = true
    } else if (raw.startsWith('#') && raw.length > 1) {
      let id = raw.slice(1)
      try {
        id = decodeURIComponent(id)
      } catch {
        id = raw.slice(1)
      }
      dead = context.doc.getElementById(id) === null
    }

    if (!dead) continue
    const label = textOf(link) || accessibleName(context.doc, link) || '(no label)'
    hits.push({ excerpt: `${excerpt(label, 40)} points to ${raw}` })
  }

  return sliceForDisplay(hits, 400)
}

const unnamedControls = (context: SiteContext): SiteHit[] => {
  const hits: SiteHit[] = []
  const controls = Array.from(
    context.doc.querySelectorAll('button, a[href], input[type="submit"], input[type="button"]'),
  )

  for (const control of controls) {
    if (control.getAttribute('aria-hidden') === 'true') continue
    if (accessibleName(context.doc, control)) continue
    const tag = control.tagName.toLowerCase()
    hits.push({ excerpt: `<${tag}> has no text, aria-label, or image alt` })
  }

  // Count first, slice for display: see sliceForDisplay.
  return sliceForDisplay(hits, 400)
}

const missingAlt = (context: SiteContext): SiteHit[] => {
  const hits: SiteHit[] = []
  const images = Array.from(context.doc.querySelectorAll('img'))

  for (const image of images) {
    if (image.hasAttribute('alt')) continue
    if (image.getAttribute('aria-hidden') === 'true') continue
    const source = image.getAttribute('src')?.trim() || '(no src)'
    hits.push({ excerpt: `Image without alt: ${excerpt(source, 60)}` })
  }

  // Count first, slice for display: see sliceForDisplay.
  return sliceForDisplay(hits, 300)
}

const headingOrder = (context: SiteContext): SiteHit[] => {
  const hits: SiteHit[] = []
  const headings = Array.from(context.doc.querySelectorAll('h1, h2, h3, h4, h5, h6'))
  const h1Count = headings.filter((heading) => heading.tagName === 'H1').length

  if (h1Count === 0) {
    hits.push({ excerpt: 'The page has no h1 heading.' })
  } else if (h1Count > 1) {
    hits.push({ excerpt: `The page has ${h1Count} h1 headings.` })
  }

  let previous = 0
  for (const heading of headings) {
    const level = Number(heading.tagName.slice(1))
    if (previous > 0 && level > previous + 1) {
      hits.push({
        excerpt: `Heading jumps from h${previous} to h${level}: ${excerpt(textOf(heading), 50)}`,
      })
    }
    previous = level
  }

  return hits
}

const templateSignals = [
  { key: 'trusted-by bar', pattern: /trusted by|used by|loved by/i },
  { key: 'how it works', pattern: /how it works/i },
  { key: 'testimonials', pattern: /testimonials?|what .* say/i },
  { key: 'pricing', pattern: /pricing|plans and pricing/i },
  { key: 'faq', pattern: /faq|frequently asked/i },
  { key: 'feature grid', pattern: /features|everything you need/i },
]

const templateStack = (context: SiteContext): SiteHit[] => {
  const found = templateSignals
    .filter((signal) => signal.pattern.test(context.text))
    .map((signal) => signal.key)
  if (found.length < 3) return []
  return [
    {
      excerpt: `This page uses ${found.length} usual landing-page sections: ${found.join(', ')}.`,
      count: found.length,
    },
  ]
}

const trustLogoBar = (context: SiteContext): SiteHit[] => {
  const labels = Array.from(
    context.doc.querySelectorAll('p, span, h1, h2, h3, h4, div'),
  ).filter((element) => /trusted by|used by|loved by/i.test(textOf(element)))

  for (const label of labels) {
    const zone =
      label.closest('section, header, footer') ?? label.parentElement ?? label
    const marks = zone.querySelectorAll('img, svg').length
    if (marks >= 3) {
      return [
        {
          excerpt: `"${excerpt(textOf(label), 60)}" sits beside ${marks} logo images.`,
          count: marks,
        },
      ]
    }
  }

  return []
}

const threeSteps = (context: SiteContext): SiteHit[] => {
  const headings = Array.from(
    context.doc.querySelectorAll('h1, h2, h3, h4'),
  ).filter((heading) => /how it works|the process|how it's done/i.test(textOf(heading)))

  for (const heading of headings) {
    const section = heading.closest('section, div')
    if (!section) continue
    const ordered = section.querySelectorAll('ol > li').length
    // A "step" class is the whole class token `step` (any case), or
    // `step` plus a number (`step-1`, `step_2`, `step3`). Substring
    // matching is wrong here: `stepper`, `step-brother` and
    // `multi-step-form` are not steps, and neither is a token that
    // merely contains "step" next to another word. Splitting a token
    // on hyphens would still match `multi-step-form` and
    // `step-brother`, so the token itself — not its hyphen segments —
    // has to be `step` or `step-<number>`.
    const stepBlocks = Array.from(section.querySelectorAll('[class]')).filter((node) =>
      (node.getAttribute('class') ?? '')
        .split(/\s+/)
        .some((token) => /^step(?:[-_]?\d+)?$/i.test(token)),
    ).length
    const steps = ordered || stepBlocks
    if (steps === 3) {
      return [
        {
          excerpt: `"${excerpt(textOf(heading), 50)}" is exactly three steps.`,
          count: 3,
        },
      ]
    }
  }

  return []
}

const urgencyPattern =
  /limited time|only \d+ (?:spots|seats|left)|offer ends|act now|today only|last chance|while supplies last/gi

const fakeUrgency = (context: SiteContext): SiteHit[] => {
  const hits: SiteHit[] = []
  for (const match of context.text.matchAll(urgencyPattern)) {
    hits.push({ excerpt: excerpt(match[0], 60) })
  }
  return hits
}

const placeholderCopy = (context: SiteContext): SiteHit[] => {
  const hits: SiteHit[] = []
  const pattern = /lorem ipsum|dolor sit amet|consectetur adipiscing/gi
  for (const match of context.text.matchAll(pattern)) {
    hits.push({ excerpt: excerpt(match[0], 60) })
  }
  return hits
}

const skeletonBlocks = (context: SiteContext): SiteHit[] => {
  const nodes = Array.from(
    context.doc.querySelectorAll(
      '[class*="skeleton"], [class*="Skeleton"], [aria-busy="true"]',
    ),
  ).filter((node) => !node.matches('input, textarea'))
  if (nodes.length === 0) return []
  return [
    {
      excerpt: `${nodes.length} skeleton or loading blocks appear in the markup.`,
      count: nodes.length,
    },
  ]
}

const genericFaq = (context: SiteContext): SiteHit[] => {
  const hits: SiteHit[] = []
  const pattern =
    /is my data secure|can i cancel anytime|do you offer a free trial|how does it work\?/gi
  for (const match of context.text.matchAll(pattern)) {
    hits.push({ excerpt: excerpt(match[0], 70) })
  }
  return hits
}

const popularBadge = (context: SiteContext): SiteHit[] => {
  if (!/most popular/i.test(context.text)) return []
  if (!/pricing|per month|per seat|\$\d/i.test(context.text)) return []
  return [{ excerpt: 'A pricing section highlights a "most popular" tier.' }]
}

const pageTitle = (context: SiteContext): SiteHit[] => {
  const title = collapse(context.doc.title)
  if (!title) return [{ excerpt: 'The page has no title element.' }]
  if (title.length > 65) {
    return [
      {
        excerpt: `The title is ${title.length} characters: ${excerpt(title, 55)}`,
      },
    ]
  }
  return []
}

const metaDescription = (context: SiteContext): SiteHit[] => {
  const meta = context.doc.querySelector('meta[name="description"]')
  const description = collapse(meta?.getAttribute('content') ?? '')
  if (!description) {
    return [{ excerpt: 'No meta description is set.' }]
  }
  if (description.length > 170) {
    return [{ excerpt: `The meta description is ${description.length} characters long.` }]
  }
  return []
}

// ---------------------------------------------------------------------------
// DOM-correlated CSS (Stage 5, parser hardened in F35/F36/F37)
//
// The style rules used to regex-grep the raw stylesheet text: a Tailwind
// sheet defines `.rounded-full` once, so forty `rounded-full` elements
// counted as one declaration and never fired, while three unused
// framework utilities counted as three hits on a page that used none
// of them. The helpers below correlate CSS with the DOM instead:
//
// * The stylesheet is parsed into rules (selector + declarations),
//   recursing into @media/@supports/@layer/@container blocks and
//   skipping @media print/speech, @keyframes and @font-face. A rule
//   only counts when its selector matches an element in the document
//   — checked with querySelector, with a class/id/type token fallback
//   for selectors the engine cannot evaluate (pseudo-classes and the
//   like). Inline `style="..."` attributes count as used by
//   definition: the element carrying them exists.
// * Tailwind utilities are counted in the DOM as well, from
//   element class attributes: `rounded-full`, `backdrop-blur-md`,
//   `bg-indigo-600`, `shadow-2xl` and their kin. The reported total
//   is used-CSS signals + DOM utility uses, minus the signals that
//   came from the definition of a utility the DOM already counted
//   (a Tailwind sheet's one `.rounded-full` definition is not a
//   forty-first pill). That keeps the count at the number of
//   surfaces, not definitions plus surfaces.
// * Colour values are read as colours, not strings: oklch()/hsl()/
//   rgb() hues, hex codes and keywords, and var(--*) references
//   resolved from the custom properties the document actually defines
//   (plus var() names that say indigo/violet/purple/fuchsia even
//   when the definition was not fetched).
//
// Limits, stated honestly: selector matching is approximate for
// compound selectors (`.a .b` counts when both classes occur
// somewhere, not necessarily nested), bare attribute selectors with
// no class/id/type token are not counted (F37), CSS nesting (`&`)
// is flattened into the enclosing selector (F35), and a var()
// fallback containing parentheses is not expanded. None of these
// changes whether a rule fires on the probe pages in stage5.test.ts.
// ---------------------------------------------------------------------------

interface ParsedCssRule {
  selector: string
  body: string
}

interface DomIndex {
  classes: Set<string>
  ids: Set<string>
  tags: Set<string>
  classedElements: Element[]
}

interface ParsedCss {
  rules: ParsedCssRule[]
  customProperties: Map<string, string>
  selectorUsedCache: Map<string, boolean>
  domIndex: DomIndex | null
}

const parsedCssCache = new WeakMap<SiteContext, ParsedCss>()

// String-aware comment stripping (F35): the old regex
// (`/\/\*[\s\S]*?\*\//g`) stripped from a `/*` inside a quoted string
// to the next real comment's `*/`, eating declarations in between.
// Strings are copied verbatim (backslash escapes honoured); only a
// `/*` outside a string opens a comment.
export const stripCssComments = (css: string): string => {
  let out = ''
  let i = 0
  const n = css.length
  while (i < n) {
    const ch = css[i]
    if (ch === '"' || ch === "'") {
      const start = i
      i++
      while (i < n) {
        if (css[i] === '\\') {
          i += 2
          continue
        }
        if (css[i] === ch) {
          i++
          break
        }
        i++
      }
      out += css.slice(start, i)
      continue
    }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    out += ch
    i++
  }
  return out
}

// Skip a quoted string starting at `i` (which points at the opening
// quote) and return the index just past its closing quote.
const skipCssString = (text: string, i: number): number => {
  const quote = text[i]
  let j = i + 1
  const n = text.length
  while (j < n) {
    if (text[j] === '\\') {
      j += 2
      continue
    }
    if (text[j] === quote) return j + 1
    j++
  }
  return n
}

// Index of the `}` closing the block opened at `open`, skipping
// braces inside quoted strings. -1 when the block never closes.
const findMatchingBrace = (text: string, open: number): number => {
  let depth = 0
  let i = open
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (ch === '"' || ch === "'") {
      i = skipCssString(text, i)
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

// Split a selector list on commas outside parentheses, brackets, and
// quotes, so `:is(.a, .b)` and `[data-label="a, b"]` stay whole.
const splitSelectorList = (selector: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (quote) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i))
      start = i + 1
    }
  }
  parts.push(selector.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

// Combine a nested selector with its parent: `&` is replaced by the
// parent, a selector without `&` becomes a descendant of it. Selector
// lists cross-multiply (`.a, .b` nesting `&:hover, .c` gives four).
const combineSelectors = (parent: string, child: string): string => {
  const parents = splitSelectorList(parent)
  const children = splitSelectorList(child)
  const out: string[] = []
  for (const p of parents) {
    for (const c of children) {
      out.push(c.includes('&') ? c.split('&').join(p) : `${p} ${c}`)
    }
  }
  return out.join(', ')
}

interface NestedCssBlock {
  selector: string
  body: string
}

// Split a rule body into its own declarations and its nested rule
// blocks. The text before a nested `{` can hold declarations as well
// as the nested selector (`color: red; & .inner { ... }`), so the
// selector is the text after the last `;` in that stretch.
const splitRuleBody = (body: string): { declarations: string; nested: NestedCssBlock[] } => {
  const nested: NestedCssBlock[] = []
  const declParts: string[] = []
  let i = 0
  const n = body.length
  let segmentStart = 0
  while (i < n) {
    const ch = body[i]
    if (ch === '"' || ch === "'") {
      i = skipCssString(body, i)
      continue
    }
    if (ch === '{') {
      const segment = body.slice(segmentStart, i)
      const lastSemi = segment.lastIndexOf(';')
      const selector = (lastSemi === -1 ? segment : segment.slice(lastSemi + 1)).trim()
      if (lastSemi !== -1) declParts.push(segment.slice(0, lastSemi + 1))
      const close = findMatchingBrace(body, i)
      const end = close === -1 ? n : close
      if (selector) nested.push({ selector, body: body.slice(i + 1, end) })
      i = end + 1
      segmentStart = i
      continue
    }
    i++
  }
  declParts.push(body.slice(segmentStart))
  return { declarations: declParts.join(''), nested }
}

const GROUPING_AT_RULES = new Set(['@media', '@supports', '@layer', '@container', '@scope'])

const atRuleName = (selector: string) => selector.split(/\s/, 1)[0].toLowerCase()

// The desktop viewport @media is evaluated against (F36): a 1280x800
// landscape screen, light colour scheme, no reduced-motion
// preference, hover and a fine pointer. A rule inside a query that
// does not match this viewport is not what a desktop visitor sees,
// so it is not counted — a mobile-only layout or a dark-mode
// override no longer inflates the desktop style signals. A query
// that cannot be judged (an unknown feature or unit) is treated as
// matching: rules are only dropped on a positive mismatch, never on
// a guess.
const DESKTOP_MEDIA = {
  width: 1280,
  height: 800,
  'device-width': 1280,
  'device-height': 800,
  orientation: 'landscape',
  'prefers-color-scheme': 'light',
  'prefers-reduced-motion': 'no-preference',
  hover: 'hover',
  'any-hover': 'hover',
  pointer: 'fine',
  'any-pointer': 'fine',
  color: 8,
  monochrome: 0,
  scan: 'progressive',
  update: 'fast',
  'overflow-block': 'scroll',
  'overflow-inline': 'scroll',
} as const

type TriState = boolean | null

const and3 = (a: TriState, b: TriState): TriState =>
  a === false || b === false ? false : a === null || b === null ? null : true

const or3 = (a: TriState, b: TriState): TriState =>
  a === true || b === true ? true : a === null || b === null ? null : false

const mediaLengthPx = (value: string): number | null => {
  const match = /^(-?\d+(?:\.\d+)?)(px|em|rem)?$/.exec(value.trim().toLowerCase())
  if (!match) return null
  const num = Number(match[1])
  if (match[2] === 'em' || match[2] === 'rem') return num * 16
  return num
}

const compareMedia = (op: string, left: number, right: number): boolean => {
  switch (op) {
    case '<':
      return left < right
    case '<=':
      return left <= right
    case '>':
      return left > right
    case '>=':
      return left >= right
    case '=':
      return left === right
    default:
      return false
  }
}

// One parenthesised media feature, e.g. "max-width: 600px" or
// "width >= 600px". Null when the feature cannot be judged.
const mediaFeatureMatches = (feature: string): TriState => {
  const text = feature.trim()
  if (!text) return null
  // Range syntax: "600px <= width < 1200px", "width >= 600px".
  const rangeParts = text.split(/\s+/).filter(Boolean)
  const isRange =
    rangeParts.length >= 3 &&
    (rangeParts.includes('<') ||
      rangeParts.includes('<=') ||
      rangeParts.includes('>') ||
      rangeParts.includes('>=') ||
      rangeParts.includes('='))
  if (isRange) {
    // A range is a chain of operands joined by operators:
    // "width >= 600px" or "600px <= width < 1200px". Anything else
    // shaped is unjudgeable. An operand is a length or a known
    // feature name; an unknown name makes its comparison unknown.
    const isOp = (t: string) => t === '<' || t === '<=' || t === '>' || t === '>=' || t === '='
    const ops = rangeParts.filter(isOp)
    const operands = rangeParts.filter((t) => !isOp(t))
    if (operands.length < 2 || operands.length > 3 || ops.length !== operands.length - 1) {
      return null
    }
    const valueOf = (operand: string): number | null => {
      const length = mediaLengthPx(operand)
      if (length !== null) return length
      const desktop = desktopMediaLength(operand)
      return Number.isNaN(desktop) ? null : desktop
    }
    let result: TriState = true
    for (let k = 0; k < ops.length; k++) {
      const left = valueOf(operands[k])
      const right = valueOf(operands[k + 1])
      result = and3(
        result,
        left === null || right === null ? null : compareMedia(ops[k], left, right),
      )
    }
    return result
  }

  const colon = text.indexOf(':')
  if (colon !== -1) {
    const rawName = text.slice(0, colon).trim().toLowerCase()
    const rawValue = text.slice(colon + 1).trim().toLowerCase()
    const minMatch = /^min-(.+)$/.exec(rawName)
    const maxMatch = /^max-(.+)$/.exec(rawName)
    const baseName = minMatch?.[1] ?? maxMatch?.[1] ?? rawName
    const desktop = (DESKTOP_MEDIA as Record<string, string | number>)[baseName]
    if (desktop === undefined) return null
    const length = mediaLengthPx(rawValue)
    if (length !== null && typeof desktop === 'number') {
      if (minMatch) return desktop >= length
      if (maxMatch) return desktop <= length
      return desktop === length
    }
    if (length === null && typeof desktop === 'string') {
      if (minMatch || maxMatch) return null
      return desktop === rawValue
    }
    return null
  }

  // A bare feature name, e.g. "(color)": true when the desktop has
  // any of it.
  const desktop = (DESKTOP_MEDIA as Record<string, string | number>)[text.toLowerCase()]
  if (desktop === undefined) return null
  return typeof desktop === 'number' ? desktop > 0 : true
}

const desktopMediaLength = (name: string): number => {
  const desktop = (DESKTOP_MEDIA as Record<string, string | number>)[name.toLowerCase()]
  return typeof desktop === 'number' ? desktop : NaN
}

// One comma-separated media query, e.g. "screen and (max-width:
// 600px)". Null when it cannot be judged.
const mediaQueryMatches = (query: string): TriState => {
  let text = query.trim()
  let negate = false
  const notMatch = /^not\s+/i.exec(text)
  if (notMatch) {
    negate = true
    text = text.slice(notMatch[0].length)
  }
  text = text.replace(/^only\s+/i, '')
  let result: TriState = true
  let first = true
  for (const part of text.split(/\s+and\s+/i)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (first && !trimmed.startsWith('(')) {
      const type = trimmed.toLowerCase()
      result = and3(
        result,
        type === 'screen' || type === 'all' ? true : type === 'print' || type === 'speech' ? false : null,
      )
      first = false
      continue
    }
    first = false
    if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
      result = and3(result, null)
      continue
    }
    result = and3(result, mediaFeatureMatches(trimmed.slice(1, -1)))
  }
  return negate ? (result === null ? null : !result) : result
}

// Whether an @media prelude applies to the desktop viewport. A list
// is an OR of its queries; an unjudgeable query counts as matching,
// so rules are only dropped on a positive mismatch.
const mediaApplies = (selector: string): boolean => {
  const prelude = selector.replace(/^@media\s*/i, '')
  let result: TriState = false
  for (const query of splitSelectorList(prelude)) {
    result = or3(result, mediaQueryMatches(query))
    if (result === true) return true
  }
  return result !== false
}

// One rule (selector + body) with its parent selector already known:
// flatten native nesting into the enclosing selector, keep the rule's
// own declarations, and recurse into nested blocks. An at-rule nested
// inside a rule (e.g. @media in a nested block) keeps the enclosing
// selector as the context for its inner rules.
const processRule = (
  selector: string,
  body: string,
  parent: string | null,
  rules: ParsedCssRule[],
): void => {
  const combined = parent ? combineSelectors(parent, selector) : selector
  const { declarations, nested } = splitRuleBody(body)
  if (declarations.trim()) rules.push({ selector: combined, body: declarations })
  for (const block of nested) {
    if (block.selector.startsWith('@')) {
      const name = atRuleName(block.selector)
      if (!GROUPING_AT_RULES.has(name)) continue
      // @media is evaluated against the desktop viewport (F36);
      // @supports/@layer/@container are flattened: @layer is
      // ordering only, @supports is a capability check a modern
      // browser passes, and a @container's size cannot be known
      // statically, so its rules count as potentially visible.
      if (name === '@media' && !mediaApplies(block.selector)) continue
      collectCssRules(block.body, combined, rules)
      continue
    }
    processRule(block.selector, block.body, combined, rules)
  }
}

// Collect the top-level rules of a stylesheet chunk (or an at-rule
// body). `parent` is the selector of an enclosing nested rule, if any.
const collectCssRules = (text: string, parent: string | null, rules: ParsedCssRule[]): void => {
  let i = 0
  const n = text.length
  while (i < n) {
    // Find the next `{` or `;` outside strings. A `;` first means a
    // block-less statement (@import, @charset) — skip past it so it
    // cannot swallow the next rule's selector.
    let open = -1
    let hitSemi = false
    let j = i
    while (j < n) {
      const ch = text[j]
      if (ch === '"' || ch === "'") {
        j = skipCssString(text, j)
        continue
      }
      if (ch === '{') {
        open = j
        break
      }
      if (ch === ';') {
        hitSemi = true
        break
      }
      j++
    }
    if (hitSemi) {
      i = j + 1
      continue
    }
    if (open === -1) break
    let selector = text.slice(i, open).trim()
    const lastSemi = selector.lastIndexOf(';')
    if (lastSemi !== -1) selector = selector.slice(lastSemi + 1).trim()
    const close = findMatchingBrace(text, open)
    const end = close === -1 ? n : close
    const body = text.slice(open + 1, end)
    i = end + 1
    if (!selector) continue
    if (selector.startsWith('@')) {
      const name = atRuleName(selector)
      if (!GROUPING_AT_RULES.has(name)) continue
      // @media is evaluated against the desktop viewport (F36); see
      // the note in processRule for @supports/@layer/@container.
      if (name === '@media' && !mediaApplies(selector)) continue
      collectCssRules(body, parent, rules)
      continue
    }
    processRule(selector, body, parent, rules)
  }
}

const parseCssRules = (css: string): ParsedCssRule[] => {
  const rules: ParsedCssRule[] = []
  collectCssRules(stripCssComments(css), null, rules)
  return rules
}

// Split a declaration block on `;` outside quotes and parentheses, so
// a `;` inside a data URI or a url() never ends a declaration early.
// A part still holding a brace outside quotes is a nested block that
// leaked in — it is skipped, not parsed as a declaration.
const splitDeclarations = (body: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  let braced = false
  const push = (end: number) => {
    if (!braced) parts.push(body.slice(start, end))
    braced = false
    start = end + 1
  }
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quote) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (ch === '{' || ch === '}') braced = true
    else if (ch === ';' && depth === 0) push(i)
  }
  push(body.length)
  return parts
}

const declarationsOf = (body: string): Array<{ property: string; value: string }> => {
  const out: Array<{ property: string; value: string }> = []
  for (const part of splitDeclarations(body)) {
    const colon = part.indexOf(':')
    if (colon === -1) continue
    const property = part.slice(0, colon).trim().toLowerCase()
    if (!property) continue
    out.push({ property, value: collapse(part.slice(colon + 1)) })
  }
  return out
}

const domIndexOf = (doc: Document): DomIndex => {
  const classes = new Set<string>()
  const ids = new Set<string>()
  const tags = new Set<string>()
  const classedElements: Element[] = []
  for (const element of Array.from(doc.querySelectorAll('*'))) {
    tags.add(element.tagName.toLowerCase())
    const id = element.getAttribute('id')
    if (id) ids.add(id)
    const cls = element.getAttribute('class')
    if (cls) {
      classedElements.push(element)
      for (const token of cls.split(/\s+/)) if (token) classes.add(token)
    }
  }
  return { classes, ids, tags, classedElements }
}

const unescapeCssIdent = (value: string) => value.replace(/\\(.)/g, '$1')

const selectorClassTokens = (selector: string): string[] =>
  Array.from(selector.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g), (match) =>
    unescapeCssIdent(match[1]),
  )

const selectorTokenFallback = (group: string, domIndex: DomIndex): boolean => {
  const trimmed = group.trim()
  // :root, html, body and * always match: the document element
  // exists. Anything else with no class, id, or type token it can
  // check — a bare attribute selector, a lone pseudo-class — is
  // unknown, and unknown does not count (F37): the old fallback
  // returned true here, so `[data-label="a, b"]` counted as used on
  // a page with no data-label attribute anywhere.
  if (/^(?::root|html|body|\*)$/i.test(trimmed)) return true
  const classes = selectorClassTokens(group)
  const ids = Array.from(group.matchAll(/#([A-Za-z0-9_-]+)/g), (match) => match[1])
  const types = group
    .split(/[\s>+~]+/)
    .map((compound) => compound.match(/^[A-Za-z][A-Za-z0-9-]*/)?.[0].toLowerCase())
    .filter((type): type is string => type !== undefined)
  if (classes.length === 0 && ids.length === 0 && types.length === 0) return false
  return (
    classes.every((token) => domIndex.classes.has(token)) &&
    ids.every((id) => domIndex.ids.has(id)) &&
    types.every((type) => type === '*' || domIndex.tags.has(type))
  )
}

// Whether every checkable token in the group occurs in the document
// — the O(1) pre-check before a querySelector round trip (F37).
// Only used for simple selectors: a group with `(` or `[` can hide
// tokens inside a functional pseudo (:is(.a, .b) is an OR, not an
// AND) or an attribute value, so those go through querySelector
// and the fallback instead.
const selectorTokensPossible = (group: string, domIndex: DomIndex): boolean => {
  if (group.includes('(') || group.includes('[')) return true
  return selectorTokenFallback(group, domIndex)
}

// Strip pseudo-classes and pseudo-elements, honouring nested
// parentheses and quoted strings: `:not(.a:not(.b))` strips whole,
// where the old regex left a dangling `)`. Attribute selectors and
// quoted strings are copied verbatim, so a `:` inside them is not
// mistaken for a pseudo-class.
const stripPseudos = (selector: string): string => {
  let out = ''
  let i = 0
  const n = selector.length
  let bracketDepth = 0
  while (i < n) {
    const ch = selector[i]
    if (ch === '"' || ch === "'") {
      const end = skipCssString(selector, i)
      out += selector.slice(i, end)
      i = end
      continue
    }
    if (ch === '[') bracketDepth++
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (ch === ':' && bracketDepth === 0) {
      let j = i + 1
      if (selector[j] === ':') j++
      while (j < n && /[A-Za-z0-9_-]/.test(selector[j])) j++
      if (selector[j] === '(') {
        let depth = 0
        while (j < n) {
          const c = selector[j]
          if (c === '"' || c === "'") {
            j = skipCssString(selector, j)
            continue
          }
          if (c === '(') depth++
          else if (c === ')') {
            depth--
            j++
            if (depth === 0) break
            continue
          }
          j++
        }
      }
      i = j
      continue
    }
    out += ch
    i++
  }
  return out
}

const isSelectorUsed = (doc: Document, parsed: ParsedCss, selector: string): boolean => {
  const cached = parsed.selectorUsedCache.get(selector)
  if (cached !== undefined) return cached
  const domIndex = parsed.domIndex ?? (parsed.domIndex = domIndexOf(doc))
  let used = false
  // Selector lists split on commas outside parentheses and quotes
  // (F37): the old split(',') broke `:is(.a, .b)` and
  // `[data-label="a, b"]` into invalid fragments.
  for (const group of splitSelectorList(selector)) {
    const trimmed = group.trim()
    if (!trimmed) continue
    if (!selectorTokensPossible(trimmed, domIndex)) continue
    try {
      if (doc.querySelector(trimmed)) {
        used = true
        break
      }
    } catch {
      // The engine cannot evaluate this selector; fall through to the
      // stripped and token checks below.
    }
    const stripped = stripPseudos(trimmed)
      .replace(/[\s>+~]+$/, '')
      .trim()
    if (stripped && stripped !== trimmed) {
      try {
        if (doc.querySelector(stripped)) {
          used = true
          break
        }
      } catch {
        // Fall through to the token check.
      }
    }
    if (selectorTokenFallback(trimmed, domIndex)) {
      used = true
      break
    }
  }
  parsed.selectorUsedCache.set(selector, used)
  return used
}

const getParsedCss = (context: SiteContext): ParsedCss => {
  const cached = parsedCssCache.get(context)
  if (cached) return cached
  const rules = parseCssRules(context.css)
  const parsed: ParsedCss = {
    rules,
    customProperties: new Map(),
    selectorUsedCache: new Map(),
    domIndex: null,
  }
  // Custom properties resolve from the rules the document actually
  // uses. :root and html always match (the document element exists),
  // so a :root palette is picked up; a --* defined only inside an
  // unused class is not, because nothing can inherit it.
  for (const rule of rules) {
    if (!isSelectorUsed(context.doc, parsed, rule.selector)) continue
    for (const decl of declarationsOf(rule.body)) {
      if (decl.property.startsWith('--')) {
        parsed.customProperties.set(decl.property, decl.value)
      }
    }
  }
  for (const node of Array.from(context.doc.querySelectorAll('[style]'))) {
    for (const decl of declarationsOf(node.getAttribute('style') ?? '')) {
      if (decl.property.startsWith('--')) {
        parsed.customProperties.set(decl.property, decl.value)
      }
    }
  }
  parsedCssCache.set(context, parsed)
  return parsed
}

// Inline styles belong to an element that exists, so they are used by
// definition and never go through selector matching.
const inlineDeclarations = (context: SiteContext) =>
  Array.from(context.doc.querySelectorAll('[style]'), (node) =>
    declarationsOf(node.getAttribute('style') ?? ''),
  ).flat()

// Strip Tailwind variant prefixes (`sm:`, `hover:focus:`) so a token
// can be tested as the utility itself.
const baseUtilityToken = (token: string) => token.replace(/^(?:[a-z][a-z0-9-]*:)+/, '')

const countDomUtility = (
  context: SiteContext,
  isUtilityToken: (token: string) => boolean,
): number => {
  const parsed = getParsedCss(context)
  const domIndex = parsed.domIndex ?? (parsed.domIndex = domIndexOf(context.doc))
  let count = 0
  for (const element of domIndex.classedElements) {
    const tokens = (element.getAttribute('class') ?? '').split(/\s+/)
    if (tokens.some((token) => token && isUtilityToken(baseUtilityToken(token)))) count++
  }
  return count
}

// Used-CSS signals + DOM utility uses, minus the signals that came
// from the definition of a utility the DOM already counted.
const combineCssAndDom = (css: number, dom: number, definitionSignals: number) => ({
  total: Math.max(0, css + dom - definitionSignals),
})

const countUsedDeclarations = (
  context: SiteContext,
  property: string,
  predicate: (value: string) => boolean,
  isUtilityToken?: (token: string) => boolean,
): { css: number; definitionSignals: number } => {
  const parsed = getParsedCss(context)
  const domIndex = parsed.domIndex ?? (parsed.domIndex = domIndexOf(context.doc))
  let css = 0
  let definitionSignals = 0
  for (const rule of parsed.rules) {
    if (!isSelectorUsed(context.doc, parsed, rule.selector)) continue
    const matches = declarationsOf(rule.body).filter(
      (decl) => decl.property === property && predicate(decl.value),
    ).length
    if (matches === 0) continue
    css += matches
    if (
      isUtilityToken &&
      selectorClassTokens(rule.selector).some(
        (token) => isUtilityToken(token) && domIndex.classes.has(token),
      )
    ) {
      definitionSignals += matches
    }
  }
  css += inlineDeclarations(context).filter(
    (decl) => decl.property === property && predicate(decl.value),
  ).length
  return { css, definitionSignals }
}

const countUsedOccurrences = (context: SiteContext, pattern: RegExp): number => {
  const parsed = getParsedCss(context)
  let count = 0
  for (const rule of parsed.rules) {
    if (!isSelectorUsed(context.doc, parsed, rule.selector)) continue
    // Custom-property definitions are not surfaces; see
    // countBluePurpleCss.
    count += declarationsOf(rule.body)
      .filter((decl) => !decl.property.startsWith('--'))
      .reduce((sum, decl) => sum + (decl.value.match(pattern)?.length ?? 0), 0)
  }
  for (const decl of inlineDeclarations(context)) {
    if (decl.property.startsWith('--')) continue
    count += decl.value.match(pattern)?.length ?? 0
  }
  return count
}

// A pill radius in a value: 100px or more, a large rem/em radius,
// `calc(infinity * 1px)` (Tailwind v4's rounded-full), or a 50%/100%
// radius, which turns a square into a circle.
const PILL_VALUE = /(?:^|\s)(?:\d{3,}px|[6-9]\d*rem|\d{2,}em|calc\(\s*infinity|(?:50|100)%)/i

const isPillUtilityToken = (token: string) => {
  if (token === 'rounded-full') return true
  const arbitrary = /^rounded-\[(.*)\]$/.exec(token)
  return arbitrary !== null && PILL_VALUE.test(arbitrary[1].replace(/_/g, ' '))
}

const isGlassUtilityToken = (token: string) => {
  if (token === 'backdrop-blur') return true
  if (/^backdrop-blur-(?:xs|sm|md|lg|xl|2xl|3xl)$/.test(token)) return true
  const arbitrary = /^backdrop-blur-\[(.+)\]$/.exec(token)
  return arbitrary !== null && arbitrary[1].toLowerCase() !== 'none'
}

// Purple-family utilities, every Tailwind shade from 50 to 950 plus
// the bare colour (`bg-indigo`), which Patch D's `[4-9]00|50` missed
// along with -950 and -100 to -300. `blue` stays in the family: the
// hex list below already treats #2563eb/#3b82f6 as palette colours.
const PURPLE_UTILITY =
  /^(?:bg|text|from|via|to|border|ring|divide|decoration|accent|caret|fill|stroke|shadow|outline)-(?:indigo|violet|purple|fuchsia|blue)(?:-(?:50|100|200|300|400|500|600|700|800|900|950))?(?:\/\d+)?$/

const isPurpleUtilityToken = (token: string) => PURPLE_UTILITY.test(token)

const pxSizes = (value: string) =>
  Array.from(value.matchAll(/(\d+(?:\.\d+)?)px/g), (match) => Number(match[1]))

const isOversizedShadowToken = (token: string) => {
  if (token === 'shadow-2xl') return true
  const arbitrary = /^shadow-\[(.*)\]$/.exec(token)
  return (
    arbitrary !== null &&
    pxSizes(arbitrary[1].replace(/_/g, ' ')).some((size) => size >= 40)
  )
}

const PURPLE_HEX =
  /#(?:6366f1|818cf8|7c3aed|8b5cf6|a855f7|6d28d9|4f46e5|9333ea|2563eb|3b82f6)\b/gi
const PURPLE_NAME = /\b(?:indigo|violet|purple|fuchsia|blue)\b/gi

// Expand var(--*) references from the custom properties the document
// defines, so `color: var(--brand)` counts when --brand is purple.
// `extra` counts var() names that say indigo/violet/purple/fuchsia
// even when the definition was not fetched. A var() fallback without
// parentheses is expanded too; one with parentheses is not.
const expandVars = (
  value: string,
  customProperties: Map<string, string>,
  seen: ReadonlySet<string> = new Set(),
): { value: string; extra: number } => {
  let extra = 0
  const expanded = value.replace(
    /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^)]*))?\)/g,
    (_match, name: string, fallback?: string) => {
      if (seen.has(name)) return ''
      const resolved = customProperties.get(name)
      if (resolved !== undefined) {
        const next = new Set(seen)
        next.add(name)
        const inner = expandVars(resolved, customProperties, next)
        extra += inner.extra
        return inner.value
      }
      if (/indigo|violet|purple|fuchsia/i.test(name)) {
        extra += 1
        return ''
      }
      if (fallback !== undefined) {
        const inner = expandVars(fallback, customProperties, seen)
        extra += inner.extra
        return inner.value
      }
      return ''
    },
  )
  return { value: expanded, extra }
}

const hueFromRgb = (r: number, g: number, b: number): number | null => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return null
  const delta = max - min
  let hue: number
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  hue *= 60
  if (hue < 0) hue += 360
  return hue
}

const countColourSignalsInValue = (
  value: string,
  customProperties: Map<string, string>,
): number => {
  const { value: expanded, extra } = expandVars(value, customProperties)
  let count = extra
  count += expanded.match(PURPLE_HEX)?.length ?? 0
  count += expanded.match(PURPLE_NAME)?.length ?? 0
  for (const match of expanded.matchAll(/oklch\(\s*([^)]*)\)/gi)) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) continue
    const chroma = Number.parseFloat(parts[1])
    const hue = Number.parseFloat(parts[2])
    // oklch hues run indigo ~277, violet ~293, purple ~304, fuchsia
    // ~322; 250-330 covers the family (Tailwind blue sits ~260).
    // Hue exactly 310 counts, as does the alpha form
    // `oklch(... / 0.5)` and a `deg` suffix — the audit's Patch D
    // regex missed all three. Chroma near zero is grey, not purple.
    if (hue >= 250 && hue <= 330 && chroma > 0.02) count++
  }
  for (const match of expanded.matchAll(/hsla?\(\s*([^)]*)\)/gi)) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 2) continue
    const hue = Number.parseFloat(parts[0])
    const saturation = Number.parseFloat(parts[1])
    // hsl hues run blue ~217-221, indigo ~239, violet ~258, purple
    // ~271, fuchsia ~292 — a different scale from oklch, so the
    // range starts lower (215) to cover the same family.
    if (hue >= 215 && hue <= 330 && saturation > 0) count++
  }
  for (const match of expanded.matchAll(/rgba?\(\s*([^)]*)\)/gi)) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) continue
    const channels = parts.slice(0, 3).map((part) => Number.parseFloat(part))
    if (channels.some((channel) => Number.isNaN(channel))) continue
    const hue = hueFromRgb(channels[0], channels[1], channels[2])
    if (hue !== null && hue >= 215 && hue <= 330) count++
  }
  return count
}

const countBluePurpleCss = (
  context: SiteContext,
): { css: number; definitionSignals: number } => {
  const parsed = getParsedCss(context)
  const domIndex = parsed.domIndex ?? (parsed.domIndex = domIndexOf(context.doc))
  let css = 0
  let definitionSignals = 0
  for (const rule of parsed.rules) {
    if (!isSelectorUsed(context.doc, parsed, rule.selector)) continue
    let signals = 0
    for (const decl of declarationsOf(rule.body)) {
      // A custom-property definition is not a coloured surface; only
      // its uses through var(--*) count (resolved in
      // countColourSignalsInValue). Counting the :root definition as
      // well would double-count one violet.
      if (decl.property.startsWith('--')) continue
      signals += countColourSignalsInValue(decl.value, parsed.customProperties)
    }
    const tokens = selectorClassTokens(rule.selector)
    // A colour word in the selector counts — `.brand-indigo` is a
    // name, not a value — unless the selector is itself a purple
    // utility class, whose DOM uses are counted separately.
    if (!tokens.some((token) => isPurpleUtilityToken(token))) {
      signals += rule.selector.match(PURPLE_NAME)?.length ?? 0
    }
    css += signals
    if (tokens.some((token) => isPurpleUtilityToken(token) && domIndex.classes.has(token))) {
      definitionSignals += signals
    }
  }
  for (const decl of inlineDeclarations(context)) {
    css += countColourSignalsInValue(decl.value, parsed.customProperties)
  }
  return { css, definitionSignals }
}

const hasChromaticColour = (
  value: string,
  customProperties: Map<string, string>,
): boolean => {
  const { value: expanded } = expandVars(value, customProperties)
  const hexes = expanded.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi) ?? []
  for (const hex of hexes) {
    const digits = hex.slice(1)
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((c) => c + c)
            .join('')
        : digits
    const r = Number.parseInt(full.slice(0, 2), 16)
    const g = Number.parseInt(full.slice(2, 4), 16)
    const b = Number.parseInt(full.slice(4, 6), 16)
    if (r !== g || g !== b) return true
  }
  for (const match of expanded.matchAll(/rgba?\(\s*([^)]*)\)/gi)) {
    const parts = match[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => Number.parseFloat(part))
    if (
      parts.length === 3 &&
      !parts.some((channel) => Number.isNaN(channel)) &&
      hueFromRgb(parts[0], parts[1], parts[2]) !== null
    ) {
      return true
    }
  }
  for (const match of expanded.matchAll(/hsla?\(\s*([^)]*)\)/gi)) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length >= 2 && Number.parseFloat(parts[1]) > 0) return true
  }
  for (const match of expanded.matchAll(/oklch\(\s*([^)]*)\)/gi)) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length >= 2 && Number.parseFloat(parts[1]) > 0.02) return true
  }
  return false
}

const isOversizedShadowValue = (value: string) => pxSizes(value).some((size) => size >= 40)

const isGlowShadowValue = (value: string, customProperties: Map<string, string>) =>
  pxSizes(value).some((size) => size >= 50) && hasChromaticColour(value, customProperties)

const countUsedShadows = (context: SiteContext) => {
  const parsed = getParsedCss(context)
  const domIndex = parsed.domIndex ?? (parsed.domIndex = domIndexOf(context.doc))
  let oversizedCss = 0
  let oversizedDef = 0
  let glowCss = 0
  let glowDef = 0
  const tally = (values: string[], isDefinition: boolean) => {
    for (const value of values) {
      if (isOversizedShadowValue(value)) {
        oversizedCss++
        if (isDefinition) oversizedDef++
      }
      if (isGlowShadowValue(value, parsed.customProperties)) {
        glowCss++
        if (isDefinition) glowDef++
      }
    }
  }
  for (const rule of parsed.rules) {
    if (!isSelectorUsed(context.doc, parsed, rule.selector)) continue
    const values = declarationsOf(rule.body)
      .filter(
        (decl) =>
          decl.property === 'box-shadow' && decl.value.trim().toLowerCase() !== 'none',
      )
      .map((decl) => decl.value)
    const isDefinition = selectorClassTokens(rule.selector).some(
      (token) => isOversizedShadowToken(token) && domIndex.classes.has(token),
    )
    tally(values, isDefinition)
  }
  tally(
    inlineDeclarations(context)
      .filter(
        (decl) =>
          decl.property === 'box-shadow' && decl.value.trim().toLowerCase() !== 'none',
      )
      .map((decl) => decl.value),
    false,
  )
  return { oversizedCss, oversizedDef, glowCss, glowDef }
}

const isColouredShadowToken = (token: string) => {
  if (
    /^shadow-(?:indigo|violet|purple|fuchsia|blue|pink|rose|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky)(?:-\d+)?(?:\/\d+)?$/.test(
      token,
    )
  ) {
    return true
  }
  return /^shadow-\[/.test(token) && /(?:rgba?|hsla?|oklch)\(/.test(token)
}

const countDomGlow = (context: SiteContext): number => {
  const parsed = getParsedCss(context)
  const domIndex = parsed.domIndex ?? (parsed.domIndex = domIndexOf(context.doc))
  let count = 0
  for (const element of domIndex.classedElements) {
    const tokens = (element.getAttribute('class') ?? '')
      .split(/\s+/)
      .map((token) => baseUtilityToken(token))
    if (tokens.some(isOversizedShadowToken) && tokens.some(isColouredShadowToken)) count++
  }
  return count
}

const pillRadius = (context: SiteContext): SiteHit[] => {
  const { css, definitionSignals } = countUsedDeclarations(
    context,
    'border-radius',
    (value) => PILL_VALUE.test(value),
    isPillUtilityToken,
  )
  const dom = countDomUtility(context, isPillUtilityToken)
  const { total } = combineCssAndDom(css, dom, definitionSignals)
  if (total < 3) return []
  return [
    {
      excerpt: `${total} pill-radius uses appear in the styles or markup.`,
      count: total,
    },
  ]
}

const glassSurfaces = (context: SiteContext): SiteHit[] => {
  const notNone = (value: string) => value.trim().toLowerCase() !== 'none'
  const main = countUsedDeclarations(context, 'backdrop-filter', notNone, isGlassUtilityToken)
  const prefixed = countUsedDeclarations(
    context,
    '-webkit-backdrop-filter',
    notNone,
    isGlassUtilityToken,
  )
  const dom = countDomUtility(context, isGlassUtilityToken)
  const { total } = combineCssAndDom(
    main.css + prefixed.css,
    dom,
    main.definitionSignals + prefixed.definitionSignals,
  )
  if (total < 3) return []
  return [
    {
      excerpt: `${total} backdrop-blur uses appear in the styles or markup.`,
      count: total,
    },
  ]
}

const radialOrbs = (context: SiteContext): SiteHit[] => {
  const count = countUsedOccurrences(context, /radial-gradient\(/gi)
  if (count < 2) return []
  return [
    {
      excerpt: `${count} radial gradients appear in the styles.`,
      count,
    },
  ]
}

const bluePurplePalette = (context: SiteContext): SiteHit[] => {
  const { css, definitionSignals } = countBluePurpleCss(context)
  const dom = countDomUtility(context, isPurpleUtilityToken)
  const { total } = combineCssAndDom(css, dom, definitionSignals)
  if (total < 2) return []
  return [
    {
      excerpt: `${total} violet, indigo, or blue accents appear in the styles or markup.`,
      count: total,
    },
  ]
}

const backgroundGrid = (context: SiteContext): SiteHit[] => {
  const count = countUsedOccurrences(context, /repeating-linear-gradient\(/gi)
  if (count < 1) return []
  return [
    {
      excerpt: `${count} repeating-linear-gradient rule${count === 1 ? '' : 's'} could draw a grid or stripes.`,
      count,
    },
  ]
}

const oversizedShadows = (context: SiteContext): SiteHit[] => {
  const { oversizedCss, oversizedDef } = countUsedShadows(context)
  const dom = countDomUtility(context, isOversizedShadowToken)
  const { total } = combineCssAndDom(oversizedCss, dom, oversizedDef)
  if (total < 3) return []
  return [
    {
      excerpt: `${total} box shadows use a blur or spread of 40px or more.`,
      count: total,
    },
  ]
}

const glowClusters = (context: SiteContext): SiteHit[] => {
  const { glowCss, glowDef } = countUsedShadows(context)
  const dom = countDomGlow(context)
  const { total } = combineCssAndDom(glowCss, dom, glowDef)
  if (total < 2) return []
  return [
    {
      excerpt: `${total} colored shadows use a blur of 50px or more.`,
      count: total,
    },
  ]
}

export const siteRules: SiteRule[] = [
  {
    id: 'dead-link',
    label: 'Dead link',
    group: 'structure',
    severity: 'high',
    note: 'The link has no destination the page can reach.',
    fix: 'Point it at a real page or section, or remove it.',
    detect: deadLinks,
  },
  {
    id: 'unnamed-control',
    label: 'Unnamed control',
    group: 'structure',
    severity: 'high',
    note: 'A button or link with no accessible name is invisible to screen readers.',
    fix: 'Add visible text, aria-label, or an image alt.',
    detect: unnamedControls,
  },
  {
    id: 'missing-alt',
    label: 'Image without alt',
    group: 'structure',
    severity: 'medium',
    note: 'A missing alt attribute leaves the image unexplained.',
    fix: 'Describe the image, or use alt="" if it is decorative.',
    detect: missingAlt,
  },
  {
    id: 'heading-order',
    label: 'Heading outline',
    group: 'structure',
    severity: 'medium',
    note: 'Multiple or skipped headings break the page outline.',
    fix: 'Use one h1 and step down without gaps.',
    detect: headingOrder,
  },
  {
    id: 'template-stack',
    label: 'Template section stack',
    group: 'structure',
    severity: 'medium',
    note: 'The usual landing-page sections appear together with no sign of a real content plan.',
    fix: 'Remove sections the product does not need.',
    detect: templateStack,
  },
  {
    id: 'trust-logo-bar',
    label: 'Trust logo bar',
    group: 'structure',
    severity: 'medium',
    note: 'Unnamed logos imply customers without evidence.',
    fix: 'Name the customers and link the proof, or remove the row.',
    detect: trustLogoBar,
  },
  {
    id: 'three-step',
    label: 'Three-step explainer',
    group: 'structure',
    severity: 'low',
    note: 'The product process is forced into exactly three steps.',
    fix: 'Use as many steps as the real process needs.',
    detect: threeSteps,
  },
  {
    id: 'fake-urgency',
    label: 'Manufactured urgency',
    group: 'structure',
    severity: 'medium',
    note: 'A deadline or scarcity claim needs a real date or count.',
    fix: 'Show the real deadline or remove the pressure line.',
    detect: fakeUrgency,
  },
  {
    id: 'placeholder-copy',
    label: 'Placeholder copy',
    group: 'structure',
    severity: 'high',
    note: 'Lorem ipsum reached production.',
    fix: 'Replace it with the real message.',
    detect: placeholderCopy,
  },
  {
    id: 'skeleton-blocks',
    label: 'Skeleton blocks',
    group: 'structure',
    severity: 'low',
    note: 'Skeleton elements may be a real loading state, or a stand-in for content.',
    fix: 'Confirm the loading state is wired to real data.',
    detect: skeletonBlocks,
  },
  {
    id: 'generic-faq',
    label: 'Template FAQ',
    group: 'structure',
    severity: 'low',
    note: 'These questions answer a template, not this product.',
    fix: 'Use questions your support inbox actually receives.',
    detect: genericFaq,
  },
  {
    id: 'popular-badge',
    label: 'Most popular badge',
    group: 'structure',
    severity: 'low',
    note: 'The middle pricing card is highlighted because that is the pattern.',
    fix: 'Highlight the tier the evidence supports, or none.',
    detect: popularBadge,
  },
  {
    id: 'page-title',
    label: 'Page title',
    group: 'structure',
    severity: 'medium',
    note: 'The title is missing or long enough to be cut in search results.',
    fix: 'Write a specific title under 65 characters.',
    detect: pageTitle,
  },
  {
    id: 'meta-description',
    label: 'Meta description',
    group: 'structure',
    severity: 'medium',
    note: 'The description is missing or long enough to be cut.',
    fix: 'Write a specific description under 170 characters.',
    detect: metaDescription,
  },
  {
    id: 'pill-radius',
    label: 'Pill radius everywhere',
    group: 'style',
    severity: 'low',
    note: 'Repeated very large radii make every surface a capsule.',
    fix: 'Reserve the pill for one class of control.',
    detect: pillRadius,
  },
  {
    id: 'glass-surfaces',
    label: 'Glass on many surfaces',
    group: 'style',
    severity: 'medium',
    note: 'Backdrop blur stops being an accent when several surfaces use it.',
    fix: 'Keep blur for one or two elements at most.',
    detect: glassSurfaces,
  },
  {
    id: 'radial-orbs',
    label: 'Radial orbs',
    group: 'style',
    severity: 'low',
    note: 'Repeated radial gradients read as generic background glows.',
    fix: 'Keep one gradient only if it separates hierarchy.',
    detect: radialOrbs,
  },
  {
    id: 'blue-purple-palette',
    label: 'Blue-purple palette',
    group: 'style',
    severity: 'medium',
    note: 'Violet and indigo are the default AI palette when they replace brand color.',
    fix: 'Use the product palette or one deliberate accent.',
    detect: bluePurplePalette,
  },
  {
    id: 'background-grid',
    label: 'Background grid or stripes',
    group: 'style',
    severity: 'low',
    note: 'Repeating lines are decoration unless they carry meaning.',
    fix: 'Remove the pattern, or tie it to the content.',
    detect: backgroundGrid,
  },
  {
    id: 'oversized-shadows',
    label: 'Oversized shadows',
    group: 'style',
    severity: 'low',
    note: 'Large shadows make every component float at the same level.',
    fix: 'Use shadow only to mark one elevation step.',
    detect: oversizedShadows,
  },
  {
    id: 'glow-clusters',
    label: 'Glow clusters',
    group: 'style',
    severity: 'low',
    note: 'Colored glows on several elements compete for attention.',
    fix: 'Keep glow for one focal element, if any.',
    detect: glowClusters,
  },
]

export const collectCss = (doc: Document) => {
  // Stylesheet blocks only. Inline `style="..."` attributes used to be
  // appended here as bare declarations, but a bare declaration has no
  // selector, so it corrupted the selector of the next parsed rule.
  // Inline styles are counted separately, from the elements that carry
  // them (see inlineDeclarations in the style rules): an element that
  // exists is used by definition.
  const blocks = Array.from(doc.querySelectorAll('style'), (node) => node.textContent ?? '')
  return blocks.join('\n')
}

export const extractPageText = visibleText
