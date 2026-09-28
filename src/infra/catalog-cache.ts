import type { Product } from '../domain/product'
import type { CatalogCache } from '../services/ports'

/**
 * Cache katalog di edge memakai Cache API Cloudflare.
 * Tujuannya menjaga kuota Google Sheets API (per menit) tetap aman saat toko ramai.
 *
 * Catatan: Cache API tidak aktif di subdomain *.workers.dev (no-op, tetap aman);
 * gunakan custom domain di produksi agar cache berfungsi.
 */
export class EdgeCatalogCache implements CatalogCache {
  constructor(
    private readonly ttlSeconds = 60,
    /** Di-resolve saat dipakai, karena instance ini dibuat di global scope Worker. */
    private readonly resolveCache: () => Cache = () => caches.default,
  ) {}

  private get cache(): Cache {
    return this.resolveCache()
  }

  async get(storeId: string): Promise<Product[] | null> {
    const response = await this.cache.match(this.key(storeId))
    if (!response) return null
    try {
      return (await response.json()) as Product[]
    } catch {
      return null
    }
  }

  async set(storeId: string, products: readonly Product[]): Promise<void> {
    await this.cache.put(
      this.key(storeId),
      new Response(JSON.stringify(products), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${this.ttlSeconds}` },
      }),
    )
  }

  async delete(storeId: string): Promise<void> {
    await this.cache.delete(this.key(storeId))
  }

  private key(storeId: string): Request {
    return new Request(`https://catalog-cache.umkmku.internal/${encodeURIComponent(storeId)}`)
  }
}
