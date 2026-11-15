import { isPrivateHost as sharedIsPrivateHost } from './ipGuard.mjs'

export const normaliseUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

// The browser-side pre-check is the shared guard now (F9) — the
// same implementation the server uses, so the two can no longer
// disagree. Local hostnames are private by name, IP literals are
// judged by the shared address check, and DNS names are left for
// the server to resolve and judge.
export const isPrivateHost = (hostname: string): boolean =>
  sharedIsPrivateHost(hostname)
