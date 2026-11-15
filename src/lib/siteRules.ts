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

const visibleText = (doc: Document) => {
  if (!doc.body) return ''
  const clone = doc.body.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll('script, style, noscript, template, svg, canvas, iframe')
    .forEach((node) => node.remove())
  return collapse(clone.textContent ?? '')
}

const accessibleName = (doc: Document, element: Element) => {
  const ariaLabel = element.getAttribute('aria-label')?.trim()
  if (ariaLabel) return ariaLabel

  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    const target = doc.getElementById(labelledBy)
    if (target) {
      const text = textOf(target)
      if (text) return text
    }
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
// DOM-correlated CSS (Stage 5)
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
// somewhere, not necessarily nested), attribute selectors such as
// `[class*="step"]` are assumed used, CSS nesting (`&`) inside a
// rule body is not parsed, and a var() fallback containing
// parentheses is not expanded. None of these changes whether a rule
// fires on the probe pages in stage5.test.ts.
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

const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const parseCssRules = (css: string): ParsedCssRule[] => {
  const rules: ParsedCssRule[] = []
  const text = stripCssComments(css)
  let i = 0
  const n = text.length
  while (i < n) {
    while (i < n && /\s/.test(text[i])) i++
    if (i >= n) break
    const open = text.indexOf('{', i)
    if (open === -1) break
    // A statement without a block (@import, @charset) ends at ';' and
    // must not swallow the next rule's selector.
    const semi = text.indexOf(';', i)
    if (semi !== -1 && semi < open) {
      i = semi + 1
      continue
    }
    let selector = text.slice(i, open).trim()
    const lastSemi = selector.lastIndexOf(';')
    if (lastSemi !== -1) selector = selector.slice(lastSemi + 1).trim()
    let depth = 1
    let j = open + 1
    while (j < n && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const body = text.slice(open + 1, j - 1)
    i = j
    if (!selector) continue
    if (selector.startsWith('@')) {
      const atName = selector.split(/\s/, 1)[0].toLowerCase()
      if (
        atName === '@media' ||
        atName === '@supports' ||
        atName === '@layer' ||
        atName === '@container' ||
        atName === '@scope'
      ) {
        // Print (and speech) styles are not what the visitor sees.
        if (atName === '@media' && /\b(?:print|speech)\b/i.test(selector)) continue
        // Pushed one at a time, not spread: a large stylesheet can
        // return more rules than a spread call can take (F5).
        for (const rule of parseCssRules(body)) rules.push(rule)
      }
      // @keyframes, @font-face, @page and friends carry no element styles.
      continue
    }
    rules.push({ selector, body })
  }
  return rules
}

const declarationsOf = (body: string): Array<{ property: string; value: string }> => {
  const out: Array<{ property: string; value: string }> = []
  for (const part of body.split(';')) {
    if (part.includes('{') || part.includes('}')) continue
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
  const classes = selectorClassTokens(group)
  const ids = Array.from(group.matchAll(/#([A-Za-z0-9_-]+)/g), (match) => match[1])
  const types = group
    .split(/[\s>+~]+/)
    .map((compound) => compound.match(/^[A-Za-z][A-Za-z0-9-]*/)?.[0].toLowerCase())
    .filter((type): type is string => type !== undefined)
  if (classes.length === 0 && ids.length === 0 && types.length === 0) return true
  return (
    classes.every((token) => domIndex.classes.has(token)) &&
    ids.every((id) => domIndex.ids.has(id)) &&
    types.every((type) => type === '*' || domIndex.tags.has(type))
  )
}

const isSelectorUsed = (doc: Document, parsed: ParsedCss, selector: string): boolean => {
  const cached = parsed.selectorUsedCache.get(selector)
  if (cached !== undefined) return cached
  const domIndex = parsed.domIndex ?? (parsed.domIndex = domIndexOf(doc))
  let used = false
  for (const group of selector.split(',')) {
    const trimmed = group.trim()
    if (!trimmed) continue
    try {
      if (doc.querySelector(trimmed)) {
        used = true
        break
      }
    } catch {
      // The engine cannot evaluate this selector; fall through to the
      // stripped and token checks below.
    }
    const stripped = trimmed
      .replace(/::?[A-Za-z][\w-]*(\([^)]*\))?/g, '')
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
