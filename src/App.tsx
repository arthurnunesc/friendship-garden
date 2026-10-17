import { useEffect, useState, useRef, useSyncExternalStore } from 'react'
import './App.css'
import { exportGarden, validateAndImportGarden, type Friend, type LogInteractionInput, type EditFriendInput } from './friends/Friend'
import { localStorageStore } from './friends/storage'
import type { GardenStorage } from './friends/storage'
import { useGardenStore } from './friends/useGardenStore'
import AddFriendForm, { type AddFriendData } from './components/AddFriendForm'
import FriendList from './components/FriendList'
import AccountSection from './components/AccountSection'
import type { GardenAccount } from './sync/gardenAccount'
import { useBrowserAccount } from './sync/useBrowserAccount'

const subscribeNothing = () => () => {}
const noAccount = () => null

function EmptyGarden({ onAdd, accountGarden }: { onAdd: () => void, accountGarden: boolean }) {
  return (
    <>
      <p className="garden-subtitle">
        your garden starts empty, you choose who belongs here.
      </p>
      <div className="garden-use">
        <p>{accountGarden ? 'this is your account garden.' : 'this garden stays on your device.'}</p>
        <p>private by default.</p>
      </div>
      <button className="add-friend-button" type="button" onClick={onAdd}>
        add your first friend
      </button>
    </>
  )
}

interface PopulatedGardenProps {
  friends: Friend[]
  onAdd: () => void
  onWater: (friendId: string, input?: LogInteractionInput) => boolean | void
  onEdit: (friendId: string, input: EditFriendInput) => boolean | void
  onRemove: (friendId: string) => void
  onRemoveInteraction: (friendId: string, interactionId: string) => void
}

function PopulatedGarden({ friends, onAdd, onWater, onEdit, onRemove, onRemoveInteraction }: PopulatedGardenProps) {
  return (
    <>
      <h2 className="garden-label">
        your garden has {friends.length} {friends.length === 1 ? 'plant' : 'plants'}
      </h2>
      <div className="garden-scroll">
        <FriendList friends={friends} onWater={onWater} onEdit={onEdit} onRemove={onRemove} onRemoveInteraction={onRemoveInteraction} />
      </div>
      <button className="add-friend-button" type="button" onClick={onAdd}>
        add a friend
      </button>
    </>
  )
}

interface GardenViewProps {
  accountGarden: boolean
  friends: Friend[]
  isAdding: boolean
  onStartAdd: () => void
  onCancelAdd: () => void
  onAddFriend: (data: AddFriendData) => boolean | void
  onWater: (friendId: string, input?: LogInteractionInput) => boolean | void
  onEdit: (friendId: string, input: EditFriendInput) => boolean | void
  onRemove: (friendId: string) => void
  onRemoveInteraction: (friendId: string, interactionId: string) => void
}

function GardenView({
  accountGarden,
  friends,
  isAdding,
  onStartAdd,
  onCancelAdd,
  onAddFriend,
  onWater,
  onEdit,
  onRemove,
  onRemoveInteraction,
}: GardenViewProps) {
  if (isAdding) {
    return <AddFriendForm onSubmit={onAddFriend} onCancel={onCancelAdd} />
  }

  if (friends.length === 0) {
    return <EmptyGarden onAdd={onStartAdd} accountGarden={accountGarden} />
  }

  return <PopulatedGarden friends={friends} onAdd={onStartAdd} onWater={onWater} onEdit={onEdit} onRemove={onRemove} onRemoveInteraction={onRemoveInteraction} />
}

interface AppProps {
  storage?: GardenStorage
  account?: GardenAccount
}

function App({ storage = localStorageStore, account: injectedAccount }: AppProps) {
  const { account, issue: accountIssue } = useBrowserAccount(storage, injectedAccount)
  const accountState = useSyncExternalStore(account?.subscribe ?? subscribeNothing, account?.getSnapshot ?? noAccount, noAccount)
  const activeStorage = accountState?.storage ?? storage
  const { friends, addFriend, waterFriend, updateFriend, removeFriend, removeInteraction, replaceGarden, error: saveError } = useGardenStore(activeStorage)
  const [isAdding, setIsAdding] = useState(false)
  const signInFailed = new URLSearchParams(window.location.search).has('sign-in-error')
  const [feedback, setFeedback] = useState<string | null>(signInFailed
    ? 'Sign-in did not finish. Open account & sync and try again. Your local garden is unchanged.' : null)
  const [feedbackType, setFeedbackType] = useState<'success' | 'error'>(signInFailed ? 'error' : 'success')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!account) return
    const refresh = () => { void account.refresh() }
    refresh()
    window.addEventListener('online', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('focus', refresh)
      account.pause()
    }
  }, [account])

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback(msg)
    setFeedbackType(type)
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleAddFriend = (data: AddFriendData) => {
    const saved = addFriend(data)
    if (saved) setIsAdding(false)
    return saved
  }

  const handleExport = () => {
    const payload = exportGarden(friends)
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `friendship-garden-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showFeedback('garden exported.', 'success')
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string)
        const result = validateAndImportGarden(json)
        if (!result.success) {
          showFeedback(result.error, 'error')
          return
        }
        if (!replaceGarden(result.friends)) return
        showFeedback('garden imported.', 'success')
      } catch {
        showFeedback('invalid json file.', 'error')
      }
    }
    reader.readAsText(file)

    // Reset so the same file can be re-imported
    e.target.value = ''
  }

  return (
    <main className={`garden${friends.length > 0 && !isAdding ? ' garden--populated' : ''}`}>
      <div className="garden-icon">🌱</div>
      <h1 className="garden-title">Friendship Garden</h1>
      <GardenView
        key={accountState?.viewAccount?.id ?? 'local-garden'}
        accountGarden={Boolean(accountState?.viewAccount)}
        friends={friends}
        isAdding={isAdding}
        onStartAdd={() => setIsAdding(true)}
        onCancelAdd={() => setIsAdding(false)}
        onAddFriend={handleAddFriend}
        onWater={waterFriend}
        onEdit={updateFriend}
        onRemove={removeFriend}
        onRemoveInteraction={removeInteraction}
      />
      <div className="garden-tools">
        <button className="tool-button" type="button" onClick={handleExport}>
          export
        </button>
        <button
          className="tool-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFile}
          style={{ display: 'none' }}
          data-testid="import-input"
        />
      </div>
      {account && accountState && <AccountSection account={account} state={accountState} />}
      {accountIssue && <p className="feedback" role="status">{accountIssue}</p>}
      {saveError && <p role="status" className="feedback feedback--error">{saveError}</p>}
      {feedback && (
        <p
          className={`feedback feedback--${feedbackType}`}
          role="status"
        >
          {feedback}
        </p>
      )}
      <footer className="footer">
        <a
          href="https://arthurnun.es"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          made by arthur nunes
        </a>
      </footer>
    </main>
  )
}

export default App
