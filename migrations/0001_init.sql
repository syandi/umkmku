-- Pengguna = pemilik toko yang login dengan Google.
CREATE TABLE users (
  id                TEXT PRIMARY KEY,          -- Google "sub" (stabil, unik per akun)
  email             TEXT NOT NULL,
  name              TEXT NOT NULL DEFAULT '',
  picture           TEXT,
  refresh_token_enc TEXT,                      -- refresh token Google, terenkripsi AES-GCM
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- Satu pemilik = satu toko (MVP). Produk TIDAK disimpan di sini, melainkan di spreadsheet pemilik.
CREATE TABLE stores (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  whatsapp       TEXT NOT NULL,                -- format internasional tanpa "+", mis. 6281234567890
  spreadsheet_id TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- Sesi login. Yang disimpan hanya hash SHA-256 dari token di cookie.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
