/**
 * Kontrak (port) yang dibutuhkan service. Implementasi konkret ada di src/infra.
 * Service hanya bergantung pada interface ini sehingga mudah diuji dengan fake.
 */
import type { OpeningHours } from '../domain/opening-hours'
import type { Product } from '../domain/product'
import type { Store, StoreInput } from '../domain/store'
import type { GoogleIdentity, User } from '../domain/user'

export interface UserRepository {
  /** Insert/update profil. Refresh token hanya ditimpa bila nilai baru tidak null. */
  upsert(identity: GoogleIdentity, encryptedRefreshToken: string | null): Promise<User>
  getEncryptedRefreshToken(userId: string): Promise<string | null>
  clearRefreshToken(userId: string): Promise<void>
}

export interface SessionRepository {
  /** Membuat sesi dan mengembalikan token mentah (untuk cookie). */
  create(userId: string, ttlSeconds: number): Promise<string>
  findUser(token: string): Promise<User | null>
  delete(token: string): Promise<void>
}

export interface StoreRepository {
  findByOwner(ownerId: string): Promise<Store | null>
  findBySlug(slug: string): Promise<Store | null>
  create(data: StoreInput & { ownerId: string; spreadsheetId: string }): Promise<Store>
  update(storeId: string, data: StoreInput): Promise<Store>
  updateSpreadsheet(storeId: string, spreadsheetId: string): Promise<void>
  updateOpeningHours(storeId: string, hours: OpeningHours): Promise<void>
}

export interface CatalogCache {
  get(storeId: string): Promise<Product[] | null>
  set(storeId: string, products: readonly Product[]): Promise<void>
  delete(storeId: string): Promise<void>
}

export type SheetCell = string | number | boolean

export interface StoreSpreadsheetGateway {
  createStoreSpreadsheet(accessToken: string, title: string): Promise<string>
  getProductRows(accessToken: string, spreadsheetId: string): Promise<unknown[][]>
  appendOrderRow(accessToken: string, spreadsheetId: string, row: readonly SheetCell[]): Promise<void>
}

export interface AccessTokenSource {
  getAccessToken(userId: string): Promise<string>
  remember(userId: string, accessToken: string, expiresInSeconds: number): void
  invalidate(userId: string): void
}
