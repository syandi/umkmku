import { buildOrder, normalizeCustomer, parseCart, summarizeOrderLines, type Order } from '../domain/order'
import { parseProductRows, type Product } from '../domain/product'
import { validateStoreInput, type Store } from '../domain/store'
import type { User } from '../domain/user'
import { buildOrderMessage, buildWhatsAppUrl } from '../domain/whatsapp'
import {
  GoogleAccessRevokedError,
  GoogleApiError,
  NotFoundError,
  SpreadsheetUnavailableError,
  ValidationError,
} from '../lib/errors'
import type { AccessTokenSource, CatalogCache, StoreRepository, StoreSpreadsheetGateway } from './ports'

/** Status katalog untuk dashboard: pemilik perlu tahu *mengapa* produk tidak tampil. */
export type CatalogStatus =
  | { readonly kind: 'ok'; readonly products: readonly Product[] }
  | { readonly kind: 'google_access_revoked' }
  | { readonly kind: 'spreadsheet_unavailable' }
  | { readonly kind: 'error' }

export interface CheckoutInput {
  readonly cart: string
  readonly name: string
  readonly address?: string
  readonly note?: string
}

export interface StoreServiceDeps {
  readonly stores: StoreRepository
  readonly sheets: StoreSpreadsheetGateway
  readonly tokens: AccessTokenSource
  readonly catalogCache: CatalogCache
  readonly now?: () => Date
}

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

export class StoreService {
  constructor(private readonly deps: StoreServiceDeps) {}

  findByOwner(ownerId: string): Promise<Store | null> {
    return this.deps.stores.findByOwner(ownerId)
  }

  async getBySlug(slug: string): Promise<Store> {
    const store = await this.deps.stores.findBySlug(slug.toLowerCase())
    if (!store) throw new NotFoundError('Toko')
    return store
  }

  /** Membuat toko baru (beserta spreadsheet-nya) atau memperbarui pengaturan toko. */
  async saveStore(owner: User, raw: { name: string; slug: string; whatsapp: string }): Promise<Store> {
    const input = validateStoreInput(raw)

    const slugOwner = await this.deps.stores.findBySlug(input.slug)
    if (slugOwner && slugOwner.ownerId !== owner.id) {
      throw new ValidationError('Alamat toko sudah dipakai. Silakan pilih yang lain.')
    }

    const existing = await this.deps.stores.findByOwner(owner.id)
    if (existing) return this.deps.stores.update(existing.id, input)

    const spreadsheetId = await this.createSpreadsheet(owner.id, input.name)
    return this.deps.stores.create({ ...input, ownerId: owner.id, spreadsheetId })
  }

  /** Untuk kasus spreadsheet terhapus: buat yang baru dan tautkan ke toko. */
  async recreateSpreadsheet(owner: User): Promise<void> {
    const store = await this.deps.stores.findByOwner(owner.id)
    if (!store) throw new NotFoundError('Toko')

    const spreadsheetId = await this.createSpreadsheet(owner.id, store.name)
    await this.deps.stores.updateSpreadsheet(store.id, spreadsheetId)
    await this.deps.catalogCache.delete(store.id)
  }

  /**
   * Katalog produk aktif. Default memakai cache singkat; `fresh` membaca langsung dari
   * spreadsheet (dipakai saat checkout & dashboard) lalu memperbarui cache.
   */
  async getCatalog(store: Store, options: { fresh?: boolean } = {}): Promise<readonly Product[]> {
    if (!options.fresh) {
      const cached = await this.deps.catalogCache.get(store.id)
      if (cached) return cached
    }

    const rows = await this.withOwnerToken(store.ownerId, (token) =>
      this.deps.sheets.getProductRows(token, store.spreadsheetId),
    )
    const products = parseProductRows(rows)
    await this.deps.catalogCache.set(store.id, products)
    return products
  }

  async getCatalogStatus(store: Store): Promise<CatalogStatus> {
    try {
      return { kind: 'ok', products: await this.getCatalog(store, { fresh: true }) }
    } catch (error) {
      if (error instanceof GoogleAccessRevokedError) return { kind: 'google_access_revoked' }
      if (error instanceof SpreadsheetUnavailableError) return { kind: 'spreadsheet_unavailable' }
      console.error('Failed to load catalog for dashboard', error)
      return { kind: 'error' }
    }
  }

  /**
   * Memvalidasi keranjang terhadap katalog terbaru, mencatat pesanan ke sheet "Pesanan",
   * lalu mengembalikan URL wa.me berisi pesan pesanan.
   */
  async checkout(slug: string, input: CheckoutInput): Promise<string> {
    const store = await this.getBySlug(slug)
    const items = parseCart(input.cart)
    const customer = normalizeCustomer(input)
    const order = buildOrder(await this.getCatalog(store, { fresh: true }), items, customer)

    await this.recordOrder(store, order)
    return buildWhatsAppUrl(store.whatsapp, buildOrderMessage(store.name, order))
  }

  /** Best-effort: kegagalan mencatat tidak boleh menggagalkan pesanan via WhatsApp. */
  private async recordOrder(store: Store, order: Order): Promise<void> {
    try {
      await this.withOwnerToken(store.ownerId, (token) =>
        this.deps.sheets.appendOrderRow(token, store.spreadsheetId, [
          this.jakartaTimestamp(),
          order.customer.name,
          order.customer.address,
          order.customer.note,
          summarizeOrderLines(order),
          order.total,
        ]),
      )
    } catch (error) {
      console.error(`Failed to record order for store ${store.id}`, error)
    }
  }

  private async createSpreadsheet(ownerId: string, storeName: string): Promise<string> {
    return this.withOwnerToken(ownerId, (token) =>
      this.deps.sheets.createStoreSpreadsheet(token, `Katalog ${storeName} — UMKMku`),
    )
  }

  /** Menjalankan operasi dengan access token pemilik; token di-reset bila Google menolaknya (401). */
  private async withOwnerToken<T>(ownerId: string, operation: (token: string) => Promise<T>): Promise<T> {
    const token = await this.deps.tokens.getAccessToken(ownerId)
    try {
      return await operation(token)
    } catch (error) {
      if (error instanceof GoogleApiError && error.apiStatus === 401) this.deps.tokens.invalidate(ownerId)
      throw error
    }
  }

  private jakartaTimestamp(): string {
    const now = this.deps.now?.() ?? new Date()
    return new Date(now.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
  }
}
