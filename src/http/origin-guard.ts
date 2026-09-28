import { ForbiddenError } from '../lib/errors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Proteksi CSRF lapis kedua (lapis pertama: cookie SameSite=Lax).
 * Request yang mengubah data harus berasal dari origin aplikasi sendiri.
 */
export function assertSameOrigin(request: Request, appOrigin: string): void {
  if (SAFE_METHODS.has(request.method)) return
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== appOrigin) {
    throw new ForbiddenError('Permintaan ditolak karena berasal dari situs lain.')
  }
}
