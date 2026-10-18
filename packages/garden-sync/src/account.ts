import type { SyncSnapshot } from './snapshot.ts'

export interface AccountUser { id: string, email: string }
export interface AccountClient {
  session(): Promise<AccountUser | null>
  google(): Promise<void>
  email(email: string): Promise<void>
  signOut(): Promise<void>
  read(userId: string): Promise<SyncSnapshot>
  merge(userId: string, snapshot: SyncSnapshot): Promise<SyncSnapshot>
}

export class AccountRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, code?: string) {
    super(status === 401 ? 'Your session ended. Sign in again; your changes are kept on this device.'
      : code === 'ACCOUNT_CHANGED' ? 'Your account changed. Reconnect before syncing.'
      : status === 409 ? 'Two changes have the same sync version. Your local changes are kept.'
      : status === 413 ? 'This garden is too large to sync. Your changes are kept on this device.'
      : status === 429 ? 'Too many sign-in attempts. Try again in a minute.'
      : 'Cannot connect right now. Your garden is safe on this device. Try again.')
    this.status = status
    this.code = code
  }
}
