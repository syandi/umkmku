import { env } from 'cloudflare:workers'
import { createApp, type App } from './app'
import { createContainer } from './container'

/**
 * Entry point Worker.
 *
 * Aplikasi dirangkai secara lazy pada request pertama (lalu dipakai ulang selama
 * isolate hidup), sehingga validasi konfigurasi tidak menggagalkan `wrangler deploy`
 * sebelum secrets diset, dan tidak ada I/O di global scope.
 */
let app: App | undefined

export default {
  fetch(request) {
    app ??= createApp(createContainer(env))
    return app.fetch(request)
  },
} satisfies ExportedHandler
