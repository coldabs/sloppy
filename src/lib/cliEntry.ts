// Entry point for the CLI bundle (dist/cli/sloppy-lib.mjs). The
// analyser is TypeScript, so the CLI cannot import it directly from
// plain node: `npm run build` bundles this file with Vite, and
// bin/sloppy.mjs imports the bundle.
//
// analyzeSite() needs a DOM — DOMParser, and the HTMLInputElement
// check in the site rules — which node does not have. The bundle
// registers the missing globals from happy-dom (already a
// devDependency, used by the tests) before anything analyses a page.
// Only names node does not already define are copied, so node's own
// fetch, URL, and timers are never shadowed.

import { Window } from 'happy-dom'

// The browser names the analyser touches, from the same window the
// parsed documents come from, so instanceof checks agree with the
// elements they test.
const DOM_GLOBALS = [
  'DOMParser',
  'Document',
  'DocumentFragment',
  'DocumentType',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'Node',
  'Text',
  'Event',
  'CustomEvent',
  'SVGElement',
] as const

export const registerDomGlobals = (): void => {
  if (typeof globalThis.DOMParser !== 'undefined') return
  const window = new Window() as unknown as Record<string, unknown>
  for (const name of DOM_GLOBALS) {
    if (name in globalThis) continue
    const value = window[name]
    if (value !== undefined) {
      ;(globalThis as Record<string, unknown>)[name] = value
    }
  }
}

registerDomGlobals()

export { runCli, parseCliArgs, USAGE, DEFAULT_THRESHOLD } from './cli'
