import type { SafeHtml } from '../lib/html'

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https: data:",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  // form-action juga berlaku untuk redirect setelah submit (checkout -> wa.me -> api.whatsapp.com).
  "form-action 'self' https://wa.me https://api.whatsapp.com",
].join('; ')

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
}

export interface ResponseOptions {
  readonly status?: number
  /** Nilai Set-Cookie yang sudah diserialisasi. */
  readonly cookies?: readonly string[]
}

function baseHeaders(options: ResponseOptions): Headers {
  const headers = new Headers()
  for (const cookie of options.cookies ?? []) headers.append('set-cookie', cookie)
  return headers
}

export function htmlResponse(body: SafeHtml, options: ResponseOptions = {}): Response {
  const headers = baseHeaders(options)
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.set('cache-control', 'no-store')
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
  return new Response(body.value, { status: options.status ?? 200, headers })
}

export function redirectResponse(location: string, options: ResponseOptions & { status?: 302 | 303 } = {}): Response {
  const headers = baseHeaders(options)
  headers.set('location', location)
  headers.set('cache-control', 'no-store')
  return new Response(null, { status: options.status ?? 302, headers })
}
