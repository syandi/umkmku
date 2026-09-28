import type { User } from '../../domain/user'
import { randomToken, sha256Base64Url } from '../../lib/crypto'
import type { SessionRepository } from '../../services/ports'

interface SessionUserRow {
  id: string
  email: string
  name: string
  picture: string | null
}

/**
 * Sesi server-side. Database hanya menyimpan hash token, sehingga kebocoran
 * database tidak bisa dipakai untuk membajak sesi.
 */
export class D1SessionRepository implements SessionRepository {
  constructor(private readonly db: D1Database) {}

  async create(userId: string, ttlSeconds: number): Promise<string> {
    const token = randomToken()
    const now = Date.now()
    await this.db.batch([
      // Pembersihan sesi kedaluwarsa secara oportunistik (murah, tanpa cron).
      this.db.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
      this.db
        .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)')
        .bind(await sha256Base64Url(token), userId, now + ttlSeconds * 1000, now),
    ])
    return token
  }

  async findUser(token: string): Promise<User | null> {
    const row = await this.db
      .prepare(
        `SELECT u.id, u.email, u.name, u.picture
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ?1 AND s.expires_at > ?2`,
      )
      .bind(await sha256Base64Url(token), Date.now())
      .first<SessionUserRow>()
    return row ? { id: row.id, email: row.email, name: row.name, picture: row.picture } : null
  }

  async delete(token: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE id = ?1').bind(await sha256Base64Url(token)).run()
  }
}
