export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/**
 * Dibungkus agar `fetch` tidak kehilangan `this` saat disimpan sebagai properti
 * (di Workers, memanggil fetch yang "terlepas" melempar "Illegal invocation").
 */
export const defaultFetch: FetchFn = (input, init) => fetch(input, init)

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await response.json()
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
