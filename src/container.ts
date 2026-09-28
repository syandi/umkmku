import { loadConfig, type AppConfig, type ConfigSource } from './config'
import { EdgeCatalogCache } from './infra/catalog-cache'
import { D1SessionRepository } from './infra/db/session-repository'
import { D1StoreRepository } from './infra/db/store-repository'
import { D1UserRepository } from './infra/db/user-repository'
import { GoogleAccessTokenProvider } from './infra/google/access-token-provider'
import { GoogleOAuthClient } from './infra/google/oauth'
import { GoogleSheetsGateway } from './infra/google/sheets'
import { TokenCipher } from './lib/crypto'
import { AuthService } from './services/auth-service'
import { StoreService } from './services/store-service'

export interface WorkerBindings extends ConfigSource {
  readonly DB: D1Database
}

export interface AppContainer {
  readonly config: AppConfig
  readonly auth: AuthService
  readonly stores: StoreService
}

/**
 * Composition root: satu-satunya tempat implementasi konkret dirangkai.
 * Lapisan lain hanya menerima dependensi lewat constructor.
 */
export function createContainer(bindings: WorkerBindings): AppContainer {
  const config = loadConfig(bindings)

  const cipher = new TokenCipher(config.tokenEncryptionKey)
  const oauth = new GoogleOAuthClient(config.google)
  const users = new D1UserRepository(bindings.DB)
  const sessions = new D1SessionRepository(bindings.DB)
  const tokens = new GoogleAccessTokenProvider(oauth, users, cipher)

  return {
    config,
    auth: new AuthService({ oauth, users, sessions, tokens, cipher, sessionTtlSeconds: config.sessionTtlSeconds }),
    stores: new StoreService({
      stores: new D1StoreRepository(bindings.DB),
      sheets: new GoogleSheetsGateway(),
      tokens,
      catalogCache: new EdgeCatalogCache(config.catalogCacheTtlSeconds),
    }),
  }
}
