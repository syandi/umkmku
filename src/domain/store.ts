import { ValidationError } from '../lib/errors'
import { normalizeWhatsAppNumber } from './whatsapp'

export interface Store {
  readonly id: string
  readonly ownerId: string
  readonly slug: string
  readonly name: string
  readonly whatsapp: string
  readonly spreadsheetId: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface StoreInput {
  readonly name: string
  readonly slug: string
  readonly whatsapp: string
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'assets', 'auth', 'dashboard', 'help', 'login', 'logout',
  'static', 'support', 'umkmku', 'www',
])

export function validateStoreInput(raw: { name: string; slug: string; whatsapp: string }): StoreInput {
  const name = raw.name.trim().replace(/\s+/g, ' ')
  if (name.length < 3 || name.length > 60) {
    throw new ValidationError('Nama toko harus 3–60 karakter.')
  }

  const slug = raw.slug.trim().toLowerCase()
  if (!SLUG_PATTERN.test(slug)) {
    throw new ValidationError(
      'Alamat toko harus 3–40 karakter, hanya huruf kecil, angka, dan tanda hubung (tidak di awal/akhir).',
    )
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new ValidationError('Alamat toko tersebut tidak dapat digunakan. Silakan pilih yang lain.')
  }

  const whatsapp = normalizeWhatsAppNumber(raw.whatsapp)
  if (!whatsapp) {
    throw new ValidationError('Nomor WhatsApp tidak valid. Contoh: 081234567890')
  }

  return { name, slug, whatsapp }
}

export function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`
}

export function storefrontPath(slug: string): string {
  return `/s/${encodeURIComponent(slug)}`
}
