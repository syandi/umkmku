// Tombol "Cetak" di halaman poster QR (tanpa inline script agar sesuai CSP).
document.querySelector('[data-print]')?.addEventListener('click', () => window.print())
