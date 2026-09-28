export interface User {
  /** Google "sub" */
  readonly id: string
  readonly email: string
  readonly name: string
  readonly picture: string | null
}

/** Identitas terverifikasi yang diperoleh dari penyedia login (Google). */
export interface GoogleIdentity {
  readonly sub: string
  readonly email: string
  readonly name: string
  readonly picture: string | null
}
