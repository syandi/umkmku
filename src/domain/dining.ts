import { ValidationError } from '../lib/errors'
import { formatRupiah } from './money'
import type { Order } from './order'

/** Mode warung: pembeli memindai QR di meja (`?meja=5`) lalu membayar via QRIS atau di kasir. */
export type PaymentMethod = 'qris' | 'cash'

const TABLE_PATTERN = /^[A-Za-z0-9-]{1,6}$/
// Tanpa huruf/angka yang mudah tertukar (I, O, 0, 1) karena kode dibacakan/dicocokkan manual.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const MAX_TABLES = 100

/** Nomor meja dari query/form. Mengembalikan null bila kosong atau tidak valid. */
export function parseTableNumber(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  return TABLE_PATTERN.test(value) ? value.toUpperCase() : null
}

export function parsePaymentMethod(raw: string | undefined): PaymentMethod {
  if (raw === 'qris' || raw === 'cash') return raw
  throw new ValidationError('Pilih cara pembayaran terlebih dahulu.')
}

export function generateOrderCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(4))
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

export function parseTableCount(raw: string | undefined): number {
  const count = Number(raw)
  if (!Number.isInteger(count) || count < 1 || count > MAX_TABLES) {
    throw new ValidationError(`Jumlah meja harus 1–${MAX_TABLES}.`)
  }
  return count
}

/** Pesan WA untuk membayar via QRIS: warung membalas dengan QRIS-nya, pembeli mengirim bukti di chat yang sama. */
export function buildPaymentProofMessage(storeName: string, code: string, table: string | null, order: Order): string {
  return [
    `Halo *${storeName}*, saya ingin membayar pesanan via QRIS. Mohon kirimkan QRIS-nya.`,
    '',
    `Kode pesanan: *${code}*`,
    ...(table ? [`Meja: ${table}`] : []),
    `Atas nama: ${order.customer.name}`,
    `Total: ${formatRupiah(order.total)}`,
    '',
    'Setelah membayar, saya kirim screenshot bukti bayar di chat ini.',
  ].join('\n')
}
