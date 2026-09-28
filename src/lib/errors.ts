/**
 * Semua error yang "diketahui" aplikasi turunan dari AppError.
 * - `message`     : untuk log/developer (bahasa Inggris, boleh teknis)
 * - `userMessage` : aman ditampilkan ke pengguna (bahasa Indonesia)
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly userMessage: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = new.target.name
  }
}

export class ValidationError extends AppError {
  constructor(userMessage: string) {
    super(userMessage, 400, userMessage)
  }
}

export class AuthRequiredError extends AppError {
  constructor() {
    super('Authentication required', 401, 'Silakan masuk terlebih dahulu.')
  }
}

export class ForbiddenError extends AppError {
  constructor(userMessage = 'Anda tidak memiliki akses ke halaman ini.') {
    super('Forbidden', 403, userMessage)
  }
}

export class NotFoundError extends AppError {
  constructor(subject = 'Halaman') {
    super(`${subject} not found`, 404, `${subject} tidak ditemukan.`)
  }
}

export class GoogleApiError extends AppError {
  constructor(
    readonly apiStatus: number,
    detail: string,
  ) {
    super(`Google API error ${apiStatus}: ${detail}`, 502, 'Gagal terhubung ke Google. Silakan coba lagi.')
  }
}

/**
 * API Google yang dibutuhkan belum diaktifkan di project Google Cloud aplikasi.
 * Ini kesalahan konfigurasi milik pengelola aplikasi, bukan milik pengguna.
 */
export class GoogleApiDisabledError extends AppError {
  constructor(apiName: string, detail: string) {
    super(
      `${apiName} is disabled for this Google Cloud project: ${detail}`,
      503,
      `Layanan ${apiName} belum diaktifkan untuk aplikasi ini. Pengelola aplikasi perlu mengaktifkannya di Google Cloud Console (APIs & Services → Library), lalu coba lagi dalam beberapa menit.`,
    )
  }
}

/** Refresh token tidak ada / dicabut pemilik toko (invalid_grant). */
export class GoogleAccessRevokedError extends AppError {
  constructor() {
    super(
      'Google refresh token missing or revoked',
      503,
      'Toko ini sedang tidak dapat menampilkan produk. Silakan coba lagi nanti.',
    )
  }
}

/** Spreadsheet toko dihapus atau tidak dapat diakses lagi oleh aplikasi. */
export class SpreadsheetUnavailableError extends AppError {
  constructor(spreadsheetId: string) {
    super(
      `Spreadsheet ${spreadsheetId} not found or not accessible`,
      503,
      'Katalog toko ini sedang tidak tersedia. Silakan coba lagi nanti.',
    )
  }
}
