import { describe, expect, it } from 'bun:test'
import { generateOrderCode, parseTableCount, parseTableNumber } from '../src/domain/dining'
import { tableUrl } from '../src/domain/store'
import { receiptPage } from '../src/views/receipt'
import { storefrontPage } from '../src/views/storefront'

describe('dining', () => {
  it('menormalkan nomor meja dan menolak input aneh', () => {
    expect(parseTableNumber(' a5 ')).toBe('A5')
    expect(parseTableNumber('12')).toBe('12')
    expect(parseTableNumber('<script>')).toBeNull()
    expect(parseTableNumber('1234567')).toBeNull()
    expect(parseTableNumber(undefined)).toBeNull()
  })

  it('kode pesanan 4 karakter tanpa huruf/angka membingungkan', () => {
    for (let i = 0; i < 50; i++) expect(generateOrderCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}$/)
  })

  it('jumlah meja dibatasi', () => {
    expect(parseTableCount('10')).toBe(10)
    expect(() => parseTableCount('0')).toThrow()
    expect(() => parseTableCount('101')).toThrow()
  })

  it('URL QR meja membawa nomor meja', () => {
    expect(tableUrl('https://x.id', 'warung', '5')).toBe('https://x.id/s/warung?meja=5')
  })
})

describe('views mode warung', () => {
  const store = {
    id: 's', ownerId: 'u', slug: 'warung', name: 'Warung <Bu>', whatsapp: '6281', spreadsheetId: 'x',
    openingHours: null, createdAt: 0, updatedAt: 0,
  }
  const status = { isOpen: true, closesAt: null } as const
  const products = [{ id: 'A', name: 'Teh', price: 5000, description: '', imageUrl: null, stock: null }]

  it('form meja: tanpa alamat, ada pilihan pembayaran', () => {
    const page = storefrontPage({ store, products, status, table: '5' }).value
    expect(page).toContain('name="table" value="5"')
    expect(page).not.toContain('name="address"')
    expect(page).toContain('value="qris"')
    expect(page).toContain('value="cash"')
    expect(storefrontPage({ store, products, status }).value).toContain('name="address"')
  })

  it('struk QRIS berisi tombol WhatsApp; struk tunai mengarahkan ke kasir', () => {
    const order = {
      lines: [{ product: products[0]!, quantity: 2, subtotal: 10000 }],
      total: 10000,
      customer: { name: 'Budi', address: '', note: '' },
    }
    const base = { code: 'A7K2', table: '5', order, proofUrl: 'https://wa.me/6281?text=x' }
    const qris = receiptPage(store, { ...base, payment: 'qris' }).value
    expect(qris).toContain('https://wa.me/6281?text=x')
    expect(qris).toContain('A7K2')
    const cash = receiptPage(store, { ...base, payment: 'cash' }).value
    expect(cash).not.toContain('wa.me')
    expect(cash).toContain('Bayar di kasir')
  })
})
