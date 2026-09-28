import { formatRupiah } from './money'
import { formatOrderLine, type Order } from './order'

/**
 * Normalisasi nomor WhatsApp Indonesia ke format internasional tanpa "+".
 * "0812-3456-7890" | "+62 812 3456 7890" | "812345678" -> "6281234567890"
 * Mengembalikan null jika bukan nomor seluler Indonesia yang valid.
 */
export function normalizeWhatsAppNumber(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, '')
  let digits = compact.startsWith('+') ? compact.slice(1) : compact
  if (!/^\d+$/.test(digits)) return null

  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`
  else if (digits.startsWith('8')) digits = `62${digits}`

  return /^628\d{7,11}$/.test(digits) ? digits : null
}

export function buildOrderMessage(storeName: string, order: Order): string {
  const { customer } = order
  const lines = [
    `Halo *${storeName}*, saya ingin memesan:`,
    '',
    ...order.lines.map((line, index) => `${index + 1}. ${formatOrderLine(line)}`),
    '',
    `*Total: ${formatRupiah(order.total)}*`,
    '',
    `Nama: ${customer.name}`,
  ]
  if (customer.address) lines.push(`Alamat: ${customer.address}`)
  if (customer.note) lines.push(`Catatan: ${customer.note}`)
  return lines.join('\n')
}

export function buildWhatsAppUrl(phoneNumber: string, message: string): string {
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`
}
