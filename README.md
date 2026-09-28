# UMKMku

Etalase online untuk UMKM. Pemilik toko **masuk dengan Google**, mengelola produk di **Google Sheets miliknya sendiri**, dan pembeli **memesan lewat WhatsApp**.

- Runtime: Cloudflare Workers (lokal via `wrangler dev` / workerd)
- Tooling: [Bun](https://bun.sh) — package manager, script runner, dan test runner
- Framework: [ElysiaJS](https://elysiajs.com) (Cloudflare adapter)
- Data aplikasi (user, toko, sesi): Cloudflare D1
- Data produk & catatan pesanan: Google Sheets di Drive pemilik toko

## Alur

```
Pemilik toko                                   Pembeli
─────────────                                  ───────
/auth/google  ──► Google OAuth (PKCE)          /s/:slug  ──► katalog dari Sheets (cache 60 dtk)
      │                                              │
      ▼                                              ▼  pilih produk (cart.js, localStorage)
/dashboard: buat toko ──► spreadsheet otomatis  POST /s/:slug/checkout
      │   dibuat di Drive pemilik                    │  harga dihitung ulang dari Sheets
      ▼                                              │  pesanan dicatat di sheet "Pesanan"
Isi produk di Google Sheets                          ▼
                                               303 ──► https://wa.me/<nomor>?text=<pesanan>
```

## Struktur kode

```
src/
├── index.ts            Entry Worker (app dirangkai di top-level, lihat catatan di file)
├── app.ts              Rakit Elysia: error handler + routes
├── container.ts        Composition root (satu-satunya tempat `new` implementasi konkret)
├── config.ts           Baca & validasi env (fail-fast)
├── domain/             Aturan bisnis murni, tanpa I/O — mudah diuji
│   ├── product.ts      Parsing baris spreadsheet → Product
│   ├── order.ts        Validasi keranjang & perhitungan total
│   ├── whatsapp.ts     Normalisasi nomor & format pesan wa.me
│   ├── store.ts        Validasi toko (slug, nama, WA)
│   ├── opening-hours.ts Jadwal buka & status buka/tutup (zona waktu WIB/WITA/WIT)
│   └── money.ts        Format rupiah
├── services/           Use case aplikasi
│   ├── ports.ts        Interface repository/gateway (dependency inversion)
│   ├── auth-service.ts Login Google + sesi
│   └── store-service.ts Toko, katalog, checkout
├── infra/              Adapter ke dunia luar
│   ├── google/         OAuth client, access token provider, Sheets gateway
│   ├── db/             Repository D1
│   └── catalog-cache.ts Cache API Cloudflare
├── http/               Lapisan HTTP: routes, cookie, respons, error handler
├── views/              Template HTML (auto-escape)
└── lib/                Utilitas generik (html, crypto, cookies, errors)
public/assets/          CSS & JS keranjang (dilayani langsung oleh Cloudflare)
migrations/             Skema D1
test/                   Unit test bun:test (domain, services dengan fake, views)
```

Arah dependensi: `http → services → domain`, sedangkan `infra` mengimplementasikan `services/ports.ts`. Domain tidak mengenal Elysia, D1, maupun Google.

## Setup

### 1. Google Cloud

1. Buat project di [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs & Services → Library** → aktifkan **Google Sheets API**.
3. **Google Auth Platform → Branding / Audience** (OAuth consent screen):
   - User type: **External**
   - Scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.file`
4. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorized redirect URIs:
     - `http://localhost:8787/auth/google/callback`
     - `https://DOMAIN-ANDA/auth/google/callback`
5. Simpan Client ID dan Client Secret.

> ⚠️ Selama status aplikasi **Testing**, hanya test user yang bisa login dan **refresh token kedaluwarsa setelah 7 hari** (toko akan berhenti menampilkan produk). Ubah ke **In production** sebelum dipakai UMKM sungguhan. Scope `drive.file` termasuk *non-sensitive*, jadi proses verifikasinya ringan.

### 2. Lokal

Butuh [Bun](https://bun.sh) ≥ 1.3 (`curl -fsSL https://bun.sh/install | bash`).

```bash
bun install                       # juga menjalankan `wrangler types`
bunx wrangler d1 create umkmku    # salin database_id ke wrangler.jsonc
cp .dev.vars.example .dev.vars    # isi Client ID/Secret
openssl rand -base64 32           # tempel ke TOKEN_ENCRYPTION_KEY di .dev.vars
bun run db:migrate:local
bun run dev                       # http://localhost:8787
```

> Bun dipakai untuk tooling saja. Kode aplikasi tetap berjalan di runtime Cloudflare Workers (`workerd`), baik saat `wrangler dev` maupun di produksi — jadi jangan memakai API khusus Bun (`Bun.*`, `bun:sqlite`, dll.) di dalam `src/`.

### 3. Deploy

Konfigurasi divalidasi saat Worker startup, jadi **set semua secret sebelum deploy pertama** (`wrangler secret put` otomatis membuat Worker bila belum ada).

```bash
# Ganti APP_URL di wrangler.jsonc ke URL produksi (tanpa garis miring di akhir)
bunx wrangler secret put GOOGLE_CLIENT_ID
bunx wrangler secret put GOOGLE_CLIENT_SECRET
bunx wrangler secret put TOKEN_ENCRYPTION_KEY   # kunci BERBEDA dari lokal
bun run db:migrate:remote
bun run deploy
```

Gunakan **custom domain** di produksi: Cache API (cache katalog 60 detik) tidak aktif di `*.workers.dev`, sehingga tanpa custom domain setiap kunjungan toko membaca Google Sheets langsung.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `bun run dev` | Server lokal |
| `bun test` | Unit test (`bun:test`) |
| `bun run typecheck` | Generate tipe binding + `tsc` untuk `src/` (tipe Workers) dan `test/` (tipe Bun) |
| `bun run deploy` | Deploy ke Cloudflare |

## Format spreadsheet

Spreadsheet dibuat otomatis saat toko dibuat, berisi dua sheet:

**Produk** (baris 1 = header, data mulai baris 2)

| ID | Nama | Harga | Deskripsi | URL Gambar | Stok | Aktif |
| --- | --- | --- | --- | --- | --- | --- |
| P001 | Keripik Singkong | 15000 | Pedas manis | https://… | 20 | TRUE |

- Baris tanpa Nama/Harga diabaikan. `Aktif` = FALSE menyembunyikan produk.
- `Stok` kosong = tidak dibatasi; `0` = habis.

**Pesanan** — diisi otomatis setiap checkout: Waktu (zona waktu toko), Nama, Alamat, Catatan, Item, Total.

## QR code toko

Kartu **QR Code Toko** di dashboard menyediakan:

- **Cetak Poster** (`/dashboard/qr`): poster A4 berisi nama toko, QR besar, link, dan jam buka.
- **Unduh PNG** (`/s/:slug/qr.png?download=1`): untuk dibagikan di WhatsApp/Instagram.
- **Unduh SVG** (`/s/:slug/qr.svg?download=1`): vektor, tajam dicetak sebesar apa pun (spanduk, stiker).

QR dibuat oleh encoder internal tanpa dependensi (`src/lib/qr`): mode byte, koreksi error level M
(tetap terbaca walau ±15% rusak), versi 1–10. Kebenarannya diverifikasi dengan memindai hasil versi 1–10
memakai pemindai OpenCV. Isi QR mengikuti `APP_URL`, jadi pastikan `APP_URL` produksi sudah benar
sebelum mencetak QR.

## Jam buka

Diatur pemilik toko di dashboard (kartu **Jam Buka**): jadwal per hari Senin–Minggu dan zona waktu WIB/WITA/WIT.

- Pesanan **hanya diterima saat toko buka**. Aturan ini ditegakkan di server (`StoreService.checkout`), bukan hanya di tampilan.
- Saat tutup, halaman toko tetap menampilkan produk, tetapi form pesanan disembunyikan dan pembeli diberi tahu kapan toko buka lagi.
- Jam tutup lebih awal dari jam buka = buka melewati tengah malam (mis. 18:00–02:00). Jam buka = jam tutup = 24 jam.
- Toko yang belum mengatur jadwal dianggap buka 24 jam.

Setelah menarik perubahan ini, jalankan migrasi: `bun run db:migrate:local` (dan `db:migrate:remote` saat deploy).

## Catatan: Elysia di Cloudflare Workers

Elysia membuat kode lewat `new Function` saat `.compile()`. Workers hanya mengizinkan ini selama **fase startup**
(flag `allow_eval_during_startup`, default sejak `compatibility_date` 2025-06-01). Karena itu:

- App dirangkai dan di-`compile()` di top-level `src/index.ts`, bukan di dalam `fetch()`.
- `compatibility_date` di `wrangler.jsonc` **jangan** diturunkan di bawah `2025-06-01`.
- Jangan membuat instance `new Elysia()` atau route baru saat request.

Bila muncul `Code generation from strings disallowed for this context`, salah satu aturan di atas dilanggar.

## Keputusan desain & keamanan

- **Scope `drive.file`** (bukan `spreadsheets`): aplikasi hanya bisa menyentuh file yang dibuatnya sendiri — least privilege.
- **OAuth Authorization Code + PKCE + state**, disimpan di cookie HttpOnly berumur 10 menit.
- **Refresh token dienkripsi AES-256-GCM** sebelum disimpan di D1 (format berversi `v1.` untuk rotasi kunci).
- **Sesi server-side**: cookie berisi token acak 256-bit; D1 hanya menyimpan hash SHA-256-nya.
- **Harga tidak dipercaya dari klien**: checkout selalu menghitung ulang dari spreadsheet terbaru dan memeriksa stok.
- **Pencatatan pesanan memakai `valueInputOption=RAW`** agar input pembeli tidak dieksekusi sebagai formula.
- **HTML auto-escape** + **CSP ketat** (tanpa inline script), `SameSite=Lax` + pemeriksaan `Origin` untuk POST dashboard.
- Pencatatan pesanan ke sheet bersifat *best-effort*: kalau gagal, pembeli tetap diarahkan ke WhatsApp.

## Pengembangan berikutnya

- Rate limiting endpoint checkout (Cloudflare Rate Limiting binding) untuk mencegah spam baris pesanan.
- Upload gambar produk ke R2 (saat ini memakai URL gambar publik).
- Kategori produk, lebih dari satu toko per akun, tema/warna toko.
- Integration test route (mis. `unstable_startWorker` dari Wrangler, dipanggil dari `bun test`).
