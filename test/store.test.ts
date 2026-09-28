import { describe, expect, it } from 'bun:test'
import { validateStoreInput } from '../src/domain/store'
import { ValidationError } from '../src/lib/errors'

const valid = { name: 'Dapur Bu Sari', slug: 'dapur-bu-sari', whatsapp: '081234567890' }

describe('validateStoreInput', () => {
  it('menormalkan input yang valid', () => {
    expect(validateStoreInput({ ...valid, name: '  Dapur   Bu Sari ', slug: 'Dapur-Bu-Sari' })).toEqual({
      name: 'Dapur Bu Sari',
      slug: 'dapur-bu-sari',
      whatsapp: '6281234567890',
    })
  })

  it.each(['ab', '-toko', 'toko-', 'toko sari', 'toko_sari', 'a'.repeat(41), 'dashboard'])(
    'menolak slug %s',
    (slug) => {
      expect(() => validateStoreInput({ ...valid, slug })).toThrow(ValidationError)
    },
  )

  it('menolak nomor WA tidak valid', () => {
    expect(() => validateStoreInput({ ...valid, whatsapp: '12345' })).toThrow(/WhatsApp/)
  })
})
