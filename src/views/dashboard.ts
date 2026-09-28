import { formatRupiah } from '../domain/money'
import type { OpenStatus } from '../domain/opening-hours'
import { PRODUCT_COLUMNS, type Product } from '../domain/product'
import { spreadsheetUrl, storefrontPath, type Store } from '../domain/store'
import type { User } from '../domain/user'
import { html, type SafeHtml } from '../lib/html'
import type { CatalogStatus } from '../services/store-service'
import { layout, siteHeader } from './layout'
import { openingHoursForm, openStatusBadge, type OpeningHoursFormInput } from './opening-hours'

export interface DashboardFlash {
  readonly type: 'success' | 'error'
  readonly message: string
}

export interface StoreFormValues {
  readonly name: string
  readonly slug: string
  readonly whatsapp: string
}

export interface DashboardProps {
  readonly user: User
  readonly store: Store | null
  readonly catalog: CatalogStatus | null
  readonly openStatus: OpenStatus | null
  readonly appUrl: string
  readonly flash?: DashboardFlash
  readonly form?: StoreFormValues
  /** Input form jadwal yang gagal divalidasi, agar isian pengguna tidak hilang. */
  readonly hoursForm?: OpeningHoursFormInput
}

export function dashboardPage(props: DashboardProps): SafeHtml {
  const { user, store, flash } = props

  return layout({
    title: 'Dashboard · UMKMku',
    body: html`${siteHeader(html`
        <span class="muted hide-sm">${user.email}</span>
        <form method="post" action="/auth/logout" class="inline"><button class="btn btn--ghost" type="submit">Keluar</button></form>
      `)}
      <main class="container stack">
        ${flash ? html`<p class="alert alert--${flash.type}" role="status">${flash.message}</p>` : null}
        ${store ? storeOverview(store, props) : onboarding(props)}
      </main>`,
  })
}

function onboarding(props: DashboardProps): SafeHtml {
  return html`<section class="card">
    <h1>Halo, ${props.user.name}! 👋</h1>
    <p>Buat toko Anda. Kami akan membuatkan spreadsheet katalog di Google Drive Anda secara otomatis.</p>
    ${storeForm(props, 'Buat Toko')}
  </section>`
}

function storeOverview(store: Store, props: DashboardProps): SafeHtml {
  const publicUrl = `${props.appUrl}${storefrontPath(store.slug)}`

  return html`<section class="card">
      <p class="eyebrow">Toko Anda</p>
      <h1>${store.name}</h1>
      ${props.openStatus ? html`<p>${openStatusBadge(props.openStatus, store.openingHours)}</p>` : null}
      <div class="link-box">
        <a href="${storefrontPath(store.slug)}" target="_blank" rel="noopener">${publicUrl}</a>
      </div>
      <div class="actions">
        <a class="btn btn--primary" href="${spreadsheetUrl(store.spreadsheetId)}" target="_blank" rel="noopener">Kelola Produk di Google Sheets</a>
        <a class="btn" href="${storefrontPath(store.slug)}" target="_blank" rel="noopener">Lihat Toko</a>
      </div>
    </section>

    <section class="card">
      <h2>Produk</h2>
      ${catalogSection(props.catalog)}
    </section>

    <section class="card" id="jam-buka">
      <h2>Jam Buka</h2>
      <p class="muted">Pesanan hanya dapat dikirim pembeli saat toko buka.</p>
      ${store.openingHours
        ? null
        : html`<p class="alert alert--info">Jam buka belum diatur, sehingga toko saat ini menerima pesanan 24 jam. Simpan jadwal di bawah untuk mulai membatasi.</p>`}
      ${openingHoursForm(store.openingHours, props.hoursForm)}
    </section>

    <section class="card">
      <h2>Pengaturan Toko</h2>
      ${storeForm({ ...props, form: props.form ?? { name: store.name, slug: store.slug, whatsapp: store.whatsapp } }, 'Simpan')}
    </section>

    <section class="card">
      <h2>Cara mengisi spreadsheet</h2>
      <p>Isi sheet <strong>Produk</strong> mulai baris ke-2 dengan kolom berikut:</p>
      <ol class="columns-help">
        ${PRODUCT_COLUMNS.map((column) => html`<li><strong>${column}</strong> — ${COLUMN_HELP[column]}</li>`)}
      </ol>
      <p class="muted">Perubahan di spreadsheet tampil di toko dalam ±1 menit. Pesanan yang masuk tercatat di sheet <strong>Pesanan</strong>.</p>
    </section>`
}

const COLUMN_HELP: Readonly<Record<(typeof PRODUCT_COLUMNS)[number], string>> = {
  ID: 'kode unik produk, mis. P001 (boleh kosong)',
  Nama: 'nama produk (wajib)',
  Harga: 'angka saja tanpa titik, mis. 15000 (wajib)',
  Deskripsi: 'keterangan singkat (opsional)',
  'URL Gambar': 'tautan gambar https:// yang dapat diakses publik (opsional)',
  Stok: 'jumlah stok; kosongkan bila tidak dibatasi, 0 = habis',
  Aktif: 'TRUE untuk ditampilkan, FALSE untuk disembunyikan',
}

function catalogSection(catalog: CatalogStatus | null): SafeHtml {
  switch (catalog?.kind) {
    case 'ok':
      return catalog.products.length ? productTable(catalog.products) : html`<p class="muted">Belum ada produk aktif. Tambahkan produk di spreadsheet Anda.</p>`
    case 'google_access_revoked':
      return html`<p class="alert alert--error">Akses ke Google Sheets Anda terputus, sehingga toko tidak dapat menampilkan produk.
        <a href="/auth/google?consent=1">Hubungkan ulang akun Google</a>.</p>`
    case 'spreadsheet_unavailable':
      return html`<div class="alert alert--error">
        <p>Spreadsheet katalog tidak ditemukan (mungkin terhapus). Buat spreadsheet baru untuk toko ini?</p>
        <form method="post" action="/dashboard/spreadsheet"><button class="btn" type="submit">Buat Spreadsheet Baru</button></form>
      </div>`
    default:
      return html`<p class="alert alert--error">Gagal memuat produk dari Google Sheets. Silakan muat ulang halaman.</p>`
  }
}

function productTable(products: readonly Product[]): SafeHtml {
  return html`<div class="table-wrap"><table>
    <thead><tr><th>ID</th><th>Nama</th><th class="num">Harga</th><th class="num">Stok</th></tr></thead>
    <tbody>
      ${products.map((product) => html`<tr>
        <td>${product.id}</td>
        <td>${product.name}</td>
        <td class="num">${formatRupiah(product.price)}</td>
        <td class="num">${product.stock === null ? '∞' : product.stock}</td>
      </tr>`)}
    </tbody>
  </table></div>`
}

function storeForm(props: DashboardProps, submitLabel: string): SafeHtml {
  const values = props.form ?? { name: '', slug: '', whatsapp: '' }
  return html`<form method="post" action="/dashboard/store" class="form">
    <label>Nama toko
      <input name="name" required minlength="3" maxlength="60" value="${values.name}" placeholder="Dapur Bu Sari">
    </label>
    <label>Alamat toko
      <span class="input-prefix"><span>${props.appUrl}/s/</span>
        <input name="slug" required pattern="[a-z0-9][a-z0-9\\-]{1,38}[a-z0-9]" maxlength="40" value="${values.slug}" placeholder="dapur-bu-sari">
      </span>
      <small class="muted">Huruf kecil, angka, dan tanda hubung.</small>
    </label>
    <label>Nomor WhatsApp untuk menerima pesanan
      <input name="whatsapp" required inputmode="tel" maxlength="20" value="${values.whatsapp}" placeholder="081234567890">
    </label>
    <button class="btn btn--primary" type="submit">${submitLabel}</button>
  </form>`
}
