import type { AuthResult } from '@/types'
import { nextMockId } from '@/mock/runtime'

/* [MOCK-ONLY] 模拟会话：假 JWT（三段式形态）、localStorage 持久化、TTL 2h 与未来后端一致。 */

const TOKEN_KEY = 'joinyuu_client_token'
const TTL_SECONDS = 2 * 60 * 60

interface TokenPayload {
  sub: string
  scope: 'app'
  identities: AuthResult['identities']
  jti: string
  exp: number
}

function b64url(obj: unknown): string {
  return btoa(encodeURIComponent(JSON.stringify(obj)).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(Number.parseInt(p, 16))))
}

function signFakeJwt(payload: TokenPayload): string {
  return `${b64url({ alg: 'mock', typ: 'JWT' })}.${b64url(payload)}.${b64url({ sig: 'mock' })}`
}

export function issueToken(uid: string, identities: AuthResult['identities']): string {
  const payload: TokenPayload = {
    sub: uid,
    scope: 'app',
    identities,
    jti: `mock-${nextMockId('JTI')}`,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  }
  const token = signFakeJwt(payload)
  localStorage.setItem(TOKEN_KEY, token)
  return token
}

export function readPayload(): TokenPayload | null {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null
  try {
    const [, payloadB64] = token.split('.')
    const json = decodeURIComponent(escape(atob(payloadB64)))
    const payload = JSON.parse(json) as TokenPayload
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      clearToken()
      return null
    }
    return payload
  } catch {
    clearToken()
    return null
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
