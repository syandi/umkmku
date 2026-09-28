import { html, type SafeHtml } from '../lib/html'

export interface LayoutProps {
  readonly title: string
  readonly body: SafeHtml
  readonly description?: string
  readonly scripts?: readonly string[]
}

export function layout({ title, body, description, scripts = [] }: LayoutProps): SafeHtml {
  return html`<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    ${description ? html`<meta name="description" content="${description}">` : null}
    <meta name="theme-color" content="#0f766e">
    <link rel="stylesheet" href="/assets/app.css">
    ${scripts.map((src) => html`<script src="${src}" defer></script>`)}
  </head>
  <body>
    ${body}
  </body>
</html>`
}

export function siteHeader(right: SafeHtml | null = null): SafeHtml {
  return html`<header class="site-header">
    <div class="container site-header__inner">
      <a class="brand" href="/">UMKM<span>ku</span></a>
      <nav class="site-header__nav">${right}</nav>
    </div>
  </header>`
}
