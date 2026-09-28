import type { QrMatrix } from './encoder'

/** Byte array yang dijamin berbasis ArrayBuffer (bisa langsung jadi body Response/Blob). */
type Bytes = Uint8Array<ArrayBuffer>

/** Zona sepi (quiet zone) minimal 4 modul menurut standar; tanpa ini kamera sulit mengenali QR. */
const QUIET_ZONE = 4

/**
 * SVG vektor — tajam di ukuran cetak berapa pun. Semua modul gelap digabung
 * dalam satu <path> agar ringan.
 */
export function renderQrSvg(qr: QrMatrix, options: { title?: string } = {}): string {
  const dimension = qr.size + QUIET_ZONE * 2
  let path = ''
  qr.modules.forEach((row, y) =>
    row.forEach((isDark, x) => {
      if (isDark) path += `M${x + QUIET_ZONE},${y + QUIET_ZONE}h1v1h-1z`
    }),
  )
  const title = options.title ? `<title>${escapeXml(options.title)}</title>` : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges" role="img">` +
    `${title}<rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="${path}"/></svg>`
  )
}

/**
 * PNG hitam-putih (grayscale 1-bit). Format ini yang diterima WhatsApp/Instagram.
 * Kompresi memakai CompressionStream("deflate") = zlib, tersedia di Workers & Bun.
 */
export async function renderQrPng(qr: QrMatrix, options: { pixelsPerModule?: number } = {}): Promise<Bytes> {
  const scale = options.pixelsPerModule ?? 16
  const width = (qr.size + QUIET_ZONE * 2) * scale
  const bytesPerRow = Math.ceil(width / 8)

  // Setiap baris: 1 byte filter (0 = none) + piksel 1-bit, bit 1 = putih.
  const raw = new Uint8Array((bytesPerRow + 1) * width)
  for (let py = 0; py < width; py++) {
    const moduleY = Math.floor(py / scale) - QUIET_ZONE
    const rowOffset = py * (bytesPerRow + 1) + 1
    for (let px = 0; px < width; px++) {
      const moduleX = Math.floor(px / scale) - QUIET_ZONE
      const isDark = qr.modules[moduleY]?.[moduleX] ?? false
      if (!isDark) raw[rowOffset + (px >> 3)]! |= 0x80 >> (px & 7)
    }
  }

  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, width)
  header.set([1, 0, 0, 0, 0], 8) // bit depth 1, color type 0 (grayscale), default compression/filter/interlace

  return concatBytes([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', await zlibDeflate(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ])
}

function pngChunk(type: string, data: Bytes): Bytes {
  const typeBytes = new TextEncoder().encode(type)
  const chunk = new Uint8Array(12 + data.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(typeBytes, 4)
  chunk.set(data, 8)
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))
  return chunk
}

async function zlibDeflate(data: Bytes): Promise<Bytes> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function concatBytes(parts: readonly Bytes[]): Bytes {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}
