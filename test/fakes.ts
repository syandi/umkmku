import type { Product } from '../src/domain/product'
import type { Store, StoreInput } from '../src/domain/store'
import type {
  AccessTokenSource,
  CatalogCache,
  SheetCell,
  StoreRepository,
  StoreSpreadsheetGateway,
} from '../src/services/ports'

export class InMemoryStoreRepository implements StoreRepository {
  readonly stores = new Map<string, Store>()

  async findByOwner(ownerId: string) {
    return [...this.stores.values()].find((s) => s.ownerId === ownerId) ?? null
  }
  async findBySlug(slug: string) {
    return [...this.stores.values()].find((s) => s.slug === slug) ?? null
  }
  async create(data: StoreInput & { ownerId: string; spreadsheetId: string }) {
    const store: Store = { id: `store-${this.stores.size + 1}`, createdAt: 0, updatedAt: 0, ...data }
    this.stores.set(store.id, store)
    return store
  }
  async update(storeId: string, data: StoreInput) {
    const store = { ...this.stores.get(storeId)!, ...data }
    this.stores.set(storeId, store)
    return store
  }
  async updateSpreadsheet(storeId: string, spreadsheetId: string) {
    this.stores.set(storeId, { ...this.stores.get(storeId)!, spreadsheetId })
  }
}

export class FakeSheets implements StoreSpreadsheetGateway {
  rows: unknown[][] = []
  readonly appended: SheetCell[][] = []
  readonly created: string[] = []
  failAppend = false

  async createStoreSpreadsheet(_token: string, title: string) {
    this.created.push(title)
    return `sheet-${this.created.length}`
  }
  async getProductRows() {
    return this.rows
  }
  async appendOrderRow(_token: string, _id: string, row: readonly SheetCell[]) {
    if (this.failAppend) throw new Error('quota exceeded')
    this.appended.push([...row])
  }
}

export class FakeTokens implements AccessTokenSource {
  async getAccessToken(userId: string) {
    return `token-for-${userId}`
  }
  remember() {}
  invalidate() {}
}

export class MemoryCatalogCache implements CatalogCache {
  readonly entries = new Map<string, Product[]>()
  async get(id: string) {
    return this.entries.get(id) ?? null
  }
  async set(id: string, products: readonly Product[]) {
    this.entries.set(id, [...products])
  }
  async delete(id: string) {
    this.entries.delete(id)
  }
}
