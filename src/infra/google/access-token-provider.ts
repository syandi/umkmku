import type { TokenCipher } from '../../lib/crypto'
import { GoogleAccessRevokedError } from '../../lib/errors'
import type { AccessTokenSource, UserRepository } from '../../services/ports'
import type { GoogleOAuthClient } from './oauth'

interface CachedToken {
  readonly value: string
  readonly expiresAt: number
}

/** Token diperbarui 60 detik sebelum kedaluwarsa agar tidak habis di tengah request. */
const EXPIRY_MARGIN_MS = 60_000

/**
 * Menyediakan access token Google milik pemilik toko, dari refresh token terenkripsi.
 *
 * Cache in-memory per isolate: Workers menggunakan ulang isolate antar request,
 * sehingga cache ini memangkas panggilan ke token endpoint secara signifikan.
 * Yang di-cache hanya string (bukan Promise) — berbagi Promise I/O antar request
 * tidak diizinkan oleh runtime Workers.
 */
export class GoogleAccessTokenProvider implements AccessTokenSource {
  private readonly cache = new Map<string, CachedToken>()

  constructor(
    private readonly oauth: GoogleOAuthClient,
    private readonly users: UserRepository,
    private readonly cipher: TokenCipher,
    private readonly now: () => number = Date.now,
  ) {}

  async getAccessToken(userId: string): Promise<string> {
    const cached = this.cache.get(userId)
    if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > this.now()) return cached.value
    return this.refresh(userId)
  }

  remember(userId: string, accessToken: string, expiresInSeconds: number): void {
    this.cache.set(userId, { value: accessToken, expiresAt: this.now() + expiresInSeconds * 1000 })
  }

  invalidate(userId: string): void {
    this.cache.delete(userId)
  }

  private async refresh(userId: string): Promise<string> {
    const encrypted = await this.users.getEncryptedRefreshToken(userId)
    if (!encrypted) throw new GoogleAccessRevokedError()

    try {
      const tokens = await this.oauth.refreshAccessToken(await this.cipher.decrypt(encrypted))
      this.remember(userId, tokens.accessToken, tokens.expiresInSeconds)
      return tokens.accessToken
    } catch (error) {
      if (error instanceof GoogleAccessRevokedError) {
        this.invalidate(userId)
        await this.users.clearRefreshToken(userId)
      }
      throw error
    }
  }
}
