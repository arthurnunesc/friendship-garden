import { useState, useCallback, useRef, type FC } from 'react'
import './App.css'
import { createFriend, logInteraction, editFriend, exportGarden, validateAndImportGarden, type Friend, type LogInteractionInput, type EditFriendInput } from './friends/Friend'
import { localStorageStore } from './friends/storage'
import type { GardenStorage } from './friends/storage'
import AddFriendForm, { type AddFriendData } from './components/AddFriendForm'
import FriendList from './components/FriendList'

function useGardenStore(storage: GardenStorage) {
  const [friends, setFriends] = useState<Friend[]>(() => storage.loadFriends())

  const addFriend = useCallback(
    (data: AddFriendData) => {
      setFriends((prev) => {
        const updated = [...prev, createFriend(data)]
        storage.saveFriends(updated)
        return updated
      })
    },
    [storage],
  )

  const waterFriend = useCallback(
    (friendId: string, input?: LogInteractionInput) => {
      setFriends((prev) => {
        const updated = prev.map((f) =>
          f.id === friendId ? logInteraction(f, input) : f,
        )
        storage.saveFriends(updated)
        return updated
      })
    },
    [storage],
  )

  const updateFriend = useCallback(
    (friendId: string, input: EditFriendInput) => {
      setFriends((prev) => {
        const updated = prev.map((f) =>
          f.id === friendId ? editFriend(f, input) : f,
        )
        storage.saveFriends(updated)
        return updated
      })
    },
    [storage],
  )

  const removeFriend = useCallback(
    (friendId: string) => {
      setFriends((prev) => {
        const updated = prev.filter((f) => f.id !== friendId)
        storage.saveFriends(updated)
        return updated
      })
    },
    [storage],
  )

  return { friends, addFriend, waterFriend, updateFriend, removeFriend }
}

function EmptyGarden({ onAdd }: { onAdd: () => void }) {
  return (
    <>
      <p className="garden-subtitle">
        Your garden starts empty — you choose who belongs here.
      </p>
      <div className="garden-use">
        <p>Everything stays on your device.</p>
        <p>Private by default.</p>
      </div>
      <button className="add-friend-button" type="button" onClick={onAdd}>
        Add your first friend
      </button>
    </>
  )
}

interface PopulatedGardenProps {
  friends: Friend[]
  onAdd: () => void
  onWater: (friendId: string, input?: LogInteractionInput) => void
  onEdit: (friendId: string, input: EditFriendInput) => void
  onRemove: (friendId: string) => void
}

const PopulatedGarden: FC<PopulatedGardenProps> = ({ friends, onAdd, onWater, onEdit, onRemove }) => (
  <>
    <h2 className="garden-label">
      Your garden ({friends.length})
    </h2>
    <div className="garden-scroll">
      <FriendList friends={friends} onWater={onWater} onEdit={onEdit} onRemove={onRemove} />
    </div>
    <button className="add-friend-button" type="button" onClick={onAdd}>
      Add a friend
    </button>
  </>
)

interface GardenViewProps {
  friends: Friend[]
  isAdding: boolean
  onStartAdd: () => void
  onCancelAdd: () => void
  onAddFriend: (data: AddFriendData) => void
  onWater: (friendId: string, input?: LogInteractionInput) => void
  onEdit: (friendId: string, input: EditFriendInput) => void
  onRemove: (friendId: string) => void
}

function GardenView({
  friends,
  isAdding,
  onStartAdd,
  onCancelAdd,
  onAddFriend,
  onWater,
  onEdit,
  onRemove,
}: GardenViewProps) {
  if (isAdding) {
    return <AddFriendForm onSubmit={onAddFriend} onCancel={onCancelAdd} />
  }

  if (friends.length === 0) {
    return <EmptyGarden onAdd={onStartAdd} />
  }

  return <PopulatedGarden friends={friends} onAdd={onStartAdd} onWater={onWater} onEdit={onEdit} onRemove={onRemove} />
}

interface AppProps {
  storage?: GardenStorage
  onImportSuccess?: () => void
}

function App({ storage = localStorageStore, onImportSuccess }: AppProps) {
  const { friends, addFriend, waterFriend, updateFriend, removeFriend } = useGardenStore(storage)
  const [isAdding, setIsAdding] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackType, setFeedbackType] = useState<'success' | 'error'>('success')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback(msg)
    setFeedbackType(type)
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleAddFriend = (data: AddFriendData) => {
    addFriend(data)
    setIsAdding(false)
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
    showFeedback('Garden exported successfully.', 'success')
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
          storage.saveFriends(result.friends)
          if (onImportSuccess) {
            onImportSuccess()
          } else {
            showFeedback('Garden imported successfully.', 'success')
            // Delay reload to let the user see the success message
            setTimeout(() => window.location.reload(), 200)
          }
      } catch {
        showFeedback('Invalid JSON file. Please check the file format.', 'error')
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
        friends={friends}
        isAdding={isAdding}
        onStartAdd={() => setIsAdding(true)}
        onCancelAdd={() => setIsAdding(false)}
        onAddFriend={handleAddFriend}
        onWater={waterFriend}
        onEdit={updateFriend}
        onRemove={removeFriend}
      />
      <div className="garden-tools">
        <button className="tool-button" type="button" onClick={handleExport}>
          Export
        </button>
        <button
          className="tool-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Import
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
      {feedback && (
        <p
          className={`feedback feedback--${feedbackType}`}
          role="status"
        >
          {feedback}
        </p>
      )}
    </main>
  )
}

export default App
