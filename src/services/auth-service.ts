import type { User } from '../domain/user'
import { constantTimeEqual, randomToken, sha256Base64Url, type TokenCipher } from '../lib/crypto'
import { ForbiddenError, ValidationError } from '../lib/errors'
import { DRIVE_FILE_SCOPE, type GoogleOAuthClient } from '../infra/google/oauth'
import type { AccessTokenSource, SessionRepository, UserRepository } from './ports'

/** Data sementara antara redirect ke Google dan callback (disimpan di cookie HttpOnly). */
export interface LoginTransaction {
  readonly state: string
  readonly codeVerifier: string
}

export type LoginResult =
  | { readonly kind: 'success'; readonly sessionToken: string }
  /** Google tidak memberi refresh token & kita belum punya: ulangi login dengan prompt=consent. */
  | { readonly kind: 'consent_required' }

export interface AuthServiceDeps {
  readonly oauth: Pick<GoogleOAuthClient, 'buildAuthorizationUrl' | 'exchangeCode'>
  readonly users: UserRepository
  readonly sessions: SessionRepository
  readonly tokens: AccessTokenSource
  readonly cipher: Pick<TokenCipher, 'encrypt'>
  readonly sessionTtlSeconds: number
}

/** Alur login Google OAuth 2.0 (Authorization Code + PKCE) dan manajemen sesi. */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async beginLogin(forceConsent: boolean): Promise<{ authorizationUrl: string; transaction: LoginTransaction }> {
    const transaction: LoginTransaction = { state: randomToken(), codeVerifier: randomToken(48) }
    const authorizationUrl = this.deps.oauth.buildAuthorizationUrl({
      state: transaction.state,
      codeChallenge: await sha256Base64Url(transaction.codeVerifier),
      forceConsent,
    })
    return { authorizationUrl, transaction }
  }

  async completeLogin(input: {
    code: string
    state: string
    transaction: LoginTransaction | null
  }): Promise<LoginResult> {
    const { transaction } = input
    if (!transaction || !constantTimeEqual(input.state, transaction.state)) {
      throw new ValidationError('Sesi login tidak valid atau kedaluwarsa. Silakan coba masuk lagi.')
    }

    const { tokens, identity } = await this.deps.oauth.exchangeCode(input.code, transaction.codeVerifier)

    // Dengan granular consent, pengguna bisa menolak izin Drive walau login berhasil.
    if (!tokens.scopes.has(DRIVE_FILE_SCOPE)) {
      throw new ForbiddenError(
        'Izin "membuat dan mengelola file Google Drive" diperlukan agar katalog produk dapat disimpan di Google Sheets Anda. Silakan masuk lagi dan centang izin tersebut.',
      )
    }

    const encryptedRefreshToken = tokens.refreshToken ? await this.deps.cipher.encrypt(tokens.refreshToken) : null
    if (!encryptedRefreshToken && !(await this.deps.users.getEncryptedRefreshToken(identity.sub))) {
      return { kind: 'consent_required' }
    }

    const user = await this.deps.users.upsert(identity, encryptedRefreshToken)
    this.deps.tokens.remember(user.id, tokens.accessToken, tokens.expiresInSeconds)

    const sessionToken = await this.deps.sessions.create(user.id, this.deps.sessionTtlSeconds)
    return { kind: 'success', sessionToken }
  }

  async getUserBySession(sessionToken: string | undefined): Promise<User | null> {
    return sessionToken ? this.deps.sessions.findUser(sessionToken) : null
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (sessionToken) await this.deps.sessions.delete(sessionToken)
  }
}
