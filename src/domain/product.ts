/**
 * Produk dibaca dari sheet "Produk" milik pemilik toko.
 * Urutan kolom adalah kontrak antara aplikasi dan spreadsheet — ubah dengan hati-hati.
 */
export interface Product {
  readonly id: string
  readonly name: string
  readonly price: number
  readonly description: string
  readonly imageUrl: string | null
  /** null = stok tidak dibatasi */
  readonly stock: number | null
}

export const PRODUCT_SHEET_NAME = 'Produk'
export const PRODUCT_COLUMNS = ['ID', 'Nama', 'Harga', 'Deskripsi', 'URL Gambar', 'Stok', 'Aktif'] as const
/** Range data (tanpa header), mis. "Produk!A2:G". */
export const PRODUCT_DATA_RANGE = `${PRODUCT_SHEET_NAME}!A2:G`
export const PRODUCT_FIRST_DATA_ROW = 2

const MAX_NAME_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 500

export function isAvailable(product: Product): boolean {
  return product.stock === null || product.stock > 0
}

/**
 * Mengubah baris mentah spreadsheet menjadi produk valid.
 * Baris tidak valid (tanpa nama/harga) atau nonaktif dilewati tanpa error,
 * karena spreadsheet diedit manual oleh pemilik toko.
 */
export function parseProductRows(
  rows: readonly (readonly unknown[])[],
  firstRowNumber = PRODUCT_FIRST_DATA_ROW,
): Product[] {
  const products: Product[] = []
  const seenIds = new Set<string>()

  rows.forEach((row, index) => {
    const product = parseProductRow(row, firstRowNumber + index)
    if (product && !seenIds.has(product.id)) {
      seenIds.add(product.id)
      products.push(product)
    }
  })
  return products
}

function parseProductRow(row: readonly unknown[], rowNumber: number): Product | null {
  const [id, name, price, description, imageUrl, stock, active] = row
  const productName = toText(name)
  const productPrice = toInteger(price)

  if (!productName || productPrice === null || productPrice <= 0) return null
  if (!toBoolean(active, true)) return null

  return {
    id: toText(id) || `R${rowNumber}`,
    name: productName.slice(0, MAX_NAME_LENGTH),
    price: productPrice,
    description: toText(description).slice(0, MAX_DESCRIPTION_LENGTH),
    imageUrl: toHttpUrl(imageUrl),
    stock: toStock(stock),
  }
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null
  if (typeof value === 'string') {
    // Toleran terhadap input seperti "Rp 15.000".
    const digits = value.replace(/\D/g, '')
    return digits ? Number(digits) : null
  }
  return null
}

function toStock(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const parsed = toInteger(value)
  return parsed === null ? null : Math.max(0, parsed)
}

const FALSY_WORDS = new Set(['false', 'tidak', 'no', 'n', '0', 'nonaktif'])
const TRUTHY_WORDS = new Set(['true', 'ya', 'yes', 'y', '1', 'aktif'])

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (FALSY_WORDS.has(normalized)) return false
    if (TRUTHY_WORDS.has(normalized)) return true
  }
  return fallback
}

function toHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}
