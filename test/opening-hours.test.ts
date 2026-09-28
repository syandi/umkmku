import { describe, expect, it } from 'bun:test'
import {
  describeOpenStatus,
  parseOpeningHours,
  resolveOpenStatus,
  serializeOpeningHours,
  validateOpeningHoursInput,
  type DayHours,
  type OpeningHours,
} from '../src/domain/opening-hours'
import { ValidationError } from '../src/lib/errors'

/** Waktu lokal WIB → Date (UTC). 2026-09-28 adalah hari Senin. */
function wib(dayOfMonth: number, time: string): Date {
  const [hour, minute] = time.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, dayOfMonth, hour! - 7, minute!))
}
const MON = 28
const TUE = 29
const SUN = 27

function weekly(day: DayHours | null, overrides: Record<number, DayHours | null> = {}): OpeningHours {
  return {
    timezone: 'Asia/Jakarta',
    days: Array.from({ length: 7 }, (_, index) => (index in overrides ? overrides[index]! : day)),
  }
}

describe('resolveOpenStatus', () => {
  const regular = weekly({ open: '08:00', close: '21:00' }, { 0: null }) // Minggu libur

  it('toko tanpa jadwal selalu buka', () => {
    expect(resolveOpenStatus(null, wib(MON, '03:00'))).toEqual({ isOpen: true, closesAt: null })
  })

  it('buka di dalam jam operasional', () => {
    expect(resolveOpenStatus(regular, wib(MON, '08:00'))).toEqual({ isOpen: true, closesAt: '21:00' })
    expect(resolveOpenStatus(regular, wib(MON, '20:59'))).toEqual({ isOpen: true, closesAt: '21:00' })
  })

  it('tutup tepat pada jam tutup, lalu buka lagi besok', () => {
    expect(resolveOpenStatus(regular, wib(MON, '21:00'))).toEqual({
      isOpen: false,
      nextOpen: { daysFromNow: 1, weekday: 2, time: '08:00' },
    })
  })

  it('sebelum buka: buka hari ini', () => {
    expect(resolveOpenStatus(regular, wib(MON, '06:30'))).toEqual({
      isOpen: false,
      nextOpen: { daysFromNow: 0, weekday: 1, time: '08:00' },
    })
  })

  it('hari libur: buka di hari berikutnya', () => {
    expect(resolveOpenStatus(regular, wib(SUN, '12:00'))).toEqual({
      isOpen: false,
      nextOpen: { daysFromNow: 1, weekday: 1, time: '08:00' },
    })
  })

  it('mendukung jadwal melewati tengah malam', () => {
    const nightly = weekly(null, { 1: { open: '18:00', close: '02:00' } }) // hanya Senin malam
    expect(resolveOpenStatus(nightly, wib(MON, '23:00'))).toEqual({ isOpen: true, closesAt: '02:00' })
    expect(resolveOpenStatus(nightly, wib(TUE, '01:59'))).toEqual({ isOpen: true, closesAt: '02:00' })
    expect(resolveOpenStatus(nightly, wib(TUE, '02:00')).isOpen).toBe(false)
    expect(resolveOpenStatus(nightly, wib(MON, '17:00')).isOpen).toBe(false)
  })

  it('jam buka = jam tutup berarti buka 24 jam', () => {
    const allDay = weekly({ open: '00:00', close: '00:00' })
    expect(resolveOpenStatus(allDay, wib(MON, '03:00'))).toEqual({ isOpen: true, closesAt: null })
  })

  it('memakai zona waktu toko (WIT = WIB + 2 jam)', () => {
    const papua: OpeningHours = { ...regular, timezone: 'Asia/Jayapura' }
    // 19:30 WIB = 21:30 WIT → sudah tutup di Papua, masih buka di Jakarta.
    expect(resolveOpenStatus(regular, wib(MON, '19:30')).isOpen).toBe(true)
    expect(resolveOpenStatus(papua, wib(MON, '19:30')).isOpen).toBe(false)
  })
})

describe('describeOpenStatus', () => {
  const regular = weekly({ open: '08:00', close: '21:00' }, { 0: null })

  it('menjelaskan status dalam bahasa sehari-hari', () => {
    expect(describeOpenStatus(resolveOpenStatus(regular, wib(MON, '10:00')), regular)).toBe('Buka · tutup pukul 21:00 WIB')
    expect(describeOpenStatus(resolveOpenStatus(regular, wib(MON, '22:00')), regular)).toBe('Tutup · buka besok pukul 08:00 WIB')
    expect(describeOpenStatus(resolveOpenStatus(regular, wib(MON, '07:00')), regular)).toBe('Tutup · buka hari ini pukul 08:00 WIB')
  })
})

describe('validateOpeningHoursInput', () => {
  it('membaca form: hari yang dicentang saja yang buka', () => {
    const hours = validateOpeningHoursInput({
      timezone: 'Asia/Makassar',
      open_1: '1',
      start_1: '08:00',
      end_1: '17:00:00',
      start_2: '09:00', // tidak dicentang → libur
      end_2: '10:00',
    })
    expect(hours.timezone).toBe('Asia/Makassar')
    expect(hours.days[1]).toEqual({ open: '08:00', close: '17:00' })
    expect(hours.days.filter((day) => day !== null)).toHaveLength(1)
  })

  it.each([
    [{ timezone: 'Europe/London', open_1: '1', start_1: '08:00', end_1: '17:00' }, /Zona waktu/],
    [{ timezone: 'Asia/Jakarta' }, /minimal satu hari/],
    [{ timezone: 'Asia/Jakarta', open_1: '1', start_1: '25:00', end_1: '17:00' }, /Senin/],
    [{ timezone: 'toString', open_1: '1', start_1: '08:00', end_1: '17:00' }, /Zona waktu/],
  ])('menolak input tidak valid %#', (input, message) => {
    expect(() => validateOpeningHoursInput(input)).toThrow(ValidationError)
    expect(() => validateOpeningHoursInput(input)).toThrow(message)
  })
})

describe('serialisasi', () => {
  it('round-trip JSON', () => {
    const hours = weekly({ open: '08:00', close: '21:00' }, { 0: null })
    expect(parseOpeningHours(serializeOpeningHours(hours))).toEqual(hours)
  })

  it('data rusak dianggap belum diatur', () => {
    expect(parseOpeningHours('{"timezone":"Asia/Jakarta","days":[1,2]}')).toBeNull()
    expect(parseOpeningHours('bukan json')).toBeNull()
    expect(parseOpeningHours(null)).toBeNull()
  })
})
