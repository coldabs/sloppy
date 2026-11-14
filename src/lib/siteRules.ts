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
  const seen = new Set<string>()
  const links = Array.from(context.doc.querySelectorAll('a[href]')).slice(0, 400)

  for (const link of links) {
    const raw = link.getAttribute('href')?.trim() ?? ''
    if (!raw || seen.has(raw)) continue

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
    seen.add(raw)
    const label = textOf(link) || accessibleName(context.doc, link) || '(no label)'
    hits.push({ excerpt: `${excerpt(label, 40)} points to ${raw}` })
    if (hits.length >= 8) break
  }

  return hits
}

const unnamedControls = (context: SiteContext): SiteHit[] => {
  const hits: SiteHit[] = []
  const controls = Array.from(
    context.doc.querySelectorAll('button, a[href], input[type="submit"], input[type="button"]'),
  ).slice(0, 400)

  for (const control of controls) {
    if (control.getAttribute('aria-hidden') === 'true') continue
    if (accessibleName(context.doc, control)) continue
    const tag = control.tagName.toLowerCase()
    hits.push({ excerpt: `<${tag}> has no text, aria-label, or image alt` })
    if (hits.length >= 8) break
  }

  return hits
}

const missingAlt = (context: SiteContext): SiteHit[] => {
  const hits: SiteHit[] = []
  const images = Array.from(context.doc.querySelectorAll('img')).slice(0, 300)

  for (const image of images) {
    if (image.hasAttribute('alt')) continue
    if (image.getAttribute('aria-hidden') === 'true') continue
    const source = image.getAttribute('src')?.trim() || '(no src)'
    hits.push({ excerpt: `Image without alt: ${excerpt(source, 60)}` })
    if (hits.length >= 8) break
  }

  return hits
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
      if (hits.length >= 5) break
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
    const stepBlocks = section.querySelectorAll('[class*="step"], [class*="Step"]').length
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
    if (hits.length >= 5) break
  }
  return hits
}

const placeholderCopy = (context: SiteContext): SiteHit[] => {
  const hits: SiteHit[] = []
  const pattern = /lorem ipsum|dolor sit amet|consectetur adipiscing/gi
  for (const match of context.text.matchAll(pattern)) {
    hits.push({ excerpt: excerpt(match[0], 60) })
    if (hits.length >= 4) break
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
    if (hits.length >= 5) break
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

const declarations = (css: string, property: string) => {
  const pattern = new RegExp(
    `(?:^|[;{])\\s*${property.replace(/[-.]/g, '\\$&')}\\s*:\\s*([^;}]+)`,
    'gi',
  )
  return Array.from(css.matchAll(pattern), (match) => collapse(match[1]))
}

const pillRadius = (context: SiteContext): SiteHit[] => {
  const pills = declarations(context.css, 'border-radius').filter((value) =>
    /(?:^|\s)(?:\d{3,}px|[6-9]\d*rem|\d{2,}em)/i.test(value),
  )
  if (pills.length < 3) return []
  return [
    {
      excerpt: `${pills.length} border-radius declarations use 100px or more.`,
      count: pills.length,
    },
  ]
}

const glassSurfaces = (context: SiteContext): SiteHit[] => {
  const filters = [
    ...declarations(context.css, 'backdrop-filter'),
    ...declarations(context.css, '-webkit-backdrop-filter'),
  ].filter((value) => value !== 'none')
  if (filters.length < 3) return []
  return [
    {
      excerpt: `${filters.length} declarations apply backdrop blur.`,
      count: filters.length,
    },
  ]
}

const radialOrbs = (context: SiteContext): SiteHit[] => {
  const count = (context.css.match(/radial-gradient\(/gi) ?? []).length
  if (count < 2) return []
  return [
    {
      excerpt: `${count} radial gradients appear in the styles.`,
      count,
    },
  ]
}

const bluePurplePalette = (context: SiteContext): SiteHit[] => {
  const hexes = context.css.match(
    /#(?:6366f1|818cf8|7c3aed|8b5cf6|a855f7|6d28d9|4f46e5|9333ea|2563eb|3b82f6)\b/gi,
  )
  const names = context.css.match(/\b(?:indigo|violet|purple)\b/gi)
  const count = (hexes?.length ?? 0) + (names?.length ?? 0)
  if (count < 2) return []
  return [
    {
      excerpt: `${count} violet, indigo, or blue accents appear in the styles.`,
      count,
    },
  ]
}

const backgroundGrid = (context: SiteContext): SiteHit[] => {
  const count = (context.css.match(/repeating-linear-gradient\(/gi) ?? []).length
  if (count < 1) return []
  return [
    {
      excerpt: `${count} repeating-linear-gradient rule${count === 1 ? '' : 's'} could draw a grid or stripes.`,
      count,
    },
  ]
}

const shadowValues = (context: SiteContext) =>
  declarations(context.css, 'box-shadow').filter((value) => value !== 'none')

const oversizedShadows = (context: SiteContext): SiteHit[] => {
  const values = shadowValues(context).filter((value) => {
    const sizes = Array.from(value.matchAll(/(\d+(?:\.\d+)?)px/g), (match) =>
      Number(match[1]),
    )
    return sizes.some((size) => size >= 40)
  })
  if (values.length < 3) return []
  return [
    {
      excerpt: `${values.length} box shadows use a blur or spread of 40px or more.`,
      count: values.length,
    },
  ]
}

const glowClusters = (context: SiteContext): SiteHit[] => {
  const values = shadowValues(context).filter((value) => {
    if (!/rgba?\(|hsla?\(/i.test(value)) return false
    const sizes = Array.from(value.matchAll(/(\d+(?:\.\d+)?)px/g), (match) =>
      Number(match[1]),
    )
    return sizes.some((size) => size >= 50)
  })
  if (values.length < 2) return []
  return [
    {
      excerpt: `${values.length} colored shadows use a blur of 50px or more.`,
      count: values.length,
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
  const blocks = Array.from(doc.querySelectorAll('style'), (node) => node.textContent ?? '')
  const inline = Array.from(
    doc.querySelectorAll('[style]'),
    (node) => node.getAttribute('style') ?? '',
  )
  return [...blocks, ...inline].join('\n')
}

export const extractPageText = visibleText
