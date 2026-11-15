// @vitest-environment happy-dom
// Stage 5 — DOM-correlated CSS, modern colour spaces, dead-link
// counting, whole-word three-steps matching, and count-first caps
// (AUDIT.md §7 stage 5, §8 Patch D, as corrected by
// AUDIT_VERIFICATION.md §4). Numbers below were measured from the
// new code, through analyzeSite() on real probe pages.
import { describe, expect, it } from 'vitest'
import { analyzeSite } from './siteAnalyzer'

const wrap = (body: string, head = '') => `<!doctype html>
<html>
  <head>
    <title>Probe</title>
    <meta name="description" content="A probe page for the stage 5 checks." />
    ${head}
  </head>
  <body>
    <h1>Probe</h1>
    ${body}
  </body>
</html>`

const groupOf = (html: string, id: string, stylesheets: string[] = []) => {
  const result = analyzeSite({ url: 'https://example.com/', html, stylesheets })
  return [...result.structure, ...result.style].find((item) => item.rule.id === id)
}

const occurrencesOf = (html: string, id: string, stylesheets: string[] = []) =>
  groupOf(html, id, stylesheets)?.occurrences ?? 0

// --- 1. Tailwind utilities counted in the DOM ---------------------------

const tailwindPage = wrap(
  Array.from(
    { length: 40 },
    (_, i) => `<div class="rounded-full backdrop-blur-md bg-indigo-600 shadow-2xl">Card ${i + 1}</div>`,
  ).join('\n'),
  `<style>
    .rounded-full { border-radius: calc(infinity * 1px); }
    .backdrop-blur-md { backdrop-filter: blur(12px); }
    .bg-indigo-600 { background-color: #4f46e5; }
    .shadow-2xl { box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25); }
  </style>`,
)

describe('stage5: Tailwind utilities fire from DOM usage', () => {
  it('fires pill-radius, glass-surfaces and blue-purple-palette for 40 uses of one declaration each', () => {
    expect(occurrencesOf(tailwindPage, 'pill-radius')).toBe(40)
    expect(occurrencesOf(tailwindPage, 'glass-surfaces')).toBe(40)
    expect(occurrencesOf(tailwindPage, 'blue-purple-palette')).toBe(40)
  })

  it('fires oversized-shadows for 40 shadow-2xl uses, but not glow-clusters for a black shadow', () => {
    expect(occurrencesOf(tailwindPage, 'oversized-shadows')).toBe(40)
    expect(groupOf(tailwindPage, 'glow-clusters')).toBeUndefined()
  })

  it('does not fire when the same utilities appear only once', () => {
    const html = wrap(
      `<div class="rounded-full backdrop-blur-md bg-indigo-600 shadow-2xl">Card</div>`,
      `<style>
        .rounded-full { border-radius: calc(infinity * 1px); }
        .backdrop-blur-md { backdrop-filter: blur(12px); }
        .bg-indigo-600 { background-color: #4f46e5; }
        .shadow-2xl { box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25); }
      </style>`,
    )
    expect(groupOf(html, 'pill-radius')).toBeUndefined()
    expect(groupOf(html, 'glass-surfaces')).toBeUndefined()
    // One indigo surface totals 1 (one CSS signal + one DOM use
    // minus the utility definition), below the >= 2 threshold.
    expect(groupOf(html, 'blue-purple-palette')).toBeUndefined()
    expect(groupOf(html, 'oversized-shadows')).toBeUndefined()
  })
})

// --- 2. Modern colour spaces -------------------------------------------

describe('stage5: oklch / hsl / var() colours fire blue-purple-palette', () => {
  // One used class per declaration, so every value below is a used
  // signal: indigo 277, violet 293, purple 304, blue 260, fuchsia
  // 322, hue exactly 310 with an alpha channel, and a deg suffix.
  const oklchPage = wrap(
    `<p class="a b c d e f g h">Colour probes.</p>`,
    `<style>
      .a { color: oklch(0.585 0.233 277.117); }
      .b { color: oklch(0.606 0.25 292.717); }
      .c { color: oklch(0.627 0.265 303.9); }
      .d { color: oklch(0.623 0.214 259.815); }
      .e { color: oklch(0.667 0.295 322.15); }
      .f { color: oklch(0.585 0.233 310 / 0.5); }
      .g { color: oklch(0.585 0.233 277deg); }
      .h { color: hsl(262 83% 58%); }
    </style>`,
  )

  it('counts oklch hues 260-322, hue 310, the alpha form and deg suffixes, plus hsl', () => {
    expect(occurrencesOf(oklchPage, 'blue-purple-palette')).toBe(8)
  })

  it('does not count a grey oklch (zero chroma) or a green hsl hue', () => {
    const html = wrap(
      `<p class="a b">Colour probes.</p>`,
      `<style>
        .a { color: oklch(0.5 0 277.117); }
        .b { color: hsl(140 60% 50%); }
      </style>`,
    )
    expect(groupOf(html, 'blue-purple-palette')).toBeUndefined()
  })

  it('resolves var(--*) from :root, including hsl(var(--primary)) channel values', () => {
    const html = wrap(
      `<p class="a b c">Colour probes.</p>`,
      `<style>
        :root { --brand: oklch(0.606 0.25 292.717); --primary: 262 83% 58%; }
        .a { color: var(--brand); }
        .b { color: hsl(var(--primary)); }
        .c { color: var(--indigo-500); }
      </style>`,
    )
    // .a resolves to a violet oklch, .b to an indigo hsl, .c is named
    // for indigo with no definition fetched: 3 signals.
    expect(occurrencesOf(html, 'blue-purple-palette')).toBe(3)
  })

  it('counts purple utility shades -950 and -100 to -300 in the DOM', () => {
    const html = wrap(
      `<p class="bg-indigo-950">Dark</p><p class="bg-violet-100">Light</p><p class="text-purple-300">Soft</p>`,
    )
    expect(occurrencesOf(html, 'blue-purple-palette')).toBe(3)
  })

  it('keeps the existing hex and keyword detection working', () => {
    const html = wrap(
      `<p class="a b c">Colour probes.</p>`,
      `<style>
        .a { color: #8b5cf6; }
        .b { color: purple; }
        .c { color: #6366f1; }
      </style>`,
    )
    expect(occurrencesOf(html, 'blue-purple-palette')).toBe(3)
  })

  it('does not fire blue-purple-palette for two accents only (F40)', () => {
    const html = wrap(
      `<p class="a b">Colour probes.</p>`,
      `<style>
        .a { color: #8b5cf6; }
        .b { color: purple; }
      </style>`,
    )
    expect(groupOf(html, 'blue-purple-palette')).toBeUndefined()
  })
})

// --- 3. deadLinks: no dedupe -------------------------------------------

describe('stage5: dead links are counted, not deduplicated', () => {
  it('counts 25 identical href="#" links as 25', () => {
    const html = wrap(
      Array.from({ length: 25 }, (_, i) => `<a href="#">Link ${i + 1}</a>`).join('\n'),
    )
    const result = analyzeSite({ url: 'https://example.com/', html })
    expect(result.stats.deadLinks).toBe(25)
    const group = result.structure.find((item) => item.rule.id === 'dead-link')
    expect(group?.occurrences).toBe(25)
    expect(group?.hits).toHaveLength(25)
  })

  it('still counts distinct dead anchors the same way', () => {
    const html = wrap(
      `<a href="#one">One</a><a href="#two">Two</a><a href="javascript:void(0)">Three</a>`,
    )
    expect(occurrencesOf(html, 'dead-link')).toBe(3)
  })
})

// --- 4. threeSteps: whole-word "step" -----------------------------------

describe('stage5: three-steps matches whole-word step classes only', () => {
  const sectionWith = (inner: string) => wrap(
    `<section><h2>How it works</h2>${inner}</section>`,
  )

  it('does not fire for stepper, step-brother or multi-step-form', () => {
    const html = sectionWith(
      `<div class="stepper-item">One</div><div class="step-brother">Two</div><div class="multi-step-form">Three</div>`,
    )
    expect(groupOf(html, 'three-step')).toBeUndefined()
  })

  it('fires for genuine step, step-1 and Step classes', () => {
    const html = sectionWith(
      `<div class="step">One</div><div class="step-1">Two</div><div class="Step">Three</div>`,
    )
    expect(occurrencesOf(html, 'three-step')).toBe(3)
  })

  it('still fires for a three-item ordered list', () => {
    const html = sectionWith(`<ol><li>One</li><li>Two</li><li>Three</li></ol>`)
    expect(occurrencesOf(html, 'three-step')).toBe(3)
  })
})

// --- 5. Dead / unused CSS ----------------------------------------------

describe('stage5: unused CSS declarations do not fire', () => {
  const pillSheet = `
    .unused-a { border-radius: 9999px; }
    .unused-b { border-radius: 999px; }
    .unused-c { border-radius: 1000px; }
    @media print { .unused-d { border-radius: 9999px; } }
  `

  it('does not fire pill-radius for declarations no element uses, including @media print', () => {
    const html = wrap(`<p>Plain text, no pill classes.</p>`, `<style>${pillSheet}</style>`)
    expect(groupOf(html, 'pill-radius')).toBeUndefined()
  })

  it('fires pill-radius for the same declarations once elements use them', () => {
    const html = wrap(
      `<p class="unused-a unused-b unused-c">Plain text with pill classes.</p>`,
      `<style>${pillSheet}</style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('does not fire glass or palette for an unused framework sheet, but fires when used', () => {
    const sheet = `
      .glass-a { backdrop-filter: blur(8px); }
      .glass-b { backdrop-filter: blur(8px); }
      .glass-c { backdrop-filter: blur(8px); }
      .pal-a { color: #8b5cf6; }
      .pal-b { color: purple; }
      .pal-c { color: #6366f1; }
    `
    const unused = wrap(`<p>Plain text.</p>`, `<style>${sheet}</style>`)
    expect(groupOf(unused, 'glass-surfaces')).toBeUndefined()
    expect(groupOf(unused, 'blue-purple-palette')).toBeUndefined()
    const used = wrap(
      `<p class="glass-a glass-b glass-c pal-a pal-b pal-c">Plain text.</p>`,
      `<style>${sheet}</style>`,
    )
    expect(occurrencesOf(used, 'glass-surfaces')).toBe(3)
    expect(occurrencesOf(used, 'blue-purple-palette')).toBe(3)
  })

  it('still fires for a genuinely used stylesheet passed in as a fetched file', () => {
    const html = wrap(`<p class="card">Plain text.</p>`)
    const css = `.card { border-radius: 9999px; }
      .card-two { border-radius: 999px; }
      .card-three { border-radius: 1000px; }`
    // Only .card is used, so only one declaration counts: no fire.
    expect(groupOf(html, 'pill-radius', [css])).toBeUndefined()
    const allUsed = wrap(
      `<p class="card card-two card-three">Plain text.</p>`,
    )
    expect(occurrencesOf(allUsed, 'pill-radius', [css])).toBe(3)
  })

  it('counts an inline style radius on the element that carries it', () => {
    const html = wrap(
      `<p style="border-radius: 9999px">One</p>
       <p style="border-radius: 999px">Two</p>
       <p style="border-radius: 1000px">Three</p>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })
})

// --- 6. Caps count first, then slice for display ------------------------

describe('stage5: the 400/400/300 caps hide nothing from the count', () => {
  it('counts 500 dead links as 500 while showing at most 400 hits', () => {
    const html = wrap(
      Array.from({ length: 500 }, (_, i) => `<a href="#">Link ${i + 1}</a>`).join('\n'),
    )
    const result = analyzeSite({ url: 'https://example.com/', html })
    expect(result.stats.deadLinks).toBe(500)
    const group = result.structure.find((item) => item.rule.id === 'dead-link')
    expect(group?.occurrences).toBe(500)
    expect(group?.hits).toHaveLength(400)
  })

  it('counts 350 images without alt as 350 while showing at most 300 hits', () => {
    const html = wrap(
      Array.from({ length: 350 }, (_, i) => `<img src="/i${i}.png" />`).join('\n'),
    )
    const result = analyzeSite({ url: 'https://example.com/', html })
    expect(result.stats.missingAlt).toBe(350)
    const group = result.structure.find((item) => item.rule.id === 'missing-alt')
    expect(group?.occurrences).toBe(350)
    expect(group?.hits).toHaveLength(300)
  })

  it('counts 450 unnamed buttons as 450 while showing at most 400 hits', () => {
    const html = wrap(
      Array.from({ length: 450 }, () => `<button></button>`).join('\n'),
    )
    const result = analyzeSite({ url: 'https://example.com/', html })
    const group = result.structure.find((item) => item.rule.id === 'unnamed-control')
    expect(group?.occurrences).toBe(450)
    expect(group?.hits).toHaveLength(400)
  })

  it('does not change the penalty when the cap is not reached', () => {
    const html = wrap(
      Array.from({ length: 20 }, (_, i) => `<a href="#missing-${i + 1}">Link ${i + 1}</a>`).join('\n'),
    )
    const result = analyzeSite({ url: 'https://example.com/', html })
    expect(result.stats.deadLinks).toBe(20)
    const group = result.structure.find((item) => item.rule.id === 'dead-link')
    expect(group?.occurrences).toBe(20)
    expect(group?.hits).toHaveLength(20)
  })
})
