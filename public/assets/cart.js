/**
 * Keranjang belanja di sisi klien (progressive enhancement untuk halaman toko).
 * - State disimpan di localStorage per toko.
 * - Server TIDAK mempercayai harga dari sini; yang dikirim hanya ID & jumlah.
 * - DOM hanya diubah via textContent (tanpa innerHTML) untuk mencegah XSS.
 */
;(() => {
  'use strict'

  const MAX_QUANTITY = 999
  const root = document.querySelector('[data-store]')
  if (!(root instanceof HTMLElement)) return

  const storageKey = `umkmku:cart:${root.dataset.store}`
  const el = {
    checkout: root.querySelector('[data-checkout]'),
    lines: root.querySelector('[data-cart-lines]'),
    total: root.querySelector('[data-cart-total]'),
    input: root.querySelector('[data-cart-input]'),
    cartbar: root.querySelector('[data-cartbar]'),
    summary: root.querySelector('[data-cart-summary]'),
  }

  /** @type {Map<string, {node: HTMLElement, name: string, price: number, max: number}>} */
  const catalog = new Map()
  for (const node of root.querySelectorAll('[data-product]')) {
    if (!(node instanceof HTMLElement) || !node.dataset.productId || !node.querySelector('[data-qty]')) continue
    const stock = node.dataset.stock
    catalog.set(node.dataset.productId, {
      node,
      name: node.dataset.name ?? '',
      price: Number(node.dataset.price),
      max: stock ? Math.min(Number(stock), MAX_QUANTITY) : MAX_QUANTITY,
    })
  }

  /** @type {Record<string, number>} */
  let cart = loadCart()
  /** Form pemesanan sedang terlihat di layar → bar ringkasan tidak perlu tampil. */
  let checkoutInView = false

  function loadCart() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
      /** @type {Record<string, number>} */
      const result = {}
      for (const [id, quantity] of Object.entries(stored)) {
        const product = catalog.get(id)
        if (product && Number.isInteger(quantity) && quantity > 0) result[id] = Math.min(quantity, product.max)
      }
      return result
    } catch {
      return {}
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart))
    } catch {
      // localStorage bisa tidak tersedia (mode privat); keranjang tetap berfungsi selama halaman terbuka.
    }
  }

  function setQuantity(id, quantity) {
    const product = catalog.get(id)
    if (!product) return
    const next = Math.max(0, Math.min(quantity, product.max))
    if (next === 0) delete cart[id]
    else cart[id] = next
    saveCart()
    render()
  }

  function formatRupiah(amount) {
    return 'Rp' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }

  function render() {
    let count = 0
    let total = 0
    const lines = []

    for (const [id, product] of catalog) {
      const quantity = cart[id] ?? 0
      const output = product.node.querySelector('[data-qty]')
      if (output) output.textContent = String(quantity)
      product.node.classList.toggle('product--selected', quantity > 0)
      const increment = product.node.querySelector('[data-action="increment"]')
      if (increment instanceof HTMLButtonElement) increment.disabled = quantity >= product.max

      if (quantity > 0) {
        count += quantity
        total += quantity * product.price
        lines.push({ id, name: product.name, quantity, subtotal: quantity * product.price })
      }
    }

    el.lines?.replaceChildren(
      ...lines.map((line) => {
        const item = document.createElement('li')
        const label = document.createElement('span')
        label.textContent = `${line.name} × ${line.quantity}`
        const amount = document.createElement('strong')
        amount.textContent = formatRupiah(line.subtotal)
        item.append(label, amount)
        return item
      }),
    )
    if (el.total) el.total.textContent = formatRupiah(total)
    if (el.summary) el.summary.textContent = `${count} item · ${formatRupiah(total)}`
    if (el.input instanceof HTMLInputElement) {
      el.input.value = JSON.stringify(lines.map((line) => ({ productId: line.id, quantity: line.quantity })))
    }
    if (el.checkout instanceof HTMLElement) el.checkout.hidden = count === 0
    if (el.cartbar instanceof HTMLElement) el.cartbar.hidden = count === 0 || checkoutInView
  }

  function goToCheckout() {
    if (!(el.checkout instanceof HTMLElement)) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.checkout.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    const nameInput = el.checkout.querySelector('input[name="name"]')
    if (nameInput instanceof HTMLInputElement) nameInput.focus({ preventScroll: true })
  }

  if (el.checkout instanceof HTMLElement && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      checkoutInView = entries.some((entry) => entry.isIntersecting)
      render()
    }).observe(el.checkout)
  }

  root.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('[data-action]')
    if (!(button instanceof HTMLElement)) return

    if (button.dataset.action === 'go-checkout') {
      event.preventDefault()
      goToCheckout()
      return
    }

    if (button.dataset.action === 'clear') {
      cart = {}
      saveCart()
      render()
      return
    }

    const productNode = button.closest('[data-product]')
    const id = productNode instanceof HTMLElement ? productNode.dataset.productId : undefined
    if (!id) return
    const current = cart[id] ?? 0
    if (button.dataset.action === 'increment') setQuantity(id, current + 1)
    if (button.dataset.action === 'decrement') setQuantity(id, current - 1)
  })

  render()
})()
