/** Variabel lingkungan yang dibaca aplikasi (vars di wrangler.jsonc + secrets). */
export interface ConfigSource {
  readonly APP_URL?: string
  readonly GOOGLE_CLIENT_ID?: string
  readonly GOOGLE_CLIENT_SECRET?: string
  readonly TOKEN_ENCRYPTION_KEY?: string
}

export interface AppConfig {
  /** URL publik aplikasi tanpa trailing slash, mis. https://umkmku.id */
  readonly appUrl: string
  readonly appOrigin: string
  /** Cookie `Secure` hanya bila aplikasi berjalan di HTTPS. */
  readonly secureCookies: boolean
  readonly google: {
    readonly clientId: string
    readonly clientSecret: string
    readonly redirectUri: string
  }
  readonly tokenEncryptionKey: string
  readonly sessionTtlSeconds: number
  readonly catalogCacheTtlSeconds: number
}

/** Fail-fast: konfigurasi yang hilang langsung terlihat jelas, bukan error samar di tengah alur. */
export function loadConfig(source: ConfigSource): AppConfig {
  const appUrl = required(source, 'APP_URL').replace(/\/+$/, '')
  const url = new URL(appUrl)

  return {
    appUrl,
    appOrigin: url.origin,
    secureCookies: url.protocol === 'https:',
    google: {
      clientId: required(source, 'GOOGLE_CLIENT_ID'),
      clientSecret: required(source, 'GOOGLE_CLIENT_SECRET'),
      redirectUri: `${appUrl}/auth/google/callback`,
    },
    tokenEncryptionKey: required(source, 'TOKEN_ENCRYPTION_KEY'),
    sessionTtlSeconds: 60 * 60 * 24 * 30,
    catalogCacheTtlSeconds: 60,
  }
}

function required(source: ConfigSource, key: keyof ConfigSource): string {
  const value = source[key]?.trim()
  if (!value) throw new Error(`Environment variable ${key} belum diset. Lihat README bagian konfigurasi.`)
  return value
}
