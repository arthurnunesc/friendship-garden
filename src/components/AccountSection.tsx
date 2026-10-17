import { useState } from 'react'
import type { GardenAccount, GardenAccountState } from '../sync/gardenAccount'
import { AccountRequestError } from '../sync/accountClient'
import './AccountSection.css'

export default function AccountSection({ account, state }: { account: GardenAccount, state: GardenAccountState }) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const busy = sending || state.phase === 'checking' || state.phase === 'syncing'
  async function signIn(action: () => Promise<void>, success?: string) {
    setSending(true)
    setNotice(null)
    try { await action(); if (success) setNotice(success) }
    catch (error) { setNotice(error instanceof AccountRequestError ? error.message : 'Could not sign in. Please try again.') }
    finally { setSending(false) }
  }
  const viewingAccount = state.viewAccount?.id === state.user?.id && state.user !== null
  return (
    <details className="account-section">
      <summary>account &amp; sync{state.viewAccount ? ' · ' + (state.phase === 'ready' ? 'up to date' : 'saved on this device') : ''}</summary>
      <div className="account-content">
        {state.user ? <>
          <p>signed in as <span className="account-email">{state.user.email}</span></p>
          {viewingAccount ? <>
            <p>this account garden is saved here and synced across your devices. your original local garden is kept separately.</p>
            <button type="button" className="tool-button" disabled={busy} onClick={() => void account.sync()}>
              {state.phase === 'syncing' ? 'syncing…' : 'sync now'}
            </button>
          </> : <>
            <p>signing in has not uploaded your local garden.</p>
            <p>enable sync to store friendship details on our server. you can merge this device’s local garden, or use only the account garden. the original local copy stays here.</p>
            <div className="account-actions">
              <button type="button" className="tool-button" disabled={busy} onClick={() => void account.enable('import')}>merge local garden &amp; sync</button>
              <button type="button" className="tool-button" disabled={busy} onClick={() => void account.enable('account')}>use account garden only</button>
            </div>
            <p>not ready? close this section to keep using your local garden.</p>
          </>}
          <button type="button" className="tool-button" disabled={sending || state.phase === 'checking'} onClick={() => void account.signOut()}>sign out &amp; return to local garden</button>
        </> : <>
          {state.viewAccount && <p>showing the saved account copy for <span className="account-email">{state.viewAccount.email}</span>. sign in again to sync it.</p>}
          <p>your local garden stays on this device. sign in if you want to sync across devices; nothing is uploaded until you choose.</p>
          <button type="button" className="tool-button" disabled={busy} onClick={() => void signIn(() => account.client.google())}>continue with google</button>
          <form onSubmit={(event) => {
            event.preventDefault()
            void signIn(() => account.client.email(email.trim()), 'check your email for a sign-in link. it expires in five minutes.')
          }}>
            <label htmlFor="account-email">or sign in by email</label>
            <input id="account-email" type="email" autoComplete="email" required value={email}
              onChange={(event) => setEmail(event.target.value)} disabled={busy} />
            <button type="submit" className="tool-button" disabled={busy || !email.trim()}>{sending ? 'please wait…' : 'email a sign-in link'}</button>
          </form>
          <button type="button" className="tool-button" disabled={busy} onClick={() => void account.refresh()}>check sign-in / retry connection</button>
          {account.savedAccounts().map((user) => <button key={user.id} type="button" className="tool-button account-email"
            disabled={busy} onClick={() => account.openOffline(user.id)}>open saved garden: {user.email}</button>)}
        </>}
        {state.phase === 'checking' && <p role="status">checking your account…</p>}
        {state.error && <>
          <p role="status" className="account-error">{state.error}</p>
          {state.user && <button type="button" className="tool-button" disabled={busy} onClick={() => void account.refresh()}>reconnect / check sign-in</button>}
        </>}
        {notice && <p role="status">{notice}</p>}
      </div>
    </details>
  )
}
