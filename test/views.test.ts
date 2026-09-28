import { describe, expect, it } from 'bun:test'
import type { Store } from '../src/domain/store'
import { dashboardPage } from '../src/views/dashboard'
import { storefrontPage } from '../src/views/storefront'

const store: Store = {
  id: 's1',
  ownerId: 'u1',
  slug: 'dapur-sari',
  name: 'Dapur <Sari>',
  whatsapp: '6281234567890',
  spreadsheetId: 'abc',
  createdAt: 0,
  updatedAt: 0,
}

describe('views', () => {
  it('storefront meng-escape data dari spreadsheet', () => {
    const page = storefrontPage({
      store,
      products: [
        { id: 'A"><script>', name: '<img onerror=x>', price: 1000, description: '', imageUrl: null, stock: null },
      ],
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
    }).value
    expect(page).toContain('Stok habis')
    expect(page).not.toContain('data-action="increment"')
  })

  it('dashboard menampilkan onboarding bila belum punya toko', () => {
    const page = dashboardPage({
      user: { id: 'u1', email: 'a@b.c', name: 'Sari', picture: null },
      store: null,
      catalog: null,
      appUrl: 'https://umkmku.id',
    }).value
    expect(page).toContain('Buat Toko')
  })

  it('dashboard menawarkan pembuatan ulang spreadsheet bila hilang', () => {
    const page = dashboardPage({
      user: { id: 'u1', email: 'a@b.c', name: 'Sari', picture: null },
      store,
      catalog: { kind: 'spreadsheet_unavailable' },
      appUrl: 'https://umkmku.id',
    }).value
    expect(page).toContain('action="/dashboard/spreadsheet"')
  })
})
