import { storefrontPath, storefrontUrl, tableUrl, type Store } from '../domain/store'
import { html, type SafeHtml } from '../lib/html'
import { layout } from './layout'
import { scheduleList } from './opening-hours'

function qrImagePath(store: Store, format: 'svg' | 'png', download = false, table?: string): string {
  const query = new URLSearchParams()
  if (download) query.set('download', '1')
  if (table) query.set('meja', table)
  const suffix = query.size ? `?${query}` : ''
  return `${storefrontPath(store.slug)}/qr.${format}${suffix}`
}

/** Kartu QR di dashboard: pratinjau + unduh + cetak poster. */
export function qrCard(store: Store, appUrl: string): SafeHtml {
  return html`<section class="card qr-card">
    <img class="qr-card__image" src="${qrImagePath(store, 'svg')}" alt="QR code toko ${store.name}" width="160" height="160">
    <div>
      <h2>QR Code Toko</h2>
      <p class="muted">
        Pembeli cukup memindai dengan kamera HP untuk membuka
        <strong>${storefrontUrl(appUrl, store.slug)}</strong>. Tempel di etalase, meja kasir, gerobak, atau kemasan.
      </p>
      <div class="actions">
        <a class="btn btn--primary" href="/dashboard/qr" target="_blank" rel="noopener">Cetak Poster</a>
        <a class="btn" href="${qrImagePath(store, 'png', true)}" download>Unduh PNG</a>
        <a class="btn" href="${qrImagePath(store, 'svg', true)}" download>Unduh SVG</a>
      </div>
      <p class="muted qr-card__hint">PNG untuk dibagikan di WhatsApp/Instagram, SVG untuk dicetak besar tanpa pecah.</p>
    </div>
  </section>`
}

/** Poster siap cetak (A4/A5) berisi QR besar. Tombol aksi disembunyikan saat dicetak. */
export function qrPosterPage(store: Store, appUrl: string): SafeHtml {
  return layout({
    title: `Poster QR · ${store.name}`,
    scripts: ['/assets/print.js'],
    body: html`<main class="poster">
      <div class="poster__actions no-print">
        <button type="button" class="btn btn--primary" data-print>Cetak</button>
        <a class="btn btn--ghost" href="/dashboard">Kembali ke dashboard</a>
      </div>
      <article class="poster__sheet">
        <p class="poster__eyebrow">Pesan online</p>
        <h1 class="poster__title">${store.name}</h1>
        <p class="poster__subtitle">Scan untuk lihat produk &amp; pesan lewat WhatsApp</p>
        <img class="poster__qr" src="${qrImagePath(store, 'svg')}" alt="QR code ${store.name}">
        <p class="poster__url">${storefrontUrl(appUrl, store.slug).replace(/^https?:\/\//, '')}</p>
        ${store.openingHours ? html`<div class="poster__hours"><p class="poster__hours-title">Jam buka</p>${scheduleList(store.openingHours)}</div>` : null}
      </article>
    </main>`,
  })
}

/** Poster QR untuk meja 1..count; setiap meja satu lembar (page-break saat dicetak). */
export function tablePostersPage(store: Store, appUrl: string, count: number): SafeHtml {
  const tables = Array.from({ length: count }, (_, index) => String(index + 1))
  return layout({
    title: `QR Meja · ${store.name}`,
    scripts: ['/assets/print.js'],
    body: html`<main class="poster">
      <div class="poster__actions no-print">
        <button type="button" class="btn btn--primary" data-print>Cetak ${count} meja</button>
        <a class="btn btn--ghost" href="/dashboard">Kembali ke dashboard</a>
      </div>
      ${tables.map(
        (table) => html`<article class="poster__sheet poster__sheet--table">
          <p class="poster__eyebrow">${store.name}</p>
          <h1 class="poster__title">Meja ${table}</h1>
          <p class="poster__subtitle">Scan untuk lihat menu, pesan &amp; bayar</p>
          <img class="poster__qr" src="${qrImagePath(store, 'svg', false, table)}" alt="QR code meja ${table}" loading="lazy">
          <p class="poster__url">${tableUrl(appUrl, store.slug, table).replace(/^https?:\/\//, '')}</p>
        </article>`,
      )}
    </main>`,
  })
}

/** Kartu dashboard: cetak QR per meja (mode warung). */
export function tableQrCard(): SafeHtml {
  return html`<section class="card">
    <h2>QR per Meja (Warung)</h2>
    <p class="muted">Setiap meja mendapat QR sendiri. Pembeli scan, nomor meja terisi otomatis, lalu pesan dan bayar dari HP.</p>
    <form method="get" action="/dashboard/meja" class="form form--inline">
      <label>Jumlah meja
        <input name="jumlah" type="number" inputmode="numeric" min="1" max="100" value="10" required>
      </label>
      <button class="btn btn--primary" type="submit">Cetak QR Meja</button>
    </form>
  </section>`
}
