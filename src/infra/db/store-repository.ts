import { parseOpeningHours, serializeOpeningHours, type OpeningHours } from '../../domain/opening-hours'
import type { Store, StoreInput } from '../../domain/store'
import { NotFoundError, ValidationError } from '../../lib/errors'
import type { StoreRepository } from '../../services/ports'

interface StoreRow {
  id: string
  owner_id: string
  slug: string
  name: string
  whatsapp: string
  spreadsheet_id: string
  opening_hours: string | null
  created_at: number
  updated_at: number
}

const STORE_COLUMNS = 'id, owner_id, slug, name, whatsapp, spreadsheet_id, opening_hours, created_at, updated_at'
const SELECT_STORE = `SELECT ${STORE_COLUMNS} FROM stores`

export class D1StoreRepository implements StoreRepository {
  constructor(private readonly db: D1Database) {}

  async findByOwner(ownerId: string): Promise<Store | null> {
    const row = await this.db.prepare(`${SELECT_STORE} WHERE owner_id = ?1`).bind(ownerId).first<StoreRow>()
    return row ? toStore(row) : null
  }

  async findBySlug(slug: string): Promise<Store | null> {
    const row = await this.db.prepare(`${SELECT_STORE} WHERE slug = ?1`).bind(slug).first<StoreRow>()
    return row ? toStore(row) : null
  }

  async create(data: StoreInput & { ownerId: string; spreadsheetId: string }): Promise<Store> {
    const now = Date.now()
    const store: Store = { id: crypto.randomUUID(), openingHours: null, createdAt: now, updatedAt: now, ...data }
    await this.withUniqueSlugGuard(() =>
      this.db
        .prepare(
          `INSERT INTO stores (id, owner_id, slug, name, whatsapp, spreadsheet_id, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
        )
        .bind(store.id, store.ownerId, store.slug, store.name, store.whatsapp, store.spreadsheetId, now)
        .run(),
    )
    return store
  }

  async update(storeId: string, data: StoreInput): Promise<Store> {
    const row = await this.withUniqueSlugGuard(() =>
      this.db
        .prepare(
          `UPDATE stores SET slug = ?2, name = ?3, whatsapp = ?4, updated_at = ?5
           WHERE id = ?1
           RETURNING ${STORE_COLUMNS}`,
        )
        .bind(storeId, data.slug, data.name, data.whatsapp, Date.now())
        .first<StoreRow>(),
    )
    if (!row) throw new NotFoundError('Toko')
    return toStore(row)
  }

  async updateSpreadsheet(storeId: string, spreadsheetId: string): Promise<void> {
    await this.db
      .prepare('UPDATE stores SET spreadsheet_id = ?2, updated_at = ?3 WHERE id = ?1')
      .bind(storeId, spreadsheetId, Date.now())
      .run()
  }

  async updateOpeningHours(storeId: string, hours: OpeningHours): Promise<void> {
    await this.db
      .prepare('UPDATE stores SET opening_hours = ?2, updated_at = ?3 WHERE id = ?1')
      .bind(storeId, serializeOpeningHours(hours), Date.now())
      .run()
  }

  /** Constraint UNIQUE adalah sumber kebenaran untuk slug (aman dari race condition). */
  private async withUniqueSlugGuard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: stores.slug')) {
        throw new ValidationError('Alamat toko sudah dipakai. Silakan pilih yang lain.')
      }
      throw error
    }
  }
}

function toStore(row: StoreRow): Store {
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    name: row.name,
    whatsapp: row.whatsapp,
    spreadsheetId: row.spreadsheet_id,
    openingHours: parseOpeningHours(row.opening_hours),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
