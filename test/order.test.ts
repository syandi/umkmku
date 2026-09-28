import { describe, expect, it } from 'bun:test'
import { buildOrder, normalizeCustomer, parseCart } from '../src/domain/order'
import type { Product } from '../src/domain/product'
import { ValidationError } from '../src/lib/errors'

const catalog: Product[] = [
  { id: 'A', name: 'Keripik', price: 10000, description: '', imageUrl: null, stock: null },
  { id: 'B', name: 'Sambal', price: 25000, description: '', imageUrl: null, stock: 2 },
  { id: 'C', name: 'Habis', price: 5000, description: '', imageUrl: null, stock: 0 },
]
const customer = { name: 'Budi', address: 'Jl. Mawar 1', note: '' }

describe('parseCart', () => {
  it('menggabungkan item dengan ID yang sama', () => {
    const items = parseCart(JSON.stringify([
      { productId: 'A', quantity: 1 },
      { productId: 'A', quantity: 2 },
    ]))
    expect(items).toEqual([{ productId: 'A', quantity: 3 }])
  })

  it.each([
    ['bukan json', 'xx'],
    ['kosong', '[]'],
    ['qty desimal', JSON.stringify([{ productId: 'A', quantity: 1.5 }])],
    ['qty negatif', JSON.stringify([{ productId: 'A', quantity: -1 }])],
    ['tanpa id', JSON.stringify([{ quantity: 1 }])],
  ])('menolak input %s', (_label, json) => {
    expect(() => parseCart(json)).toThrow(ValidationError)
  })
})

describe('buildOrder', () => {
  it('menghitung subtotal dan total dari harga katalog (bukan dari klien)', () => {
    const order = buildOrder(catalog, [{ productId: 'A', quantity: 2 }, { productId: 'B', quantity: 1 }], customer)
    expect(order.lines.map((l) => l.subtotal)).toEqual([20000, 25000])
    expect(order.total).toBe(45000)
  })

  it('menolak produk yang tidak ada di katalog', () => {
    expect(() => buildOrder(catalog, [{ productId: 'Z', quantity: 1 }], customer)).toThrow(ValidationError)
  })

  it('menolak jumlah melebihi stok', () => {
    expect(() => buildOrder(catalog, [{ productId: 'B', quantity: 3 }], customer)).toThrow(/tersisa 2/)
    expect(() => buildOrder(catalog, [{ productId: 'C', quantity: 1 }], customer)).toThrow(/habis/)
  })
})

describe('normalizeCustomer', () => {
  it('merapikan spasi', () => {
    expect(normalizeCustomer({ name: '  Budi   Santoso ', address: ' Jl. A ' })).toEqual({
      name: 'Budi Santoso',
      address: 'Jl. A',
      note: '',
    })
  })

  it('mewajibkan nama', () => {
    expect(() => normalizeCustomer({ name: ' ' })).toThrow(ValidationError)
  })
})
