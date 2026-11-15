// Type declarations for server/fetch.mjs (plain JS, no types of its
// own). The CLI imports the guarded fetch from here; these
// declarations let `tsc -b` check that import without pulling the
// server into the app bundle. They must match the real exports in
// fetch.mjs — if the guard's surface changes, update this file too.
export class FetchError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string)
}

export const MAX_HTML_BYTES: number
export const MAX_CSS_BYTES: number
export const MAX_REDIRECTS: number
export const FETCH_TIMEOUT_MS: number

export function isPrivateAddress(address: string): boolean
export function validateTarget(
  input: string,
  options?: { allowPrivate?: boolean },
): Promise<string>
export function fetchPage(
  input: string,
  options?: { allowPrivate?: boolean },
): Promise<{ url: string; contentType: string; html: string }>
export function fetchCss(
  input: string,
  options?: { allowPrivate?: boolean },
): Promise<{ url: string; css: string }>
