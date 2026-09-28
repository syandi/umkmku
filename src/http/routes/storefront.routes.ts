import { Elysia, t } from 'elysia'
import type { AppContainer } from '../../container'
import { storefrontPath, storefrontUrl } from '../../domain/store'
import { ValidationError } from '../../lib/errors'
import { encodeQr } from '../../lib/qr/encoder'
import { renderQrPng, renderQrSvg } from '../../lib/qr/render'
import { errorPage } from '../../views/error'
import { storefrontPage } from '../../views/storefront'
import { fileResponse, htmlResponse, redirectResponse } from '../responses'

const QR_CACHE_SECONDS = 24 * 60 * 60
const downloadQuery = t.Object({ download: t.Optional(t.String()) }, { additionalProperties: true })

export function storefrontRoutes({ stores, config }: AppContainer) {
  return new Elysia({ prefix: '/s' })
    .get('/:slug', async ({ params }) => {
      const store = await stores.getBySlug(params.slug)
      const products = await stores.getCatalog(store)
      return htmlResponse(storefrontPage({ store, products, status: stores.getOpenStatus(store) }))
    })
    // QR code berisi URL publik toko. ?download=1 → diunduh sebagai file.
    .get(
      '/:slug/qr.svg',
      async ({ params, query }) => {
        const store = await stores.getBySlug(params.slug)
        const svg = renderQrSvg(encodeQr(storefrontUrl(config.appUrl, store.slug)), { title: `QR Code ${store.name}` })
        return fileResponse(svg, {
          contentType: 'image/svg+xml; charset=utf-8',
          cacheSeconds: QR_CACHE_SECONDS,
          downloadName: query.download ? `qr-${store.slug}.svg` : undefined,
        })
      },
      { query: downloadQuery },
    )
    .get(
      '/:slug/qr.png',
      async ({ params, query }) => {
        const store = await stores.getBySlug(params.slug)
        const png = await renderQrPng(encodeQr(storefrontUrl(config.appUrl, store.slug)), { pixelsPerModule: 20 })
        return fileResponse(png, {
          contentType: 'image/png',
          cacheSeconds: QR_CACHE_SECONDS,
          downloadName: query.download ? `qr-${store.slug}.png` : undefined,
        })
      },
      { query: downloadQuery },
    )
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
