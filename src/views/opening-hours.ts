import {
  DEFAULT_TIMEZONE,
  describeOpenStatus,
  formatDayHours,
  STORE_TIMEZONES,
  SUGGESTED_DAY_HOURS,
  timezoneLabel,
  WEEKDAY_NAMES,
  WEEKDAYS_MONDAY_FIRST,
  type OpeningHours,
  type OpenStatus,
} from '../domain/opening-hours'
import { html, raw, type SafeHtml } from '../lib/html'

/** Label status: "● Buka · tutup pukul 21:00 WIB" */
export function openStatusBadge(status: OpenStatus, hours: OpeningHours | null): SafeHtml {
  return html`<span class="status ${status.isOpen ? 'status--open' : 'status--closed'}">
    <span class="status__dot" aria-hidden="true"></span>${describeOpenStatus(status, hours)}
  </span>`
}

/** Daftar jam buka Senin–Minggu; hari ini ditandai. */
export function scheduleList(hours: OpeningHours, today?: number): SafeHtml {
  return html`<dl class="schedule">
    ${WEEKDAYS_MONDAY_FIRST.map(
      (day) => html`<div class="schedule__row ${day === today ? 'schedule__row--today' : ''}">
        <dt>${WEEKDAY_NAMES[day]}</dt>
        <dd>${formatDayHours(hours.days[day] ?? null)}</dd>
      </div>`,
    )}
  </dl>
  <p class="muted schedule__tz">Waktu dalam ${timezoneLabel(hours)}.</p>`
}

/** Nilai mentah form jadwal (dari database atau dari input yang gagal divalidasi). */
export type OpeningHoursFormInput = Readonly<Record<string, string | undefined>>

interface DayDraft {
  readonly isOpen: boolean
  readonly start: string
  readonly end: string
}

function draftFromHours(hours: OpeningHours | null): { timezone: string; days: DayDraft[] } {
  return {
    timezone: hours?.timezone ?? DEFAULT_TIMEZONE,
    days: WEEKDAY_NAMES.map((_, day) => {
      const dayHours = hours ? (hours.days[day] ?? null) : SUGGESTED_DAY_HOURS
      return {
        isOpen: dayHours !== null,
        start: dayHours?.open ?? SUGGESTED_DAY_HOURS.open,
        end: dayHours?.close ?? SUGGESTED_DAY_HOURS.close,
      }
    }),
  }
}

function draftFromInput(input: OpeningHoursFormInput): { timezone: string; days: DayDraft[] } {
  return {
    timezone: input.timezone ?? DEFAULT_TIMEZONE,
    days: WEEKDAY_NAMES.map((_, day) => ({
      isOpen: input[`open_${day}`] === '1',
      start: input[`start_${day}`] ?? '',
      end: input[`end_${day}`] ?? '',
    })),
  }
}

/**
 * Form jadwal mingguan. Field: `timezone`, `open_<hari>`, `start_<hari>`, `end_<hari>`
 * (indeks hari mengikuti Date#getDay, 0 = Minggu) — lihat validateOpeningHoursInput.
 */
export function openingHoursForm(hours: OpeningHours | null, input?: OpeningHoursFormInput): SafeHtml {
  const draft = input ? draftFromInput(input) : draftFromHours(hours)

  return html`<form method="post" action="/dashboard/hours" class="form">
    <label>Zona waktu
      <select name="timezone">
        ${Object.entries(STORE_TIMEZONES).map(
          ([value, { label }]) =>
            html`<option value="${value}" ${value === draft.timezone ? raw('selected') : null}>${label} (${value})</option>`,
        )}
      </select>
    </label>

    <fieldset class="hours">
      <legend>Jam buka</legend>
      ${WEEKDAYS_MONDAY_FIRST.map((day) => {
        const name = WEEKDAY_NAMES[day]
        const value = draft.days[day]!
        return html`<div class="hours__row">
          <label class="hours__day">
            <input type="checkbox" name="open_${day}" value="1" ${value.isOpen ? raw('checked') : null}> ${name}
          </label>
          <input type="time" name="start_${day}" value="${value.start}" aria-label="Jam buka ${name}">
          <span aria-hidden="true">–</span>
          <input type="time" name="end_${day}" value="${value.end}" aria-label="Jam tutup ${name}">
        </div>`
      })}
    </fieldset>
    <small class="muted">
      Hapus centang untuk hari libur. Jam tutup lebih awal dari jam buka berarti buka melewati tengah malam
      (mis. 18:00–02:00). Jam buka sama dengan jam tutup berarti buka 24 jam.
    </small>
    <button class="btn btn--primary" type="submit">Simpan Jam Buka</button>
  </form>`
}
