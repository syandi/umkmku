import { describe, expect, it } from 'bun:test'
import type { GoogleIdentity, User } from '../src/domain/user'
import { DRIVE_FILE_SCOPE, type GoogleTokens } from '../src/infra/google/oauth'
import { ForbiddenError, ValidationError } from '../src/lib/errors'
import { AuthService } from '../src/services/auth-service'
import type { SessionRepository, UserRepository } from '../src/services/ports'
import { FakeTokens } from './fakes'

const identity: GoogleIdentity = { sub: 'g-1', email: 'sari@example.com', name: 'Sari', picture: null }

function setup(options: { refreshToken?: string | null; scopes?: string[]; storedToken?: string | null } = {}) {
  const tokens: GoogleTokens = {
    accessToken: 'at',
    expiresInSeconds: 3600,
    refreshToken: options.refreshToken === undefined ? 'rt' : options.refreshToken,
    scopes: new Set(options.scopes ?? ['openid', 'email', DRIVE_FILE_SCOPE]),
    idToken: 'x.y.z',
  }
  const saved: { refresh: string | null }[] = []
  const users: UserRepository = {
    async upsert(id, refresh) {
      saved.push({ refresh })
      return { id: id.sub, email: id.email, name: id.name, picture: id.picture }
    },
    async getEncryptedRefreshToken() {
      return options.storedToken ?? null
    },
    async clearRefreshToken() {},
  }
  const sessions: SessionRepository = {
    async create() {
      return 'session-token'
    },
    async findUser(): Promise<User | null> {
      return null
    },
    async delete() {},
  }
  const service = new AuthService({
    oauth: {
      buildAuthorizationUrl: ({ state, codeChallenge, forceConsent }) =>
        `https://auth.example/?state=${state}&cc=${codeChallenge}&consent=${forceConsent}`,
      exchangeCode: async () => ({ tokens, identity }),
    },
    users,
    sessions,
    tokens: new FakeTokens(),
    cipher: { encrypt: async (value: string) => `enc(${value})` },
    sessionTtlSeconds: 60,
  })
  return { service, saved }
}

describe('AuthService', () => {
  it('beginLogin menghasilkan state & PKCE challenge', async () => {
    const { service } = setup()
    const { authorizationUrl, transaction } = await service.beginLogin(false)
    expect(authorizationUrl).toContain(`state=${transaction.state}`)
    expect(authorizationUrl).not.toContain(transaction.codeVerifier)
  })

  it('login sukses menyimpan refresh token terenkripsi dan membuat sesi', async () => {
    const { service, saved } = setup()
    const result = await service.completeLogin({ code: 'c', state: 's', transaction: { state: 's', codeVerifier: 'v' } })
    expect(result).toEqual({ kind: 'success', sessionToken: 'session-token' })
    expect(saved).toEqual([{ refresh: 'enc(rt)' }])
  })

  it('menolak state yang tidak cocok (CSRF)', async () => {
    const { service } = setup()
    await expect(
      service.completeLogin({ code: 'c', state: 'attacker', transaction: { state: 's', codeVerifier: 'v' } }),
    ).rejects.toThrow(ValidationError)
  })

  it('menolak bila izin Drive tidak diberikan', async () => {
    const { service } = setup({ scopes: ['openid', 'email'] })
    await expect(
      service.completeLogin({ code: 'c', state: 's', transaction: { state: 's', codeVerifier: 'v' } }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('meminta consent ulang bila tidak ada refresh token sama sekali', async () => {
    const { service } = setup({ refreshToken: null, storedToken: null })
    const result = await service.completeLogin({ code: 'c', state: 's', transaction: { state: 's', codeVerifier: 'v' } })
    expect(result).toEqual({ kind: 'consent_required' })
  })

  it('tidak meminta consent bila refresh token lama masih tersimpan', async () => {
    const { service, saved } = setup({ refreshToken: null, storedToken: 'enc(old)' })
    const result = await service.completeLogin({ code: 'c', state: 's', transaction: { state: 's', codeVerifier: 'v' } })
    expect(result.kind).toBe('success')
    expect(saved).toEqual([{ refresh: null }])
  })
})
