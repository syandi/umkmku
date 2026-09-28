import type { GoogleIdentity, User } from '../../domain/user'
import type { UserRepository } from '../../services/ports'

export class D1UserRepository implements UserRepository {
  constructor(private readonly db: D1Database) {}

  async upsert(identity: GoogleIdentity, encryptedRefreshToken: string | null): Promise<User> {
    const now = Date.now()
    await this.db
      .prepare(
        `INSERT INTO users (id, email, name, picture, refresh_token_enc, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           picture = excluded.picture,
           refresh_token_enc = COALESCE(excluded.refresh_token_enc, users.refresh_token_enc),
           updated_at = excluded.updated_at`,
      )
      .bind(identity.sub, identity.email, identity.name, identity.picture, encryptedRefreshToken, now)
      .run()

    return { id: identity.sub, email: identity.email, name: identity.name, picture: identity.picture }
  }

  async getEncryptedRefreshToken(userId: string): Promise<string | null> {
    return this.db
      .prepare('SELECT refresh_token_enc FROM users WHERE id = ?1')
      .bind(userId)
      .first<string | null>('refresh_token_enc')
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.db
      .prepare('UPDATE users SET refresh_token_enc = NULL, updated_at = ?2 WHERE id = ?1')
      .bind(userId, Date.now())
      .run()
  }
}
