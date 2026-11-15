// @vitest-environment happy-dom
// F35 probes — hand-rolled CSS parser corruption (reproduced before the fix).
import { describe, expect, it } from 'vitest'
import { analyzeSite } from './siteAnalyzer'

const wrap = (body: string, head = '') => `<!doctype html>
<html>
  <head>
    <title>Probe</title>
    <meta name="description" content="A probe page for the F35 checks." />
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

describe('F35: CSS parser corruption probes', () => {
  it('counts pill-radius when a brace sits inside a quoted string', () => {
    const html = wrap(
      `<p class="a b c">Text.</p>`,
      `<style>
        .a { content: "}"; border-radius: 999px; }
        .b { border-radius: 999px; }
        .c { border-radius: 999px; }
      </style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('counts blue-purple-palette when a semicolon sits inside a data URI', () => {
    // The palette colour is inside the data URI, after its `;` — the
    // `;`-split drops the second half of the declaration, losing it.
    const html = wrap(
      `<p class="a b">Text.</p>`,
      `<style>
        .a { background-image: url("data:image/svg+xml;utf8,<svg fill='#8b5cf6'></svg>"); }
        .b { color: purple; }
      </style>`,
    )
    expect(occurrencesOf(html, 'blue-purple-palette')).toBe(2)
  })

  it('counts pill-radius from nested & rules', () => {
    const html = wrap(
      `<div class="card"><p class="inner">Text.</p></div><p class="plain">More.</p>`,
      `<style>
        .card { border-radius: 999px; & .inner { border-radius: 999px; } }
        .plain { border-radius: 999px; }
      </style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('does not drop a declaration placed after a nested & block', () => {
    const html = wrap(
      `<div class="card"><p class="inner">Text.</p></div>`,
      `<style>
        .card { & .inner { color: red; } border-radius: 999px; }
        .card { border-radius: 999px; }
        .card { border-radius: 999px; }
      </style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('does not strip text after /* inside a quoted string', () => {
    // The string holds `/*` with no `*/` of its own, so the regex
    // comment strip runs on to the next real comment's `*/`, eating
    // the border-radius (and the .b rule's selector) in between.
    const html = wrap(
      `<p class="a b c">Text.</p>`,
      `<style>
        .a { content: "/*"; border-radius: 999px; }
        /* a real comment */
        .b { border-radius: 999px; }
        .c { border-radius: 999px; }
      </style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('survives a realistic Tailwind-style sheet: @layer, nesting, data URIs, string braces', () => {
    const html = wrap(
      `<div class="rounded-full">One</div>
       <div class="rounded-full">Two</div>
       <div class="rounded-full">Three</div>
       <div class="card">Card</div>
       <p class="bg-indigo-600">A</p>
       <p class="bg-indigo-600">B</p>
       <span class="quote">Quoted</span>`,
      `<style>
        @layer utilities {
          .rounded-full { border-radius: calc(infinity * 1px); }
          .bg-indigo-600 { background-color: #4f46e5; }
          .card {
            border-radius: 999px;
            &:hover { box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25); }
          }
          .icon { background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'></svg>"); }
          .quote::before { content: "}"; }
        }
      </style>`,
    )
    // Pill: .rounded-full definition (1) + .card (1) + 3 DOM uses
    // (the rounded-full divs — the .card div is a CSS use, not a
    // utility use) − 1 definition = 4.
    expect(occurrencesOf(html, 'pill-radius')).toBe(4)
    // Palette: .bg-indigo-600 definition (1) + 2 DOM uses − 1 = 2.
    expect(occurrencesOf(html, 'blue-purple-palette')).toBe(2)
    // The nested &:hover shadow is oversized (50px blur) but only one
    // surface uses it — below the oversized-shadows threshold of 3.
    expect(groupOf(html, 'oversized-shadows')).toBeUndefined()
  })
})
