import { Elysia, t } from 'elysia'
import type { AppContainer } from '../../container'
import { drivePermissionPage } from '../../views/auth'
import { errorPage } from '../../views/error'
import type { CookieJar } from '../cookies'
import { htmlResponse, redirectResponse } from '../responses'

export function authRoutes({ auth }: AppContainer, cookies: CookieJar) {
  return new Elysia({ prefix: '/auth' })
    .get(
      '/google',
      async ({ query }) => {
        const { authorizationUrl, transaction } = await auth.beginLogin(query.consent === '1')
        return redirectResponse(authorizationUrl, { cookies: [cookies.loginTransaction(transaction)] })
      },
      { query: t.Object({ consent: t.Optional(t.String()) }, { additionalProperties: true }) },
    )
    .get(
      '/google/callback',
      async ({ query, request }) => {
        const clearTransaction = cookies.clearLoginTransaction()

        if (query.error || !query.code || !query.state) {
          return htmlResponse(
            errorPage({ status: 400, message: 'Login dibatalkan atau gagal. Silakan coba lagi.' }),
            { status: 400, cookies: [clearTransaction] },
          )
        }

        const result = await auth.completeLogin({
          code: query.code,
          state: query.state,
          transaction: cookies.readLoginTransaction(request),
        })

        switch (result.kind) {
          case 'consent_required':
            return redirectResponse('/auth/google?consent=1', { cookies: [clearTransaction] })
          case 'drive_permission_required':
            return htmlResponse(drivePermissionPage(), { status: 403, cookies: [clearTransaction] })
        }
        return redirectResponse('/dashboard', { cookies: [clearTransaction, cookies.session(result.sessionToken)] })
      },
      {
        // Google menambahkan parameter lain (scope, authuser, prompt, ...) — biarkan lewat.
        query: t.Object(
          {
            code: t.Optional(t.String()),
            state: t.Optional(t.String()),
            error: t.Optional(t.String()),
          },
          { additionalProperties: true },
        ),
      },
    )
    .post('/logout', async ({ request }) => {
      await auth.logout(cookies.readSession(request))
      return redirectResponse('/', { status: 303, cookies: [cookies.clearSession()] })
    })
}
