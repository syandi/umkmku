import { AppError, AuthRequiredError } from '../lib/errors'
import { errorPage } from '../views/error'
import { htmlResponse, redirectResponse } from './responses'

/** Memetakan error apa pun menjadi respons HTML yang ramah pengguna. */
export function handleError(code: unknown, error: unknown): Response {
  if (error instanceof AuthRequiredError) {
    return redirectResponse('/?login=required', { status: 303 })
  }

  if (error instanceof AppError) {
    if (error.status >= 500) console.error(error)
    return render(error.status, error.userMessage)
  }

  switch (code) {
    case 'NOT_FOUND':
      return render(404, 'Halaman tidak ditemukan.')
    case 'VALIDATION':
    case 'PARSE':
      return render(400, 'Data yang dikirim tidak valid. Silakan periksa kembali.')
    default:
      console.error('Unhandled error', error)
      return render(500, 'Terjadi kesalahan pada server. Silakan coba lagi.')
  }
}

function render(status: number, message: string): Response {
  return htmlResponse(errorPage({ status, message }), { status })
}
