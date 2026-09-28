import { describe, expect, it } from 'bun:test'
import { parseCookies, serializeCookie } from '../src/lib/cookies'
import { bytesToBase64Url, constantTimeEqual, randomToken, TokenCipher } from '../src/lib/crypto'
import { html, raw } from '../src/lib/html'

describe('html', () => {
  it('meng-escape nilai yang disisipkan', () => {
    const name = '<script>alert("x")</script>'
    expect(html`<p>${name}</p>`.value).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>')
  })

  it('tidak meng-escape ulang SafeHtml dan mendukung array', () => {
    const items = ['a', 'b'].map((item) => html`<li>${item}</li>`)
    expect(html`<ul>${items}</ul>${raw('<hr>')}`.value).toBe('<ul><li>a</li><li>b</li></ul><hr>')
  })

  it('merender null/undefined/boolean sebagai string kosong, tapi 0 tetap tampil', () => {
    expect(html`${null}${undefined}${false}${0}`.value).toBe('0')
  })
})

describe('cookies', () => {
  it('serialize dengan default aman', () => {
    expect(serializeCookie('sid', 'a b', { secure: true, maxAge: 60 })).toBe(
      'sid=a%20b; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax',
    )
  })

  it('parse header cookie dan abaikan yang rusak', () => {
    const cookies = parseCookies('sid=abc; bad=%E0%A4%A; theme=dark')
    expect(cookies.get('sid')).toBe('abc')
    expect(cookies.has('bad')).toBe(false)
    expect(cookies.get('theme')).toBe('dark')
  })
})

describe('crypto', () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))

  it('enkripsi lalu dekripsi menghasilkan teks semula, dengan IV acak', async () => {
    const cipher = new TokenCipher(key)
    const first = await cipher.encrypt('refresh-token')
    const second = await cipher.encrypt('refresh-token')
    expect(first).not.toBe(second)
    expect(await cipher.decrypt(first)).toBe('refresh-token')
  })

  it('menolak ciphertext yang dimodifikasi', async () => {
    const cipher = new TokenCipher(key)
    const [version, iv] = (await cipher.encrypt('x')).split('.')
    await expect(cipher.decrypt(`${version}.${iv}.${bytesToBase64Url(new Uint8Array(17))}`)).rejects.toThrow()
  })

  it('menolak kunci yang bukan 32 byte', () => {
    expect(() => new TokenCipher(btoa('pendek'))).toThrow(/32 byte/)
  })

  it('randomToken aman untuk URL', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('constantTimeEqual', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
  })
})
