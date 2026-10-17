import { formatRupiah } from '../domain/money'
import { formatOrderLine } from '../domain/order'
import { storefrontPath, type Store } from '../domain/store'
import { html, type SafeHtml } from '../lib/html'
import type { DineInReceipt } from '../services/store-service'
import { layout } from './layout'

/** Halaman setelah memesan dari meja: kode pesanan, QRIS (bila dipilih), dan tombol kirim bukti bayar. */
export function receiptPage(store: Store, receipt: DineInReceipt): SafeHtml {
  const { order, code, table, payment } = receipt

  return layout({
    title: `Pesanan ${code} · ${store.name}`,
    body: html`<main class="container receipt stack">
      <section class="card center">
        <p class="eyebrow">${store.name} · Meja ${table}</p>
        <h1>Pesanan diterima</h1>
        <p class="muted">Kode pesanan Anda</p>
        <p class="receipt__code">${code}</p>
        <p>Atas nama <strong>${order.customer.name}</strong></p>
      </section>

      <section class="card">
        <h2>Ringkasan</h2>
        <ul class="checkout__lines">
          ${order.lines.map((line) => html`<li>${formatOrderLine(line)}</li>`)}
        </ul>
        ${order.customer.note ? html`<p class="muted">Catatan: ${order.customer.note}</p>` : null}
        <p class="checkout__total">Total <strong>${formatRupiah(order.total)}</strong></p>
      </section>

      ${payment === 'qris' ? qrisSection(receipt) : cashSection()}

      <p class="center"><a href="${storefrontPath(store.slug)}?meja=${encodeURIComponent(table)}">Kembali ke menu</a></p>
    </main>`,
  })
}

function qrisSection(receipt: DineInReceipt): SafeHtml {
  return html`<section class="card center">
    <h2>Bayar dengan QRIS</h2>
    <ol class="receipt__steps">
      <li>Tekan tombol di bawah untuk membuka WhatsApp warung (pesan sudah terisi kode <strong>${receipt.code}</strong>).</li>
      <li>Warung akan membalas dengan QRIS. Bayar sebesar <strong>${formatRupiah(receipt.order.total)}</strong>.</li>
      <li>Kirim screenshot bukti bayar di chat yang sama.</li>
    </ol>
    <a class="btn btn--wa btn--lg" href="${receipt.proofUrl}">Minta QRIS via WhatsApp</a>
  </section>`
}

function cashSection(): SafeHtml {
  return html`<section class="card center">
    <h2>Bayar di kasir</h2>
    <p>Sebutkan kode pesanan atau tunjukkan halaman ini ke kasir untuk membayar.</p>
  </section>`
}
