import { ValidationError } from '../lib/errors'
import { formatRupiah } from './money'
import type { Product } from './product'

export interface CartItem {
  readonly productId: string
  readonly quantity: number
}

export interface Customer {
  readonly name: string
  readonly address: string
  readonly note: string
}

export interface OrderLine {
  readonly product: Product
  readonly quantity: number
  readonly subtotal: number
}

export interface Order {
  readonly lines: readonly OrderLine[]
  readonly total: number
  readonly customer: Customer
}

export const MAX_CART_LINES = 50
export const MAX_QUANTITY = 999

/**
 * Keranjang dikirim browser sebagai JSON. Isinya TIDAK dipercaya:
 * hanya ID & jumlah yang diambil, harga selalu dihitung ulang dari spreadsheet.
 */
export function parseCart(json: string): CartItem[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new ValidationError('Data keranjang tidak valid. Silakan muat ulang halaman.')
  }

  if (!Array.isArray(data) || data.length === 0) throw new ValidationError('Keranjang masih kosong.')
  if (data.length > MAX_CART_LINES) throw new ValidationError(`Maksimal ${MAX_CART_LINES} jenis produk per pesanan.`)

  const quantities = new Map<string, number>()
  for (const item of data) {
    if (!isCartItemLike(item)) throw new ValidationError('Data keranjang tidak valid. Silakan muat ulang halaman.')
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }))
}

function isCartItemLike(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false
  const { productId, quantity } = value as Record<string, unknown>
  return (
    typeof productId === 'string' &&
    productId.length > 0 &&
    productId.length <= 100 &&
    typeof quantity === 'number' &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_QUANTITY
  )
}

export function normalizeCustomer(input: { name: string; address?: string; note?: string }): Customer {
  const name = collapseWhitespace(input.name)
  if (name.length < 2 || name.length > 80) throw new ValidationError('Nama pemesan harus 2–80 karakter.')

  const address = (input.address ?? '').trim()
  if (address.length > 300) throw new ValidationError('Alamat maksimal 300 karakter.')

  const note = (input.note ?? '').trim()
  if (note.length > 300) throw new ValidationError('Catatan maksimal 300 karakter.')

  return { name, address, note }
}

export function buildOrder(catalog: readonly Product[], items: readonly CartItem[], customer: Customer): Order {
  const productsById = new Map(catalog.map((product) => [product.id, product]))

  const lines = items.map((item): OrderLine => {
    const product = productsById.get(item.productId)
    if (!product) {
      throw new ValidationError('Ada produk di keranjang yang sudah tidak tersedia. Silakan muat ulang halaman.')
    }
    if (item.quantity > MAX_QUANTITY) {
      throw new ValidationError(`Jumlah ${product.name} maksimal ${MAX_QUANTITY}.`)
    }
    if (product.stock !== null && item.quantity > product.stock) {
      throw new ValidationError(
        product.stock === 0 ? `${product.name} sedang habis.` : `Stok ${product.name} tersisa ${product.stock}.`,
      )
    }
    return { product, quantity: item.quantity, subtotal: product.price * item.quantity }
  })

  return { lines, customer, total: lines.reduce((sum, line) => sum + line.subtotal, 0) }
}

/** Ringkasan item satu baris, dipakai untuk kolom "Item" di sheet Pesanan. */
export function summarizeOrderLines(order: Order): string {
  return order.lines.map((line) => `${line.product.name} x${line.quantity}`).join(', ')
}

export function formatOrderLine(line: OrderLine): string {
  return `${line.product.name} x${line.quantity} = ${formatRupiah(line.subtotal)}`
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}
