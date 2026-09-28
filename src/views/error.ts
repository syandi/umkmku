import { html, type SafeHtml } from '../lib/html'
import { layout, siteHeader } from './layout'

export function errorPage(props: { status: number; message: string; backHref?: string }): SafeHtml {
  return layout({
    title: `Terjadi kendala · UMKMku`,
    body: html`${siteHeader()}
      <main class="container narrow">
        <section class="card center">
          <p class="eyebrow">Kode ${props.status}</p>
          <h1>Ups, ada kendala</h1>
          <p>${props.message}</p>
          <a class="btn" href="${props.backHref ?? '/'}">Kembali</a>
        </section>
      </main>`,
  })
}
