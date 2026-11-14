export const normaliseUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::' ||
    host === '::1'
  ) {
    return true
  }

  if (host.startsWith('::ffff:')) return isPrivateHost(host.slice('::ffff:'.length))
  if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('ff')) return true

  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return false

  const a = Number(match[1])
  const b = Number(match[2])
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}
