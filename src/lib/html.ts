/**
 * Template HTML minimalis dengan auto-escape.
 *
 * Setiap nilai yang disisipkan ke `html\`...\`` di-escape secara default,
 * kecuali sudah berupa SafeHtml (hasil `html` lain atau `raw`).
 * Ini membuat XSS menjadi "opt-in" alih-alih "opt-out".
 */
export class SafeHtml {
  constructor(readonly value: string) {}

  toString(): string {
    return this.value
  }
}

export type HtmlValue = SafeHtml | string | number | boolean | null | undefined | readonly HtmlValue[]

const ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char)
}

/** Sisipkan string apa adanya. Hanya untuk konten yang 100% dikontrol aplikasi. */
export function raw(value: string): SafeHtml {
  return new SafeHtml(value)
}

function render(value: HtmlValue): string {
  // null/undefined/boolean dirender kosong agar pola `cond && html\`...\`` aman dipakai.
  if (value === null || value === undefined || typeof value === 'boolean') return ''
  if (value instanceof SafeHtml) return value.value
  if (typeof value === 'string' || typeof value === 'number') return escapeHtml(String(value))
  return value.map(render).join('')
}

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let output = strings[0] ?? ''
  values.forEach((value, index) => {
    output += render(value) + (strings[index + 1] ?? '')
  })
  return new SafeHtml(output)
}
