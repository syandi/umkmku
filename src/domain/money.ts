/**
 * Format rupiah deterministik ("Rp15.000"), tidak bergantung data ICU runtime
 * sehingga hasil di server, browser, dan pesan WhatsApp selalu identik.
 */
export function formatRupiah(amount: number): string {
  const rounded = Math.round(amount)
  const sign = rounded < 0 ? '-' : ''
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}Rp${digits}`
}
