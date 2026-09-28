import { describe, expect, it } from 'bun:test'
import { formatRupiah } from '../src/domain/money'
import { buildOrder } from '../src/domain/order'
import { buildOrderMessage, buildWhatsAppUrl, normalizeWhatsAppNumber } from '../src/domain/whatsapp'

describe('normalizeWhatsAppNumber', () => {
  it.each([
    ['081234567890', '6281234567890'],
    ['0812-3456-7890', '6281234567890'],
    ['+62 812 3456 7890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['81234567890', '6281234567890'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeWhatsAppNumber(input)).toBe(expected)
  })

  it.each(['', 'abc', '0212345678', '0812', '+1 555 123 4567'])('menolak %s', (input) => {
    expect(normalizeWhatsAppNumber(input)).toBeNull()
  })
})

describe('formatRupiah', () => {
  it.each([
    [0, 'Rp0'],
    [500, 'Rp500'],
    [15000, 'Rp15.000'],
    [1250000, 'Rp1.250.000'],
  ])('%d -> %s', (amount, expected) => expect(formatRupiah(amount)).toBe(expected))
})

describe('pesan WhatsApp', () => {
  const order = buildOrder(
    [{ id: 'A', name: 'Keripik', price: 10000, description: '', imageUrl: null, stock: null }],
    [{ productId: 'A', quantity: 2 }],
    { name: 'Budi', address: 'Jl. Mawar 1', note: '' },
  )

  it('menyusun pesan pesanan yang rapi', () => {
    expect(buildOrderMessage('Toko Sari', order)).toBe(
      [
        'Halo *Toko Sari*, saya ingin memesan:',
        '',
        '1. Keripik x2 = Rp20.000',
        '',
        '*Total: Rp20.000*',
        '',
        'Nama: Budi',
        'Alamat: Jl. Mawar 1',
      ].join('\n'),
    )
  })

  it('meng-encode pesan ke URL wa.me', () => {
    const url = new URL(buildWhatsAppUrl('6281234567890', 'Halo & salam\nBaris 2'))
    expect(url.origin + url.pathname).toBe('https://wa.me/6281234567890')
    expect(url.searchParams.get('text')).toBe('Halo & salam\nBaris 2')
  })
})
