import { describe, expect, it } from 'bun:test'
import type { Store } from '../src/domain/store'
import { encodeQr } from '../src/lib/qr/encoder'
import { renderQrPng, renderQrSvg } from '../src/lib/qr/render'
import { qrCard, qrPosterPage } from '../src/views/qr'

/*
 * Catatan: kebenaran hasil encode sudah diverifikasi dengan memindai QR versi 1–10
 * (termasuk teks UTF-8/emoji) memakai pemindai OpenCV. Test di sini menjaga struktur
 * dasar agar regresi cepat terdeteksi tanpa dependensi pemindai.
 */

function isFinderAt(modules: readonly (readonly boolean[])[], top: number, left: number): boolean {
  const expected = (dy: number, dx: number) => {
    const distance = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
    return distance !== 2
  }
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) if (modules[top + dy]![left + dx] !== expected(dy, dx)) return false
  }
  return true
}

describe('encodeQr', () => {
  it('memilih versi terkecil yang cukup', () => {
    expect(encodeQr('HELLO').size).toBe(21) // versi 1
    expect(encodeQr('https://umkmku.id/s/dapur-bu-sari').size).toBe(29) // versi 3
  })

  it('memuat tiga finder pattern di sudut', () => {
    const { modules, size } = encodeQr('https://umkmku.id/s/toko')
    expect(isFinderAt(modules, 0, 0)).toBe(true)
    expect(isFinderAt(modules, 0, size - 7)).toBe(true)
    expect(isFinderAt(modules, size - 7, 0)).toBe(true)
  })

  it('deterministik', () => {
    expect(encodeQr('abc')).toEqual(encodeQr('abc'))
  })

  it('menolak teks melebihi kapasitas versi 10', () => {
    expect(() => encodeQr('x'.repeat(214))).toThrow(RangeError)
  })
})

describe('render', () => {
  const qr = encodeQr('https://umkmku.id/s/toko')

  it('SVG dengan quiet zone dan title yang di-escape', () => {
    const svg = renderQrSvg(qr, { title: '<b>Toko</b>' })
    expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33"')
    expect(svg).toContain('<title>&#60;b&#62;Toko&#60;/b&#62;</title>')
    expect(svg).not.toContain('<b>')
  })

  it('PNG valid: signature, IHDR dengan dimensi yang benar', async () => {
    const png = await renderQrPng(qr, { pixelsPerModule: 10 })
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const view = new DataView(png.buffer, png.byteOffset)
    expect(new TextDecoder().decode(png.subarray(12, 16))).toBe('IHDR')
    expect(view.getUint32(16)).toBe((25 + 8) * 10)
    expect(view.getUint32(20)).toBe((25 + 8) * 10)
    expect(new TextDecoder().decode(png.subarray(png.length - 8, png.length - 4))).toBe('IEND')
  })
})

describe('views QR', () => {
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

  it('kartu dashboard menautkan pratinjau, unduhan, dan poster', () => {
    const card = qrCard(store, 'https://umkmku.id').value
    expect(card).toContain('src="/s/dapur-sari/qr.svg"')
    expect(card).toContain('href="/s/dapur-sari/qr.png?download=1"')
    expect(card).toContain('href="/dashboard/qr"')
    expect(card).toContain('https://umkmku.id/s/dapur-sari')
  })

  it('poster meng-escape nama toko & memuat skrip cetak', () => {
    const poster = qrPosterPage(store, 'https://umkmku.id').value
    expect(poster).toContain('Dapur &lt;Sari&gt;')
    expect(poster).toContain('umkmku.id/s/dapur-sari')
    expect(poster).toContain('src="/assets/print.js"')
  })
})
