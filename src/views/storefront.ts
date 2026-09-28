import { formatRupiah } from '../domain/money'
import { isAvailable, type Product } from '../domain/product'
import { storefrontPath, type Store } from '../domain/store'
import { html, type SafeHtml } from '../lib/html'
import { layout } from './layout'

/**
 * Halaman toko publik. Interaksi keranjang ditangani /assets/cart.js;
 * data produk dibaca skrip dari atribut data-* (tanpa inline script, ramah CSP).
 */
export function storefrontPage({ store, products }: { store: Store; products: readonly Product[] }): SafeHtml {
  return layout({
    title: `${store.name} · UMKMku`,
    description: `Belanja di ${store.name}. Pesan langsung via WhatsApp.`,
    scripts: ['/assets/cart.js'],
    body: html`<main class="storefront" data-store="${store.slug}">
      <header class="store-header">
        <div class="container">
          <h1>${store.name}</h1>
          <p class="muted">Pilih produk, lalu kirim pesanan lewat WhatsApp.</p>
        </div>
      </header>

      <noscript><p class="container alert alert--info">Aktifkan JavaScript untuk memesan.</p></noscript>

      <section class="container">
        ${products.length
          ? html`<div class="product-grid">${products.map(productCard)}</div>`
          : html`<p class="card center muted">Toko ini belum memiliki produk.</p>`}
      </section>

      <section id="checkout" class="container" data-checkout hidden>
        <div class="card checkout">
          <div class="checkout__head">
            <h2>Pesanan Anda</h2>
            <button type="button" class="btn btn--ghost" data-action="clear">Kosongkan</button>
          </div>
          <ul class="checkout__lines" data-cart-lines></ul>
          <p class="checkout__total">Total <strong data-cart-total>Rp0</strong></p>

          <form method="post" action="${storefrontPath(store.slug)}/checkout" class="form">
            <input type="hidden" name="cart" data-cart-input>
            <label>Nama
              <input name="name" required minlength="2" maxlength="80" autocomplete="name">
            </label>
            <label>Alamat pengiriman
              <textarea name="address" rows="3" maxlength="300" autocomplete="street-address"></textarea>
            </label>
            <label>Catatan (opsional)
              <textarea name="note" rows="2" maxlength="300"></textarea>
            </label>
            <button class="btn btn--wa btn--lg" type="submit">Kirim Pesanan via WhatsApp</button>
          </form>
        </div>
      </section>

      <div class="cartbar" data-cartbar hidden>
        <div class="container cartbar__inner">
          <span data-cart-summary></span>
          <a class="btn btn--wa" href="#checkout">Checkout</a>
        </div>
      </div>
    </main>`,
  })
}

function productCard(product: Product): SafeHtml {
  const available = isAvailable(product)

  return html`<article class="product ${available ? '' : 'product--soldout'}"
      data-product data-product-id="${product.id}" data-name="${product.name}"
      data-price="${product.price}" data-stock="${product.stock ?? ''}">
    ${product.imageUrl
      ? html`<img class="product__image" src="${product.imageUrl}" alt="${product.name}" loading="lazy" referrerpolicy="no-referrer">`
      : html`<div class="product__image product__image--placeholder" aria-hidden="true">${product.name.charAt(0)}</div>`}
    <div class="product__body">
      <h3 class="product__name">${product.name}</h3>
      <p class="product__price">${formatRupiah(product.price)}</p>
      ${product.description ? html`<p class="product__desc">${product.description}</p>` : null}
      ${available
        ? html`<div class="qty" role="group" aria-label="Jumlah ${product.name}">
            <button type="button" class="qty__btn" data-action="decrement" aria-label="Kurangi">−</button>
            <output class="qty__value" data-qty>0</output>
            <button type="button" class="qty__btn" data-action="increment" aria-label="Tambah">+</button>
          </div>`
        : html`<span class="badge">Stok habis</span>`}
    </div>
  </article>`
}
