import { storefrontPath, storefrontUrl, type Store } from '../domain/store'
import { html, type SafeHtml } from '../lib/html'
import { layout } from './layout'
import { scheduleList } from './opening-hours'

function qrImagePath(store: Store, format: 'svg' | 'png', download = false): string {
  return `${storefrontPath(store.slug)}/qr.${format}${download ? '?download=1' : ''}`
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
