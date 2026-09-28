import type { User } from '../domain/user'
import { html, type SafeHtml } from '../lib/html'
import { layout, siteHeader } from './layout'

export function homePage({ user, loginRequired }: { user: User | null; loginRequired: boolean }): SafeHtml {
  const cta = user
    ? html`<a class="btn btn--primary btn--lg" href="/dashboard">Buka Dashboard</a>`
    : html`<a class="btn btn--primary btn--lg" href="/auth/google">Masuk dengan Google</a>`

  return layout({
    title: 'UMKMku — Toko online gratis untuk UMKM',
    description: 'Buat etalase online dalam 1 menit. Kelola produk dari Google Sheets, terima pesanan lewat WhatsApp.',
    body: html`${siteHeader(user ? html`<a href="/dashboard">Dashboard</a>` : html`<a href="/auth/google">Masuk</a>`)}
      <main>
        <section class="hero">
          <div class="container narrow center">
            ${loginRequired ? html`<p class="alert alert--info">Silakan masuk terlebih dahulu untuk membuka dashboard.</p>` : null}
            <h1>Toko online untuk UMKM, <span class="accent">semudah isi spreadsheet</span></h1>
            <p class="lead">
              Masuk dengan akun Google, isi produk di Google Sheets, lalu bagikan tautan toko Anda.
              Pembeli memesan langsung ke WhatsApp Anda.
            </p>
            ${cta}
          </div>
        </section>

        <section class="container features">
          <article class="card">
            <h3>1. Masuk dengan Google</h3>
            <p>Tanpa kata sandi baru. Data produk tersimpan di Google Drive milik Anda sendiri.</p>
          </article>
          <article class="card">
            <h3>2. Kelola di Google Sheets</h3>
            <p>Tambah, ubah harga, atau atur stok langsung dari spreadsheet — bisa dari HP.</p>
          </article>
          <article class="card">
            <h3>3. Pesanan via WhatsApp</h3>
            <p>Pembeli memilih produk, lalu pesanan lengkap dengan total terkirim ke WhatsApp Anda.</p>
          </article>
        </section>
      </main>
      <footer class="site-footer container">© UMKMku</footer>`,
  })
}
