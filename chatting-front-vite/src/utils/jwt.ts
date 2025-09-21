export type JwtPayload = Record<string, unknown> & {
  sub?: string
  username?: string
  user?: string
}

export function decodeJwt(token?: string | null): JwtPayload | null {
  if (!token || typeof token !== 'string') return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    let base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4
    if (pad) base64 += '='.repeat(4 - pad)
    const json = decodeURIComponent(
      Array.from(atob(base64))
        .map(c => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join('')
    )
    return JSON.parse(json)
  } catch { return null }
}

export function getLoginIdFromToken(token?: string | null): string | null {
  const p = decodeJwt(token) || {}
  return (p.sub as string) || (p.username as string) || (p.user as string) || null
}
