import { describe, expect, it } from 'bun:test'
import type { Store } from '../src/domain/store'
import type { OpenStatus } from '../src/domain/opening-hours'
import { dashboardPage } from '../src/views/dashboard'
import { storefrontPage } from '../src/views/storefront'

const store: Store = {
  id: 's1',
  ownerId: 'u1',
  slug: 'dapur-sari',
  name: 'Dapur <Sari>',
  whatsapp: '6281234567890',
  spreadsheetId: 'abc',
  openingHours: null,
  createdAt: 0,
  updatedAt: 0,
}

const open: OpenStatus = { isOpen: true, closesAt: null }
const closed: OpenStatus = { isOpen: false, nextOpen: { daysFromNow: 1, weekday: 2, time: '08:00' } }
const product = { id: 'A', name: 'Kopi', price: 1000, description: '', imageUrl: null, stock: null }

describe('views', () => {
  it('storefront meng-escape data dari spreadsheet', () => {
    const page = storefrontPage({
      store,
      products: [
        { id: 'A"><script>', name: '<img onerror=x>', price: 1000, description: '', imageUrl: null, stock: null },
      ],
      status: open,
    }).value

    expect(page).toContain('Dapur &lt;Sari&gt;')
    expect(page).not.toContain('<img onerror')
    expect(page).not.toContain('"><script>')
    expect(page).toContain('action="/s/dapur-sari/checkout"')
  })

  it('storefront menandai produk habis tanpa tombol jumlah', () => {
    const page = storefrontPage({
      store,
      products: [{ id: 'A', name: 'Habis', price: 1000, description: '', imageUrl: null, stock: 0 }],
      status: open,
    }).value
    expect(page).toContain('Stok habis')
    expect(page).not.toContain('data-action="increment"')
  })

  it('dashboard menampilkan onboarding bila belum punya toko', () => {
    const page = dashboardPage({
      user: { id: 'u1', email: 'a@b.c', name: 'Sari', picture: null },
      store: null,
      catalog: null,
      openStatus: null,
      appUrl: 'https://umkmku.id',
    }).value
    expect(page).toContain('Buat Toko')
  })

  it('dashboard menawarkan pembuatan ulang spreadsheet bila hilang', () => {
    const page = dashboardPage({
      user: { id: 'u1', email: 'a@b.c', name: 'Sari', picture: null },
      store,
      catalog: { kind: 'spreadsheet_unavailable' },
      openStatus: open,
      appUrl: 'https://umkmku.id',
    }).value
    expect(page).toContain('action="/dashboard/spreadsheet"')
  })

  it('storefront saat tutup: tampilkan status & jam buka, tanpa tombol jumlah maupun form pesanan', () => {
    const page = storefrontPage({
      store: {
        ...store,
        openingHours: { timezone: 'Asia/Makassar', days: [null, { open: '08:00', close: '21:00' }, null, null, null, null, null] },
      },
      products: [product],
      status: closed,
    }).value
    expect(page).toContain('Tutup · buka besok pukul 08:00 WITA')
    expect(page).toContain('Lihat jam buka')
    expect(page).not.toContain('data-action="increment"')
    expect(page).not.toContain('/checkout')
  })

  it('storefront saat buka menampilkan form pesanan', () => {
    const page = storefrontPage({ store, products: [product], status: open }).value
    expect(page).toContain('Buka 24 jam')
    expect(page).toContain('action="/s/dapur-sari/checkout"')
  })

  it('form jam buka memakai jadwal tersimpan; hari libur tidak dicentang', () => {
    const page = dashboardPage({
      user: { id: 'u1', email: 'a@b.c', name: 'Sari', picture: null },
      store: { ...store, openingHours: { timezone: 'Asia/Jakarta', days: [null, { open: '09:00', close: '17:00' }, null, null, null, null, null] } },
      catalog: { kind: 'ok', products: [] },
      openStatus: closed,
      appUrl: 'https://umkmku.id',
    }).value
    expect(page).toContain('name="open_1" value="1" checked')
    expect(page).toContain('name="start_1" value="09:00"')
    expect(page).not.toContain('name="open_0" value="1" checked')
    expect(page).not.toContain('Jam buka belum diatur')
  })
})
