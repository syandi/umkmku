import type { GoogleIdentity } from '../../domain/user'
import { decodeBase64UrlText } from '../../lib/crypto'
import { GoogleAccessRevokedError, GoogleApiError, ValidationError } from '../../lib/errors'
import { defaultFetch, readJson, type FetchFn } from '../http'

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const VALID_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])

/**
 * drive.file = aplikasi HANYA bisa mengakses file yang dibuatnya sendiri.
 * Prinsip least-privilege, dan termasuk scope "non-sensitive" sehingga
 * verifikasi aplikasi di Google jauh lebih ringan dibanding scope `spreadsheets`.
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GOOGLE_SCOPES = ['openid', 'email', 'profile', DRIVE_FILE_SCOPE] as const

export interface GoogleOAuthOptions {
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
}

export interface GoogleTokens {
  readonly accessToken: string
  readonly expiresInSeconds: number
  readonly refreshToken: string | null
  readonly scopes: ReadonlySet<string>
  readonly idToken: string | null
}

export class GoogleOAuthClient {
  constructor(
    private readonly options: GoogleOAuthOptions,
    private readonly fetchFn: FetchFn = defaultFetch,
  ) {}

  buildAuthorizationUrl(params: { state: string; codeChallenge: string; forceConsent: boolean }): string {
    const url = new URL(AUTHORIZATION_ENDPOINT)
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      include_granted_scopes: 'true',
      // Refresh token hanya diberikan saat consent. Consent dipaksa hanya bila perlu
      // agar pengguna yang kembali tidak harus menyetujui ulang setiap login.
      prompt: params.forceConsent ? 'consent' : 'select_account',
    }).toString()
    return url.toString()
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<{ tokens: GoogleTokens; identity: GoogleIdentity }> {
    let tokens: GoogleTokens
    try {
      tokens = await this.requestToken({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: this.options.redirectUri,
      })
    } catch (error) {
      // invalid_grant saat tukar kode = kode kedaluwarsa/sudah dipakai, bukan akses dicabut.
      if (error instanceof GoogleAccessRevokedError) {
        throw new ValidationError('Sesi login kedaluwarsa. Silakan coba masuk lagi.')
      }
      throw error
    }

    if (!tokens.idToken) throw new GoogleApiError(502, 'id_token missing from token response')
    return { tokens, identity: this.readIdToken(tokens.idToken) }
  }

  /** @throws GoogleAccessRevokedError bila refresh token sudah tidak berlaku. */
  refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
    return this.requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken })
  }

  private async requestToken(params: Record<string, string>): Promise<GoogleTokens> {
    const response = await this.fetchFn(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        ...params,
      }),
    })
    const data = await readJson(response)

    if (!response.ok) {
      if (data.error === 'invalid_grant') throw new GoogleAccessRevokedError()
      throw new GoogleApiError(response.status, String(data.error_description ?? data.error ?? response.statusText))
    }
    if (typeof data.access_token !== 'string') {
      throw new GoogleApiError(502, 'access_token missing from token response')
    }

    return {
      accessToken: data.access_token,
      expiresInSeconds: typeof data.expires_in === 'number' ? data.expires_in : 3600,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
      scopes: new Set(typeof data.scope === 'string' ? data.scope.split(' ') : []),
      idToken: typeof data.id_token === 'string' ? data.id_token : null,
    }
  }

  /**
   * ID token diterima langsung dari token endpoint Google melalui HTTPS, sehingga
   * menurut dokumentasi Google verifikasi tanda tangan tidak wajib. Klaim penting
   * (iss, aud, exp, email_verified) tetap divalidasi.
   */
  private readIdToken(idToken: string): GoogleIdentity {
    const payloadSegment = idToken.split('.')[1]
    if (!payloadSegment) throw new GoogleApiError(502, 'malformed id_token')

    let claims: Record<string, unknown>
    try {
      claims = JSON.parse(decodeBase64UrlText(payloadSegment)) as Record<string, unknown>
    } catch {
      throw new GoogleApiError(502, 'unparseable id_token payload')
    }

    if (!VALID_ISSUERS.has(String(claims.iss))) throw new GoogleApiError(502, 'invalid id_token issuer')
    if (claims.aud !== this.options.clientId) throw new GoogleApiError(502, 'invalid id_token audience')
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) {
      throw new GoogleApiError(502, 'expired id_token')
    }
    if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') {
      throw new GoogleApiError(502, 'id_token missing sub/email')
    }
    if (claims.email_verified !== true) {
      throw new ValidationError('Email akun Google Anda belum terverifikasi.')
    }

    return {
      sub: claims.sub,
      email: claims.email,
      name: typeof claims.name === 'string' ? claims.name : claims.email,
      picture: typeof claims.picture === 'string' ? claims.picture : null,
    }
  }
}
