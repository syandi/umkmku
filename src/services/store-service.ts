import {
  describeNextOpening,
  resolveOpenStatus,
  STORE_TIMEZONES,
  DEFAULT_TIMEZONE,
  validateOpeningHoursInput,
  type OpenStatus,
} from '../domain/opening-hours'
import {
  buildPaymentProofMessage,
  generateOrderCode,
  parsePaymentMethod,
  parseTableNumber,
  type PaymentMethod,
} from '../domain/dining'
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
import type {
  AccessTokenSource,
  CatalogCache,
  StoreRepository,
  StoreSpreadsheetGateway,
} from './ports'

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
  /** Nomor meja (mode warung). Bila ada, `payment` wajib dan alamat diabaikan. */
  readonly table?: string
  readonly payment?: string
}

/** Struk pesanan meja: dirender sebagai halaman konfirmasi berisi QRIS & tombol bukti bayar. */
export interface DineInReceipt {
  readonly code: string
  readonly table: string
  readonly payment: PaymentMethod
  readonly order: Order
  readonly proofUrl: string
}

export type CheckoutResult =
  | { readonly kind: 'whatsapp'; readonly url: string }
  | { readonly kind: 'dine_in'; readonly receipt: DineInReceipt }

export interface StoreServiceDeps {
  readonly stores: StoreRepository
  readonly sheets: StoreSpreadsheetGateway
  readonly tokens: AccessTokenSource
  readonly catalogCache: CatalogCache
  readonly generateCode?: () => string
  readonly now?: () => Date
}

interface DiningColumns {
  readonly table: string
  readonly code: string
  readonly payment: string
  readonly status: string
}

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

  /** Menyimpan jadwal buka dari form dashboard. */
  async updateOpeningHours(owner: User, raw: Readonly<Record<string, string | undefined>>): Promise<void> {
    const store = await this.deps.stores.findByOwner(owner.id)
    if (!store) throw new NotFoundError('Toko')
    await this.deps.stores.updateOpeningHours(store.id, validateOpeningHoursInput(raw))
  }

  getOpenStatus(store: Store): OpenStatus {
    return resolveOpenStatus(store.openingHours, this.now())
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
   * Memvalidasi keranjang terhadap katalog terbaru dan mencatat pesanan ke sheet "Pesanan".
   * Tanpa nomor meja → URL wa.me berisi pesanan. Dengan nomor meja → struk untuk halaman pembayaran.
   */
  async checkout(slug: string, input: CheckoutInput): Promise<CheckoutResult> {
    const store = await this.getBySlug(slug)
    this.assertAcceptingOrders(store)
    const items = parseCart(input.cart)
    const table = parseTableNumber(input.table)
    const customer = normalizeCustomer(table ? { ...input, address: '' } : input)
    const order = buildOrder(await this.getCatalog(store, { fresh: true }), items, customer)

    if (!table) {
      await this.recordOrder(store, order, { table: '', code: '', payment: '', status: '' })
      return { kind: 'whatsapp', url: buildWhatsAppUrl(store.whatsapp, buildOrderMessage(store.name, order)) }
    }

    const payment = parsePaymentMethod(input.payment)

    const code = (this.deps.generateCode ?? generateOrderCode)()
    await this.recordOrder(store, order, {
      table,
      code,
      payment: payment === 'qris' ? 'QRIS' : 'Tunai',
      status: payment === 'qris' ? 'Menunggu bukti bayar' : 'Bayar di kasir',
    })
    const proofUrl = buildWhatsAppUrl(store.whatsapp, buildPaymentProofMessage(store.name, code, table, order))
    return { kind: 'dine_in', receipt: { code, table, payment, order, proofUrl } }
  }

  /** Aturan bisnis: pesanan hanya diterima saat toko buka (ditegakkan di server, bukan hanya di UI). */
  private assertAcceptingOrders(store: Store): void {
    const status = this.getOpenStatus(store)
    if (status.isOpen) return
    const next = describeNextOpening(status.nextOpen, store.openingHours)
    throw new ValidationError(
      `Maaf, ${store.name} sedang tutup sehingga pesanan belum dapat diterima.` +
        (next ? ` Silakan pesan lagi ${next}.` : ''),
    )
  }

  /** Best-effort: kegagalan mencatat tidak boleh menggagalkan pesanan via WhatsApp. */
  private async recordOrder(store: Store, order: Order, dining: DiningColumns): Promise<void> {
    try {
      await this.withOwnerToken(store.ownerId, (token) =>
        this.deps.sheets.appendOrderRow(token, store.spreadsheetId, [
          this.localTimestamp(store),
          order.customer.name,
          order.customer.address,
          order.customer.note,
          summarizeOrderLines(order),
          order.total,
          dining.table,
          dining.code,
          dining.payment,
          dining.status,
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

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  /** Waktu pesanan dalam zona waktu toko, mis. "2026-09-28 09:00:00". */
  private localTimestamp(store: Store): string {
    const { offsetMinutes } = STORE_TIMEZONES[store.openingHours?.timezone ?? DEFAULT_TIMEZONE]
    return new Date(this.now().getTime() + offsetMinutes * 60_000).toISOString().slice(0, 19).replace('T', ' ')
  }
}
