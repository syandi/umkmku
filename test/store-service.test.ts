import { beforeEach, describe, expect, it } from 'bun:test'
import type { User } from '../src/domain/user'
import { ValidationError } from '../src/lib/errors'
import { StoreService } from '../src/services/store-service'
import { FakeSheets, FakeTokens, InMemoryStoreRepository, MemoryCatalogCache } from './fakes'

const owner: User = { id: 'u1', email: 'sari@example.com', name: 'Sari', picture: null }
const input = { name: 'Dapur Sari', slug: 'dapur-sari', whatsapp: '081234567890' }

describe('StoreService', () => {
  let stores: InMemoryStoreRepository
  let sheets: FakeSheets
  let cache: MemoryCatalogCache
  let service: StoreService

  beforeEach(() => {
    stores = new InMemoryStoreRepository()
    sheets = new FakeSheets()
    cache = new MemoryCatalogCache()
    service = new StoreService({
      stores,
      sheets,
      tokens: new FakeTokens(),
      catalogCache: cache,
      now: () => new Date('2026-09-28T02:00:00Z'),
    })
  })

  it('membuat spreadsheet saat toko pertama kali dibuat', async () => {
    const store = await service.saveStore(owner, input)
    expect(store.spreadsheetId).toBe('sheet-1')
    expect(store.whatsapp).toBe('6281234567890')
    expect(sheets.created).toEqual(['Katalog Dapur Sari — UMKMku'])
  })

  it('memperbarui toko tanpa membuat spreadsheet baru', async () => {
    await service.saveStore(owner, input)
    const updated = await service.saveStore(owner, { ...input, name: 'Dapur Sari Baru' })
    expect(updated.name).toBe('Dapur Sari Baru')
    expect(sheets.created).toHaveLength(1)
  })

  it('menolak slug milik toko lain', async () => {
    await service.saveStore(owner, input)
    const other: User = { ...owner, id: 'u2' }
    await expect(service.saveStore(other, input)).rejects.toThrow(ValidationError)
  })

  it('checkout menghitung ulang harga dari spreadsheet, mencatat pesanan, dan membuat URL WhatsApp', async () => {
    await service.saveStore(owner, input)
    sheets.rows = [['A', 'Keripik', 10000, '', '', 5, true]]

    const url = new URL(
      await service.checkout('dapur-sari', {
        // Harga palsu dari klien diabaikan.
        cart: JSON.stringify([{ productId: 'A', quantity: 2, price: 1 }]),
        name: 'Budi',
        address: 'Jl. Mawar 1',
      }),
    )

    expect(url.hostname).toBe('wa.me')
    expect(url.pathname).toBe('/6281234567890')
    expect(url.searchParams.get('text')).toContain('*Total: Rp20.000*')
    expect(sheets.appended).toEqual([['2026-09-28 09:00:00', 'Budi', 'Jl. Mawar 1', '', 'Keripik x2', 20000]])
  })

  it('checkout tetap berhasil walau pencatatan ke sheet gagal', async () => {
    await service.saveStore(owner, input)
    sheets.rows = [['A', 'Keripik', 10000]]
    sheets.failAppend = true

    await expect(
      service.checkout('dapur-sari', { cart: JSON.stringify([{ productId: 'A', quantity: 1 }]), name: 'Budi' }),
    ).resolves.toContain('https://wa.me/')
  })

  it('menolak checkout saat toko tutup dan menyebut kapan buka lagi', async () => {
    const store = await service.saveStore(owner, input)
    sheets.rows = [['A', 'Keripik', 10000]]
    // Waktu uji: Senin 09:00 WIB. Toko buka Senin 10:00–17:00.
    await stores.updateOpeningHours(store.id, {
      timezone: 'Asia/Jakarta',
      days: [null, { open: '10:00', close: '17:00' }, null, null, null, null, null],
    })

    const attempt = service.checkout('dapur-sari', { cart: JSON.stringify([{ productId: 'A', quantity: 1 }]), name: 'Budi' })
    await expect(attempt).rejects.toThrow(ValidationError)
    await expect(attempt).rejects.toThrow(/sedang tutup.*hari ini pukul 10:00 WIB/)
    expect(sheets.appended).toEqual([])
  })

  it('menyimpan jam operasional dari input form', async () => {
    await service.saveStore(owner, input)
    await service.updateOpeningHours(owner, { timezone: 'Asia/Jakarta', open_1: '1', start_1: '08:00', end_1: '10:00' })
    const store = await stores.findByOwner(owner.id)
    expect(store?.openingHours?.days[1]).toEqual({ open: '08:00', close: '10:00' })
    expect(service.getOpenStatus(store!)).toEqual({ isOpen: true, closesAt: '10:00' })
  })

  it('katalog memakai cache kecuali diminta fresh', async () => {
    const store = await service.saveStore(owner, input)
    sheets.rows = [['A', 'Lama', 1000]]
    await service.getCatalog(store)

    sheets.rows = [['A', 'Baru', 1000]]
    expect((await service.getCatalog(store))[0]?.name).toBe('Lama')
    expect((await service.getCatalog(store, { fresh: true }))[0]?.name).toBe('Baru')
  })
})
