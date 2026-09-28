import { ValidationError } from '../lib/errors'

/**
 * Zona waktu Indonesia. Tidak ada daylight saving time, sehingga offset tetap
 * dan perhitungan tidak bergantung pada data zona waktu (ICU) di runtime.
 */
export const STORE_TIMEZONES = {
  'Asia/Jakarta': { label: 'WIB', offsetMinutes: 7 * 60 },
  'Asia/Makassar': { label: 'WITA', offsetMinutes: 8 * 60 },
  'Asia/Jayapura': { label: 'WIT', offsetMinutes: 9 * 60 },
} as const

export type StoreTimezone = keyof typeof STORE_TIMEZONES
export const DEFAULT_TIMEZONE: StoreTimezone = 'Asia/Jakarta'

/** Jam dalam format 24 jam "HH:MM". */
export interface DayHours {
  readonly open: string
  readonly close: string
}

/**
 * Jadwal mingguan. `days` selalu berisi 7 elemen, indeks mengikuti Date#getDay():
 * 0 = Minggu … 6 = Sabtu. `null` = libur.
 *
 * Aturan:
 * - close > open  → buka normal di hari yang sama (08:00–21:00)
 * - close < open  → buka melewati tengah malam (18:00–02:00)
 * - close = open  → buka 24 jam
 */
export interface OpeningHours {
  readonly timezone: StoreTimezone
  readonly days: readonly (DayHours | null)[]
}

export const WEEKDAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const
/** Urutan tampilan yang lazim di Indonesia. */
export const WEEKDAYS_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const
export const SUGGESTED_DAY_HOURS: DayHours = { open: '08:00', close: '21:00' }

export type OpenStatus =
  /** closesAt null = buka 24 jam */
  | { readonly isOpen: true; readonly closesAt: string | null }
  | { readonly isOpen: false; readonly nextOpen: NextOpening | null }

export interface NextOpening {
  readonly daysFromNow: number
  readonly weekday: number
  readonly time: string
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

/**
 * Status buka/tutup pada waktu `now`.
 * `hours` null = toko belum mengatur jadwal → selalu buka (kompatibel dengan toko lama).
 */
export function resolveOpenStatus(hours: OpeningHours | null, now: Date): OpenStatus {
  if (!hours) return { isOpen: true, closesAt: null }

  const local = new Date(now.getTime() + STORE_TIMEZONES[hours.timezone].offsetMinutes * 60_000)
  const weekday = local.getUTCDay()
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes()

  const today = hours.days[weekday] ?? null
  if (today) {
    const open = toMinutes(today.open)
    const close = toMinutes(today.close)
    if (open === close) return { isOpen: true, closesAt: null }
    const withinToday = open < close ? minute >= open && minute < close : minute >= open
    if (withinToday) return { isOpen: true, closesAt: today.close }
  }

  // Sisa jadwal kemarin yang melewati tengah malam (mis. Sabtu 18:00–02:00, sekarang Minggu 01:00).
  const yesterday = hours.days[(weekday + 6) % 7] ?? null
  if (yesterday && toMinutes(yesterday.open) > toMinutes(yesterday.close) && minute < toMinutes(yesterday.close)) {
    return { isOpen: true, closesAt: yesterday.close }
  }

  return { isOpen: false, nextOpen: findNextOpening(hours, weekday, minute) }
}

function findNextOpening(hours: OpeningHours, weekday: number, minute: number): NextOpening | null {
  for (let daysFromNow = 0; daysFromNow <= 7; daysFromNow++) {
    const day = (weekday + daysFromNow) % 7
    const dayHours = hours.days[day]
    if (!dayHours) continue
    if (daysFromNow === 0 && toMinutes(dayHours.open) <= minute) continue
    return { daysFromNow, weekday: day, time: dayHours.open }
  }
  return null
}

export function timezoneLabel(hours: OpeningHours | null): string {
  return STORE_TIMEZONES[hours?.timezone ?? DEFAULT_TIMEZONE].label
}

/** "Buka · tutup pukul 21:00 WIB" / "Tutup · buka besok pukul 08:00 WIB" */
export function describeOpenStatus(status: OpenStatus, hours: OpeningHours | null): string {
  if (status.isOpen) {
    return status.closesAt ? `Buka · tutup pukul ${status.closesAt} ${timezoneLabel(hours)}` : 'Buka 24 jam'
  }
  const next = describeNextOpening(status.nextOpen, hours)
  return next ? `Tutup · buka ${next}` : 'Tutup'
}

/** "besok pukul 08:00 WIB" */
export function describeNextOpening(next: NextOpening | null, hours: OpeningHours | null): string | null {
  if (!next) return null
  const when = next.daysFromNow === 0 ? 'hari ini' : next.daysFromNow === 1 ? 'besok' : `hari ${WEEKDAY_NAMES[next.weekday]}`
  return `${when} pukul ${next.time} ${timezoneLabel(hours)}`
}

export function formatDayHours(day: DayHours | null): string {
  if (!day) return 'Libur'
  if (day.open === day.close) return '24 jam'
  return `${day.open}–${day.close}`
}

/**
 * Validasi input form dashboard:
 * `timezone`, `open_<hari>` = "1" bila buka, `start_<hari>` & `end_<hari>` = "HH:MM".
 */
export function validateOpeningHoursInput(raw: Readonly<Record<string, string | undefined>>): OpeningHours {
  const timezone = raw.timezone ?? ''
  if (!Object.hasOwn(STORE_TIMEZONES, timezone)) throw new ValidationError('Zona waktu tidak valid.')

  const days = WEEKDAY_NAMES.map((name, day): DayHours | null => {
    if (raw[`open_${day}`] !== '1') return null
    const open = normalizeTime(raw[`start_${day}`])
    const close = normalizeTime(raw[`end_${day}`])
    if (!open || !close) {
      throw new ValidationError(`Jam buka/tutup hari ${name} belum diisi dengan benar (format 24 jam, mis. 08:00).`)
    }
    return { open, close }
  })

  if (days.every((day) => day === null)) {
    throw new ValidationError('Pilih minimal satu hari buka, atau toko tidak akan pernah bisa menerima pesanan.')
  }
  return { timezone: timezone as StoreTimezone, days }
}

/** <input type="time"> bisa mengirim "08:00" atau "08:00:00". */
function normalizeTime(value: string | undefined): string | null {
  const time = (value ?? '').trim().slice(0, 5)
  return TIME_PATTERN.test(time) ? time : null
}

/** Membaca JSON dari database secara defensif; data rusak dianggap "belum diatur". */
export function parseOpeningHours(json: string | null): OpeningHours | null {
  if (!json) return null
  try {
    const data = JSON.parse(json) as { timezone?: unknown; days?: unknown }
    if (typeof data.timezone !== 'string' || !Object.hasOwn(STORE_TIMEZONES, data.timezone)) return null
    if (!Array.isArray(data.days) || data.days.length !== 7) return null
    const days = data.days.map((day: unknown): DayHours | null => {
      if (day === null) return null
      const { open, close } = (day ?? {}) as Record<string, unknown>
      if (typeof open !== 'string' || typeof close !== 'string') throw new Error('invalid day')
      if (!TIME_PATTERN.test(open) || !TIME_PATTERN.test(close)) throw new Error('invalid time')
      return { open, close }
    })
    return { timezone: data.timezone as StoreTimezone, days }
  } catch {
    return null
  }
}

export function serializeOpeningHours(hours: OpeningHours): string {
  return JSON.stringify({ timezone: hours.timezone, days: hours.days })
}
