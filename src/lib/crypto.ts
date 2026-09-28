/**
 * Utilitas kriptografi berbasis Web Crypto (tersedia di Workers & Node >= 20).
 */
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  return base64ToBytes(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
}

export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function decodeBase64UrlText(value: string): string {
  return decoder.decode(base64UrlToBytes(value))
}

/** Token acak yang aman untuk URL/cookie. 32 byte = 256 bit entropi. */
export function randomToken(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return bytesToBase64Url(new Uint8Array(digest))
}

/** Perbandingan string dengan waktu konstan (mencegah timing attack). */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!
  return diff === 0
}

const CIPHER_VERSION = 'v1'

/**
 * Enkripsi simetris AES-256-GCM untuk data sensitif at-rest (refresh token Google).
 * Format: `v1.<iv>.<ciphertext>` — prefix versi memudahkan rotasi kunci di masa depan.
 */
export class TokenCipher {
  private readonly key: Promise<CryptoKey>

  constructor(base64Key: string) {
    const raw = base64ToBytes(base64Key)
    if (raw.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY harus 32 byte dalam base64 (openssl rand -base64 32)')
    }
    this.key = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  }

  async encrypt(plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key, encoder.encode(plaintext))
    return [CIPHER_VERSION, bytesToBase64Url(iv), bytesToBase64Url(new Uint8Array(ciphertext))].join('.')
  }

  async decrypt(payload: string): Promise<string> {
    const [version, iv, ciphertext] = payload.split('.')
    if (version !== CIPHER_VERSION || !iv || !ciphertext) {
      throw new Error('Unrecognized encrypted payload format')
    }
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlToBytes(iv) },
      await this.key,
      base64UrlToBytes(ciphertext),
    )
    return decoder.decode(plaintext)
  }
}
