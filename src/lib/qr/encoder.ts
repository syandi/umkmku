/**
 * Encoder QR Code (ISO/IEC 18004) minimalis tanpa dependensi.
 *
 * Cakupan sengaja dibatasi pada kebutuhan aplikasi: mode byte (UTF-8), tingkat koreksi
 * error M (±15% kerusakan masih terbaca — cukup untuk stiker yang tergores/terlipat),
 * versi 1–10 (hingga 213 byte; URL toko biasanya < 80 byte). Pemilihan mask otomatis
 * memakai skor penalti standar agar mudah dipindai kamera.
 *
 * Algoritma mengikuti implementasi referensi Project Nayuki (MIT).
 */

export interface QrMatrix {
  /** Jumlah modul per sisi (21 untuk versi 1, +4 per versi). */
  readonly size: number
  /** true = modul gelap. Indeks [baris][kolom]. */
  readonly modules: readonly (readonly boolean[])[]
}

const MIN_VERSION = 1
const MAX_VERSION = 10
/** Tingkat koreksi M. Indeks = versi. */
const ECC_CODEWORDS_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26] as const
const NUM_ERROR_CORRECTION_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5] as const
/** Bit format untuk level M (L=1, M=0, Q=3, H=2). */
const ECC_FORMAT_BITS_M = 0

export function encodeQr(text: string): QrMatrix {
  const data = new TextEncoder().encode(text)
  const version = chooseVersion(data.length)
  const codewords = addErrorCorrection(buildDataCodewords(data, version), version)

  const builder = new MatrixBuilder(version)
  builder.drawFunctionPatterns()
  builder.drawCodewords(codewords)
  builder.applyBestMask()
  return { size: builder.size, modules: builder.modules }
}

// ---------------------------------------------------------------------------
// Data & koreksi error
// ---------------------------------------------------------------------------

function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16
}

function numRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (version >= 7) result -= 36
  }
  return result
}

function numDataCodewords(version: number): number {
  return (
    Math.floor(numRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[version]! * NUM_ERROR_CORRECTION_BLOCKS[version]!
  )
}

function chooseVersion(byteLength: number): number {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
    const requiredBits = 4 + charCountBits(version) + byteLength * 8
    if (requiredBits <= numDataCodewords(version) * 8) return version
  }
  throw new RangeError(`Teks terlalu panjang untuk QR (maks. versi ${MAX_VERSION}): ${byteLength} byte`)
}

function buildDataCodewords(data: Uint8Array, version: number): number[] {
  const bits: number[] = []
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }

  append(0b0100, 4) // mode byte
  append(data.length, charCountBits(version))
  for (const byte of data) append(byte, 8)

  const capacityBits = numDataCodewords(version) * 8
  append(0, Math.min(4, capacityBits - bits.length)) // terminator
  append(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) append(pad, 8)

  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0))
  }
  return codewords
}

function addErrorCorrection(data: readonly number[], version: number): number[] {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[version]!
  const blockEccLength = ECC_CODEWORDS_PER_BLOCK[version]!
  const rawCodewords = Math.floor(numRawDataModules(version) / 8)
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
  const shortBlockLength = Math.floor(rawCodewords / numBlocks)
  const divisor = reedSolomonDivisor(blockEccLength)

  const blocks: number[][] = []
  for (let i = 0, offset = 0; i < numBlocks; i++) {
    const dataLength = shortBlockLength - blockEccLength + (i < numShortBlocks ? 0 : 1)
    const blockData = data.slice(offset, offset + dataLength)
    offset += dataLength
    const ecc = reedSolomonRemainder(blockData, divisor)
    if (i < numShortBlocks) blockData.push(0) // placeholder agar panjang blok seragam
    blocks.push([...blockData, ...ecc])
  }

  // Interleave per kolom, lewati placeholder milik blok pendek.
  const result: number[] = []
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLength - blockEccLength || j >= numShortBlocks) result.push(block[i]!)
    })
  }
  return result
}

function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j]!, root)
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!
    }
    root = gfMultiply(root, 0x02)
  }
  return result
}

function reedSolomonRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ result.shift()!
    result.push(0)
    divisor.forEach((coefficient, i) => {
      result[i]! ^= gfMultiply(coefficient, factor)
    })
  }
  return result
}

/** Perkalian di GF(2^8) dengan polinomial 0x11D. */
function gfMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

// ---------------------------------------------------------------------------
// Matriks modul
// ---------------------------------------------------------------------------

class MatrixBuilder {
  readonly size: number
  readonly modules: boolean[][]
  private readonly isFunction: boolean[][]

  constructor(private readonly version: number) {
    this.size = version * 4 + 17
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
  }

  drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunction(6, i, i % 2 === 0)
      this.setFunction(i, 6, i % 2 === 0)
    }
    this.drawFinder(3, 3)
    this.drawFinder(this.size - 4, 3)
    this.drawFinder(3, this.size - 4)

    const positions = this.alignmentPositions()
    const last = positions.length - 1
    positions.forEach((x, i) =>
      positions.forEach((y, j) => {
        const overlapsFinder = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)
        if (!overlapsFinder) this.drawAlignment(x, y)
      }),
    )

    this.drawFormatBits(0) // placeholder; ditimpa setelah mask dipilih
    this.drawVersionBits()
  }

  drawCodewords(codewords: readonly number[]): void {
    let bitIndex = 0
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5 // lewati kolom timing vertikal
      for (let vertical = 0; vertical < this.size; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vertical : vertical
          if (!this.isFunction[y]![x] && bitIndex < codewords.length * 8) {
            this.modules[y]![x] = ((codewords[bitIndex >>> 3]! >>> (7 - (bitIndex & 7))) & 1) === 1
            bitIndex++
          }
        }
      }
    }
  }

  applyBestMask(): void {
    let bestMask = 0
    let bestPenalty = Infinity
    for (let mask = 0; mask < 8; mask++) {
      this.applyMask(mask)
      this.drawFormatBits(mask)
      const penalty = penaltyScore(this.modules)
      if (penalty < bestPenalty) {
        bestPenalty = penalty
        bestMask = mask
      }
      this.applyMask(mask) // XOR dua kali = kembali semula
    }
    this.applyMask(bestMask)
    this.drawFormatBits(bestMask)
  }

  private setFunction(x: number, y: number, isDark: boolean): void {
    this.modules[y]![x] = isDark
    this.isFunction[y]![x] = true
  }

  private drawFinder(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunction(xx, yy, distance !== 2 && distance !== 4)
        }
      }
    }
  }

  private drawAlignment(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }

  private alignmentPositions(): number[] {
    if (this.version === 1) return []
    const count = Math.floor(this.version / 7) + 2
    const step = Math.ceil((this.version * 4 + 4) / (count * 2 - 2)) * 2
    const result = [6]
    for (let position = this.size - 7; result.length < count; position -= step) result.splice(1, 0, position)
    return result
  }

  private drawFormatBits(mask: number): void {
    const data = (ECC_FORMAT_BITS_M << 3) | mask
    let remainder = data
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
    const bits = ((data << 10) | remainder) ^ 0x5412
    const bit = (i: number) => ((bits >>> i) & 1) === 1

    for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(i))
    this.setFunction(8, 7, bit(6))
    this.setFunction(8, 8, bit(7))
    this.setFunction(7, 8, bit(8))
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(i))

    for (let i = 0; i < 8; i++) this.setFunction(this.size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) this.setFunction(8, this.size - 15 + i, bit(i))
    this.setFunction(8, this.size - 8, true) // modul gelap wajib
  }

  private drawVersionBits(): void {
    if (this.version < 7) return
    let remainder = this.version
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
    const bits = (this.version << 12) | remainder
    for (let i = 0; i < 18; i++) {
      const isDark = ((bits >>> i) & 1) === 1
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.setFunction(a, b, isDark)
      this.setFunction(b, a, isDark)
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y]![x] && MASKS[mask]!(x, y)) this.modules[y]![x] = !this.modules[y]![x]
      }
    }
  }
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

const FINDER_LIKE = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
] as const

/** Skor penalti ISO 18004 §7.8.3 — makin kecil makin mudah dipindai. */
function penaltyScore(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length
  const lines: boolean[][] = []
  for (let i = 0; i < size; i++) {
    lines.push([...modules[i]!])
    lines.push(modules.map((row) => row[i]!))
  }

  let score = 0
  for (const line of lines) {
    // N1: deretan ≥ 5 modul berwarna sama.
    let runLength = 1
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) {
        runLength++
      } else {
        if (runLength >= 5) score += 3 + (runLength - 5)
        runLength = 1
      }
    }
    // N3: pola mirip finder (1:1:3:1:1 + 4 modul terang).
    for (let i = 0; i + 11 <= line.length; i++) {
      for (const pattern of FINDER_LIKE) {
        if (pattern.every((value, k) => line[i + k] === value)) score += 40
      }
    }
  }

  // N2: blok 2x2 berwarna sama.
  let dark = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = modules[y]![x]!
      if (color) dark++
      if (x < size - 1 && y < size - 1 && color === modules[y]![x + 1] && color === modules[y + 1]![x] && color === modules[y + 1]![x + 1]) {
        score += 3
      }
    }
  }

  // N4: proporsi modul gelap menjauhi 50%.
  const total = size * size
  score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10
  return score
}
