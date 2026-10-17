import { useEffect, useState } from 'react'
import { localStorageStore, type GardenStorage } from '../friends/storage'
import { createAccountClient } from './accountClient'
import { createGardenAccount, type GardenAccount } from './gardenAccount'

export function useBrowserAccount(storage: GardenStorage, injected?: GardenAccount) {
  const [account, setAccount] = useState<GardenAccount | null>(injected ?? null)
  const [issue, setIssue] = useState<string | null>(null)
  useEffect(() => {
    if (injected || storage !== localStorageStore) {
      setAccount(injected ?? null)
      setIssue(null)
      return
    }
    if (!navigator.locks) {
      setIssue('Account sync needs a browser with secure storage locking. Your local garden still works.')
      return
    }
    let alive = true
    let owned: GardenAccount | null = null
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    // Hold one writer lease for this origin. A second tab never edits an old offline envelope.
    void Promise.resolve().then(async () => {
      if (!alive) return
      await navigator.locks.request('friendship-garden:account-cache', { ifAvailable: true }, async (lock) => {
        if (!alive) return
        if (!lock) {
          setIssue('Account sync is open in another tab. Close that tab and reload to connect here. Your local garden still works.')
          return
        }
        try {
          owned = createGardenAccount({
            guest: storage,
            client: createAccountClient(window.location.origin),
            persistence: {
              getItem: (key) => localStorage.getItem(key),
              setItem(key, value) {
                if (!alive) throw new Error('The account storage lease has ended.')
                localStorage.setItem(key, value)
              },
            },
          })
          setAccount(owned)
          await held
        } catch {
          if (alive) setIssue('Account sync storage is unavailable. Your local garden still works.')
        }
      })
    }).catch(() => { if (alive) setIssue('Account sync storage is unavailable. Your local garden still works.') })
    return () => {
      alive = false
      owned?.pause()
      release()
    }
  }, [storage, injected])
  return { account, issue }
}
