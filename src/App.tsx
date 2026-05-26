import { useState, useCallback, type FC } from 'react'
import './App.css'
import { createFriend, type Friend } from './friends/Friend'
import { localStorageStore } from './friends/storage'
import type { GardenStorage } from './friends/storage'
import AddFriendForm, { type AddFriendData } from './components/AddFriendForm'
import FriendList from './components/FriendList'

function useGardenStore(storage: GardenStorage) {
  const [friends, setFriends] = useState<Friend[]>(() => storage.loadFriends())

  const addFriend = useCallback(
    (data: AddFriendData) => {
      const updated = [...friends, createFriend(data)]
      setFriends(updated)
      storage.saveFriends(updated)
    },
    [friends, storage],
  )

  return { friends, addFriend }
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
}

const PopulatedGarden: FC<PopulatedGardenProps> = ({ friends, onAdd }) => (
  <>
    <h2 className="garden-label">
      Your garden ({friends.length})
    </h2>
    <div className="garden-scroll">
      <FriendList friends={friends} />
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
}

function GardenView({
  friends,
  isAdding,
  onStartAdd,
  onCancelAdd,
  onAddFriend,
}: GardenViewProps) {
  if (isAdding) {
    return <AddFriendForm onSubmit={onAddFriend} onCancel={onCancelAdd} />
  }

  if (friends.length === 0) {
    return <EmptyGarden onAdd={onStartAdd} />
  }

  return <PopulatedGarden friends={friends} onAdd={onStartAdd} />
}

interface AppProps {
  storage?: GardenStorage
}

function App({ storage = localStorageStore }: AppProps) {
  const { friends, addFriend } = useGardenStore(storage)
  const [isAdding, setIsAdding] = useState(false)

  const handleAddFriend = (data: AddFriendData) => {
    addFriend(data)
    setIsAdding(false)
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
      />
    </main>
  )
}

export default App
