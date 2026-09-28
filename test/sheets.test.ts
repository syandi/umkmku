import { describe, expect, it } from 'bun:test'
import { GoogleSheetsGateway } from '../src/infra/google/sheets'
import { GoogleApiDisabledError, GoogleApiError, SpreadsheetUnavailableError } from '../src/lib/errors'

function gatewayReturning(status: number, body: unknown) {
  return new GoogleSheetsGateway(async () => new Response(JSON.stringify(body), { status }))
}

const serviceDisabled = {
  error: {
    code: 403,
    message: 'Google Sheets API has not been used in project 123 before or it is disabled.',
    status: 'PERMISSION_DENIED',
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }],
  },
}

describe('GoogleSheetsGateway', () => {
  it('mengembalikan ID spreadsheet yang dibuat', async () => {
    await expect(gatewayReturning(200, { spreadsheetId: 'abc' }).createStoreSpreadsheet('t', 'Toko')).resolves.toBe('abc')
  })

  it('mengirim properti spreadsheet yang valid (tanpa locale)', async () => {
    let body: Record<string, any> = {}
    const gateway = new GoogleSheetsGateway(async (_url, init) => {
      body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ spreadsheetId: 'abc' }), { status: 200 })
    })
    await gateway.createStoreSpreadsheet('t', 'Toko')
    expect(body.properties).toEqual({ title: 'Toko', timeZone: 'Asia/Jakarta' })
    expect(body.sheets.map((sheet: any) => sheet.properties.title)).toEqual(['Produk', 'Pesanan'])
  })

  it('mengenali Sheets API yang belum diaktifkan', async () => {
    await expect(gatewayReturning(403, serviceDisabled).createStoreSpreadsheet('t', 'Toko')).rejects.toBeInstanceOf(
      GoogleApiDisabledError,
    )
  })

  it('API nonaktif saat membaca produk tidak dianggap spreadsheet hilang', async () => {
    await expect(gatewayReturning(403, serviceDisabled).getProductRows('t', 'abc')).rejects.toBeInstanceOf(
      GoogleApiDisabledError,
    )
  })

  it('404 saat membaca produk berarti spreadsheet tidak tersedia', async () => {
    await expect(
      gatewayReturning(404, { error: { code: 404, message: 'not found', status: 'NOT_FOUND' } }).getProductRows('t', 'abc'),
    ).rejects.toBeInstanceOf(SpreadsheetUnavailableError)
  })

  it('error lain menyertakan status & pesan Google untuk log', async () => {
    const gateway = gatewayReturning(429, { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } })
    await expect(gateway.createStoreSpreadsheet('t', 'Toko')).rejects.toThrow(GoogleApiError)
    await expect(gateway.createStoreSpreadsheet('t', 'Toko')).rejects.toThrow(/RESOURCE_EXHAUSTED: Quota exceeded/)
  })
})
