import { Elysia } from 'elysia'
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker'
import type { AppContainer } from './container'
import { createCookieJar } from './http/cookies'
import { handleError } from './http/error-handler'
import { htmlResponse } from './http/responses'
import { authRoutes } from './http/routes/auth.routes'
import { dashboardRoutes } from './http/routes/dashboard.routes'
import { storefrontRoutes } from './http/routes/storefront.routes'
import { homePage } from './views/home'

export function createApp(container: AppContainer) {
  const cookies = createCookieJar(container.config)

  // precompile: validator schema & handler dibuat sekarang (fase startup Worker),
  // bukan lazily saat request pertama — lihat catatan di src/index.ts.
  return new Elysia({ adapter: CloudflareAdapter, precompile: true })
    .onError({ as: 'global' }, ({ code, error }) => handleError(code, error))
    .get('/', async ({ request, query }) => {
      const user = await container.auth.getUserBySession(cookies.readSession(request))
      return htmlResponse(homePage({ user, loginRequired: query.login === 'required' }))
    })
    .get('/healthz', () => ({ status: 'ok' }))
    .use(authRoutes(container, cookies))
    .use(dashboardRoutes(container, cookies))
    .use(storefrontRoutes(container))
    .compile()
}

export type App = ReturnType<typeof createApp>
