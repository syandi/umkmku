import { Elysia, t } from 'elysia'
import type { AppContainer } from '../../container'
import { storefrontPath } from '../../domain/store'
import { ValidationError } from '../../lib/errors'
import { errorPage } from '../../views/error'
import { storefrontPage } from '../../views/storefront'
import { htmlResponse, redirectResponse } from '../responses'

export function storefrontRoutes({ stores }: AppContainer) {
  return new Elysia({ prefix: '/s' })
    .get('/:slug', async ({ params }) => {
      const store = await stores.getBySlug(params.slug)
      const products = await stores.getCatalog(store)
      return htmlResponse(storefrontPage({ store, products }))
    })
    .post(
      '/:slug/checkout',
      async ({ params, body }) => {
        try {
          const whatsappUrl = await stores.checkout(params.slug, body)
          return redirectResponse(whatsappUrl, { status: 303 })
        } catch (error) {
          if (!(error instanceof ValidationError)) throw error
          return htmlResponse(
            errorPage({ status: 400, message: error.userMessage, backHref: storefrontPath(params.slug) }),
            { status: 400 },
          )
        }
      },
      {
        body: t.Object({
          cart: t.String({ maxLength: 10_000 }),
          name: t.String({ maxLength: 200 }),
          address: t.Optional(t.String({ maxLength: 1_000 })),
          note: t.Optional(t.String({ maxLength: 1_000 })),
        }),
      },
    )
}
