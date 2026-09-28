import { html, type SafeHtml } from '../lib/html'
import { layout, siteHeader } from './layout'

/** Ditampilkan bila pengguna tidak mencentang izin Google Drive di layar persetujuan Google. */
export function drivePermissionPage(): SafeHtml {
  return layout({
    title: 'Izin Google Drive diperlukan · UMKMku',
    body: html`${siteHeader()}
      <main class="container narrow">
        <section class="card">
          <p class="eyebrow">Satu langkah lagi</p>
          <h1>Izinkan UMKMku membuat spreadsheet katalog</h1>
          <p>
            Katalog produk Anda disimpan di Google Sheets milik Anda sendiri. Untuk itu UMKMku
            perlu izin <strong>“Lihat, edit, buat, dan hapus hanya file Google Drive tertentu
            yang Anda gunakan dengan aplikasi ini”</strong>.
          </p>
          <ol class="columns-help">
            <li>Klik tombol di bawah dan pilih akun Google Anda.</li>
            <li>Di layar izin, <strong>centang kotak izin Google Drive</strong> (atau “Pilih semua”).</li>
            <li>Klik <strong>Lanjutkan</strong>.</li>
          </ol>
          <p class="muted">
            Izin ini terbatas: UMKMku hanya bisa mengakses file yang dibuatnya sendiri,
            bukan file lain di Google Drive Anda.
          </p>
          <div class="actions">
            <a class="btn btn--primary" href="/auth/google?consent=1">Masuk lagi &amp; beri izin</a>
            <a class="btn btn--ghost" href="/">Batal</a>
          </div>
        </section>
      </main>`,
  })
}
