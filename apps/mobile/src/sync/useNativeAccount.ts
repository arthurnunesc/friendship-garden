import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppState, Linking } from 'react-native'
import { asyncStorageStore } from '../garden/storage'
import { nativeAccount } from './nativeAccount'

const noSubscribe = () => () => {}
const noSnapshot = () => null

export function useNativeAccount(runtime = nativeAccount) {
  const account = runtime?.account ?? null
  const state = useSyncExternalStore(account?.subscribe ?? noSubscribe, account?.getSnapshot ?? noSnapshot,
    account?.getSnapshot ?? noSnapshot)
  const [issue, setIssue] = useState<string | null>(null)
  useEffect(() => {
    if (!runtime) return
    let alive = true
    const handle = async (url: string, coldStart = false) => {
      try {
        const accepted = await runtime.auth.handleURL(url, coldStart)
        if (!alive || !accepted) return
        setIssue(null)
        await runtime.account.refresh()
      } catch {
        if (alive) setIssue('Could not finish sign-in. Request a new link on this device and try again.')
      }
    }
    const links = Linking.addEventListener('url', ({ url }) => { void handle(url) })
    const foreground = AppState.addEventListener('change', (status) => {
      if (status === 'active') void runtime.account.refresh()
    })
    // Hydrate the local garden independently; a slow auth check never blocks offline use.
    void runtime.account.initialize()
    void (async () => {
      try {
        const url = await Linking.getInitialURL()
        if (!alive) return
        if (url) await handle(url, true)
      } catch {
        if (alive) setIssue('Could not check the sign-in link. Please try again.')
      }
      if (alive) await runtime.account.refresh()
    })()
    return () => { alive = false; links.remove(); foreground.remove() }
  }, [runtime])
  return { account, state, storage: state?.storage ?? asyncStorageStore, issue }
}
