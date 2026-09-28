import { env } from 'cloudflare:workers'
import { createApp } from './app'
import { createContainer } from './container'

/**
 * Entry point Worker.
 *
 * Aplikasi WAJIB dirangkai di top-level module, bukan di dalam fetch():
 * Elysia `.compile()` menghasilkan kode lewat `new Function`, dan Workers hanya
 * mengizinkannya selama fase startup (compatibility flag `allow_eval_during_startup`,
 * aktif default sejak compatibility_date 2025-06-01). Bila dilakukan saat request,
 * muncul error "Code generation from strings disallowed for this context".
 *
 * Konsekuensinya konfigurasi divalidasi saat startup (fail-fast): secrets harus
 * sudah diset sebelum deploy. Tidak ada I/O di sini — semua koneksi dibuat lazy.
 */
export default createApp(createContainer(env))
