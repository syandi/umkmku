import { describe, expect, it } from 'bun:test'
import { isAvailable, parseProductRows } from '../src/domain/product'

describe('parseProductRows', () => {
  it('memetakan kolom spreadsheet ke produk', () => {
    const [product] = parseProductRows([
      ['P01', 'Keripik Singkong', 15000, 'Pedas manis', 'https://img.example.com/a.jpg', 10, true],
    ])
    expect(product).toEqual({
      id: 'P01',
      name: 'Keripik Singkong',
      price: 15000,
      description: 'Pedas manis',
      imageUrl: 'https://img.example.com/a.jpg',
      stock: 10,
    })
  })

  it('melewati baris tanpa nama, harga tidak valid, atau nonaktif', () => {
    const products = parseProductRows([
      ['A', '', 1000],
      ['B', 'Tanpa harga', ''],
      ['C', 'Harga nol', 0],
      ['D', 'Nonaktif', 1000, '', '', '', 'tidak'],
      ['E', 'Valid', 1000],
    ])
    expect(products.map((p) => p.id)).toEqual(['E'])
  })

  it('memakai nomor baris sebagai ID cadangan dan membuang ID duplikat', () => {
    const products = parseProductRows([
      ['', 'Tanpa ID', 5000],
      ['X', 'Pertama', 1000],
      ['X', 'Duplikat', 2000],
    ])
    expect(products.map((p) => [p.id, p.name])).toEqual([
      ['R2', 'Tanpa ID'],
      ['X', 'Pertama'],
    ])
  })

  it('toleran terhadap format harga teks dan stok kosong', () => {
    const [product] = parseProductRows([['P', 'Kopi', 'Rp 18.000', '', '', '']])
    expect(product?.price).toBe(18000)
    expect(product?.stock).toBeNull()
  })

  it('menolak URL gambar non-http', () => {
    const [product] = parseProductRows([['P', 'Kopi', 1000, '', 'javascript:alert(1)']])
    expect(product?.imageUrl).toBeNull()
  })
})

describe('isAvailable', () => {
  const base = { id: 'a', name: 'a', price: 1, description: '', imageUrl: null }
  it('stok null berarti tidak terbatas', () => expect(isAvailable({ ...base, stock: null })).toBe(true))
  it('stok 0 berarti habis', () => expect(isAvailable({ ...base, stock: 0 })).toBe(false))
})
