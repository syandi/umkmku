import { Elysia, t } from 'elysia'
import type { AppContainer } from '../../container'
import type { User } from '../../domain/user'
import { AuthRequiredError, ValidationError } from '../../lib/errors'
import { dashboardPage, type DashboardFlash, type StoreFormValues } from '../../views/dashboard'
import type { CookieJar } from '../cookies'
import { assertSameOrigin } from '../origin-guard'
import { htmlResponse, redirectResponse } from '../responses'

const FLASH_MESSAGES: Readonly<Record<string, DashboardFlash>> = {
  saved: { type: 'success', message: 'Pengaturan toko berhasil disimpan.' },
  spreadsheet: { type: 'success', message: 'Spreadsheet baru berhasil dibuat.' },
}

export function dashboardRoutes({ auth, stores, config }: AppContainer, cookies: CookieJar) {
  async function render(
    user: User,
    options: { flash?: DashboardFlash; form?: StoreFormValues; status?: number } = {},
  ): Promise<Response> {
    const store = await stores.findByOwner(user.id)
    const catalog = store ? await stores.getCatalogStatus(store) : null
    return htmlResponse(dashboardPage({ user, store, catalog, appUrl: config.appUrl, ...options }), {
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
    .post('/spreadsheet', async ({ user }) => {
      await stores.recreateSpreadsheet(user)
      return redirectResponse('/dashboard?status=spreadsheet', { status: 303 })
    })
}
