import { PRODUCT_COLUMNS, PRODUCT_DATA_RANGE, PRODUCT_SHEET_NAME } from '../../domain/product'
import { GoogleApiError, SpreadsheetUnavailableError } from '../../lib/errors'
import type { SheetCell, StoreSpreadsheetGateway } from '../../services/ports'
import { defaultFetch, readJson, type FetchFn } from '../http'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

export const ORDER_SHEET_NAME = 'Pesanan'
export const ORDER_COLUMNS = ['Waktu', 'Nama', 'Alamat', 'Catatan', 'Item', 'Total'] as const

const SAMPLE_PRODUCTS: readonly (readonly SheetCell[])[] = [
  ['P001', 'Contoh: Keripik Singkong Pedas', 15000, 'Ganti baris ini dengan produk Anda', '', 20, true],
  ['P002', 'Contoh: Sambal Bawang 200gr', 25000, 'Kosongkan kolom Stok bila tidak dibatasi', '', '', true],
]

/**
 * Adapter Google Sheets API v4 untuk kebutuhan toko.
 * Semua detail HTTP & format API Google terisolasi di sini.
 */
export class GoogleSheetsGateway implements StoreSpreadsheetGateway {
  constructor(private readonly fetchFn: FetchFn = defaultFetch) {}

  /** Membuat spreadsheet baru (sheet Produk + Pesanan) di Drive pemilik. */
  async createStoreSpreadsheet(accessToken: string, title: string): Promise<string> {
    const data = await this.request(accessToken, SHEETS_API, {
      method: 'POST',
      body: JSON.stringify({
        properties: { title, locale: 'id_ID', timeZone: 'Asia/Jakarta' },
        sheets: [
          sheetWithRows(PRODUCT_SHEET_NAME, [PRODUCT_COLUMNS, ...SAMPLE_PRODUCTS]),
          sheetWithRows(ORDER_SHEET_NAME, [ORDER_COLUMNS]),
        ],
      }),
    })

    if (typeof data.spreadsheetId !== 'string') {
      throw new GoogleApiError(502, 'spreadsheetId missing from create response')
    }
    return data.spreadsheetId
  }

  async getProductRows(accessToken: string, spreadsheetId: string): Promise<unknown[][]> {
    const range = encodeURIComponent(PRODUCT_DATA_RANGE)
    const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`
    const data = await this.request(accessToken, url, { method: 'GET' }, spreadsheetId)
    return Array.isArray(data.values) ? (data.values as unknown[][]) : []
  }

  async appendOrderRow(accessToken: string, spreadsheetId: string, row: readonly SheetCell[]): Promise<void> {
    const range = encodeURIComponent(`${ORDER_SHEET_NAME}!A1`)
    // valueInputOption=RAW: input pelanggan TIDAK diinterpretasi sebagai formula
    // (mencegah formula/CSV injection seperti "=IMPORTXML(...)").
    const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
    await this.request(accessToken, url, { method: 'POST', body: JSON.stringify({ values: [row] }) }, spreadsheetId)
  }

  private async request(
    accessToken: string,
    url: string,
    init: RequestInit,
    spreadsheetId?: string,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchFn(url, {
      ...init,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    })
    const data = await readJson(response)

    if (response.ok) return data
    // 404: file dihapus. 403: dengan scope drive.file, file tidak lagi bisa diakses aplikasi.
    if (spreadsheetId && (response.status === 404 || response.status === 403)) {
      throw new SpreadsheetUnavailableError(spreadsheetId)
    }
    const error = data.error as { message?: unknown } | undefined
    throw new GoogleApiError(response.status, String(error?.message ?? response.statusText))
  }
}

function sheetWithRows(title: string, rows: readonly (readonly SheetCell[])[]) {
  return {
    properties: { title, gridProperties: { frozenRowCount: 1 } },
    data: [
      {
        startRow: 0,
        startColumn: 0,
        rowData: rows.map((row, rowIndex) => ({
          values: row.map((cell) => ({
            userEnteredValue: toExtendedValue(cell),
            ...(rowIndex === 0 ? { userEnteredFormat: { textFormat: { bold: true } } } : {}),
          })),
        })),
      },
    ],
  }
}

function toExtendedValue(cell: SheetCell) {
  if (typeof cell === 'number') return { numberValue: cell }
  if (typeof cell === 'boolean') return { boolValue: cell }
  return { stringValue: cell }
}
