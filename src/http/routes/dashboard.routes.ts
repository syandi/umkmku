import { Elysia, t } from 'elysia'
import type { AppContainer } from '../../container'
import type { User } from '../../domain/user'
import { AuthRequiredError, ValidationError } from '../../lib/errors'
import { dashboardPage, type DashboardFlash, type StoreFormValues } from '../../views/dashboard'
import { qrPosterPage } from '../../views/qr'
import type { OpeningHoursFormInput } from '../../views/opening-hours'
import type { CookieJar } from '../cookies'
import { assertSameOrigin } from '../origin-guard'
import { htmlResponse, redirectResponse } from '../responses'

const FLASH_MESSAGES: Readonly<Record<string, DashboardFlash>> = {
  saved: { type: 'success', message: 'Pengaturan toko berhasil disimpan.' },
  spreadsheet: { type: 'success', message: 'Spreadsheet baru berhasil dibuat.' },
  hours: { type: 'success', message: 'Jam buka berhasil disimpan.' },
}

/** Field form jadwal: timezone + open_/start_/end_<0..6>. Semantik divalidasi di domain. */
const OPENING_HOURS_FIELDS = [
  'timezone',
  ...[0, 1, 2, 3, 4, 5, 6].flatMap((day) => [`open_${day}`, `start_${day}`, `end_${day}`]),
]
const openingHoursBody = t.Object(
  Object.fromEntries(OPENING_HOURS_FIELDS.map((field) => [field, t.Optional(t.String({ maxLength: 50 }))])),
)

export function dashboardRoutes({ auth, stores, config }: AppContainer, cookies: CookieJar) {
  async function render(
    user: User,
    options: { flash?: DashboardFlash; form?: StoreFormValues; hoursForm?: OpeningHoursFormInput; status?: number } = {},
  ): Promise<Response> {
    const store = await stores.findByOwner(user.id)
    const catalog = store ? await stores.getCatalogStatus(store) : null
    const openStatus = store ? stores.getOpenStatus(store) : null
    return htmlResponse(dashboardPage({ user, store, catalog, openStatus, appUrl: config.appUrl, ...options }), {
      status: options.status ?? 200,
    })
  }

  return new Elysia({ prefix: '/dashboard' })
    .resolve(async ({ request }) => {
      const user = await auth.getUserBySession(cookies.readSession(request))
      if (!user) throw new AuthRequiredError()
      return { user }
    })
    .onBeforeHandle(({ request }) => {
      assertSameOrigin(request, config.appOrigin)
    })
    .get('/', ({ user, query }) => render(user, { flash: query.status ? FLASH_MESSAGES[query.status] : undefined }), {
      query: t.Object({ status: t.Optional(t.String()) }, { additionalProperties: true }),
    })
    .post(
      '/store',
      async ({ user, body }) => {
        try {
          await stores.saveStore(user, body)
        } catch (error) {
          if (!(error instanceof ValidationError)) throw error
          return render(user, { status: 400, form: body, flash: { type: 'error', message: error.userMessage } })
        }
        return redirectResponse('/dashboard?status=saved', { status: 303 })
      },
      {
        body: t.Object({
          name: t.String({ maxLength: 200 }),
          slug: t.String({ maxLength: 200 }),
          whatsapp: t.String({ maxLength: 50 }),
        }),
      },
    )
    .post(
      '/hours',
      async ({ user, body }) => {
        const input: OpeningHoursFormInput = body
        try {
          await stores.updateOpeningHours(user, input)
        } catch (error) {
          if (!(error instanceof ValidationError)) throw error
          return render(user, { status: 400, hoursForm: input, flash: { type: 'error', message: error.userMessage } })
        }
        return redirectResponse('/dashboard?status=hours', { status: 303 })
      },
      { body: openingHoursBody },
    )
    .get('/qr', async ({ user }) => {
      const store = await stores.findByOwner(user.id)
      if (!store) return redirectResponse('/dashboard', { status: 303 })
      return htmlResponse(qrPosterPage(store, config.appUrl))
    })
    .post('/spreadsheet', async ({ user }) => {
      await stores.recreateSpreadsheet(user)
      return redirectResponse('/dashboard?status=spreadsheet', { status: 303 })
    })
}
