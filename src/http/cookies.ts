import type { AppConfig } from '../config'
import { parseCookies, serializeCookie } from '../lib/cookies'
import type { LoginTransaction } from '../services/auth-service'

const SESSION_COOKIE = 'sid'
const LOGIN_TRANSACTION_COOKIE = 'oauth_tx'
const LOGIN_TRANSACTION_TTL_SECONDS = 10 * 60

/** Semua detail cookie (nama, atribut, format) terkumpul di sini. */
export function createCookieJar(config: AppConfig) {
  const base = { secure: config.secureCookies, httpOnly: true, sameSite: 'Lax', path: '/' } as const

  return {
    readSession(request: Request): string | undefined {
      return parseCookies(request.headers.get('cookie')).get(SESSION_COOKIE) || undefined
    },
    session(token: string): string {
      return serializeCookie(SESSION_COOKIE, token, { ...base, maxAge: config.sessionTtlSeconds })
    },
    clearSession(): string {
      return serializeCookie(SESSION_COOKIE, '', { ...base, maxAge: 0 })
    },

    readLoginTransaction(request: Request): LoginTransaction | null {
      const value = parseCookies(request.headers.get('cookie')).get(LOGIN_TRANSACTION_COOKIE)
      const [state, codeVerifier] = value?.split('.') ?? []
      return state && codeVerifier ? { state, codeVerifier } : null
    },
    loginTransaction(transaction: LoginTransaction): string {
      // state & verifier berformat base64url sehingga "." aman sebagai pemisah.
      return serializeCookie(LOGIN_TRANSACTION_COOKIE, `${transaction.state}.${transaction.codeVerifier}`, {
        ...base,
        maxAge: LOGIN_TRANSACTION_TTL_SECONDS,
      })
    },
    clearLoginTransaction(): string {
      return serializeCookie(LOGIN_TRANSACTION_COOKIE, '', { ...base, maxAge: 0 })
    },
  }
}

export type CookieJar = ReturnType<typeof createCookieJar>
