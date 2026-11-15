// @vitest-environment happy-dom
// F40 — style thresholds too eager for ordinary Tailwind usage: a
// real site that uses rounded-full three times, or two indigo
// accents, was flagged. Pill radius is now scoped to surfaces
// (small controls are exempt), and the palette needs three signals.
import { describe, expect, it } from 'vitest'
import { analyzeSite } from './siteAnalyzer'

const wrap = (body: string, head = '') => `<!doctype html>
<html>
  <head>
    <title>Probe</title>
    <meta name="description" content="A probe page for the F40 checks." />
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

describe('F40: style thresholds for ordinary Tailwind usage', () => {
  it('does not fire pill-radius for an avatar, a badge, and a toggle (the audit probe)', () => {
    const html = wrap(
      `<img class="rounded-full" src="/avatar.png" alt="Avatar" />
       <span class="badge rounded-full">New</span>
       <button class="rounded-full">Toggle</button>`,
      `<style>.rounded-full { border-radius: calc(infinity * 1px); }</style>`,
    )
    expect(groupOf(html, 'pill-radius')).toBeUndefined()
  })

  it('does not fire blue-purple-palette for two used indigo declarations (the audit probe)', () => {
    const html = wrap(
      `<p class="a b">Text.</p>`,
      `<style>
        .a { color: oklch(0.585 0.233 277.117); }
        .b { color: oklch(0.606 0.25 293); }
      </style>`,
    )
    expect(groupOf(html, 'blue-purple-palette')).toBeUndefined()
  })

  it('still fires pill-radius for three pill surfaces', () => {
    const html = wrap(
      `<div class="card-a">One</div><div class="card-b">Two</div><div class="card-c">Three</div>`,
      `<style>
        .card-a { border-radius: 999px; }
        .card-b { border-radius: 999px; }
        .card-c { border-radius: 999px; }
      </style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('still fires pill-radius for three rounded-full divs', () => {
    const html = wrap(
      `<div class="rounded-full">One</div>
       <div class="rounded-full">Two</div>
       <div class="rounded-full">Three</div>`,
      `<style>.rounded-full { border-radius: calc(infinity * 1px); }</style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('does not count a pill button toward the three surfaces', () => {
    const html = wrap(
      `<div class="card-a">One</div>
       <div class="card-b">Two</div>
       <button class="rounded-full">Three</button>`,
      `<style>
        .card-a { border-radius: 999px; }
        .card-b { border-radius: 999px; }
        .rounded-full { border-radius: calc(infinity * 1px); }
      </style>`,
    )
    // Two surfaces plus one exempt button: below the threshold.
    expect(groupOf(html, 'pill-radius')).toBeUndefined()
  })

  it('still fires blue-purple-palette for three indigo accents', () => {
    const html = wrap(
      `<p class="a b c">Text.</p>`,
      `<style>
        .a { color: oklch(0.585 0.233 277.117); }
        .b { color: oklch(0.606 0.25 293); }
        .c { color: #8b5cf6; }
      </style>`,
    )
    expect(occurrencesOf(html, 'blue-purple-palette')).toBe(3)
  })
})
