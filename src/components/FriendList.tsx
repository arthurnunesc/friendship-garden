import { useState } from 'react'
import type { Friend } from '../friends/Friend'
import type { LogInteractionInput } from '../friends/Friend'
import './FriendList.css'

interface FriendListProps {
  friends: Friend[]
  onWater: (friendId: string, input?: LogInteractionInput) => void
}

const INTERACTION_TYPES = ['message', 'call', 'in-person'] as const

function FriendList({ friends, onWater }: FriendListProps) {
  return (
    <ul className="friend-list">
      {friends.map((friend) => (
        <FriendCard key={friend.id} friend={friend} onWater={onWater} />
      ))}
    </ul>
  )
}

function FriendCard({
  friend,
  onWater,
}: {
  friend: Friend
  onWater: (friendId: string, input?: LogInteractionInput) => void
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('')
  const [note, setNote] = useState('')

  const handleWater = () => {
    onWater(friend.id)
  }

  const handleSave = () => {
    const input: LogInteractionInput = {}
    if (type) input.type = type as LogInteractionInput['type']
    if (note.trim()) input.note = note.trim()
    onWater(friend.id, input)
    setOpen(false)
    setType('')
    setNote('')
  }

  return (
    <li className="friend-card-wrapper">
      <div className="friend-card">
        <span className="friend-plant">🪴</span>
        <span className="friend-name">{friend.name}</span>
        <button
          className="friend-expand-button"
          type="button"
          onClick={() => setOpen((p) => !p)}
          aria-label={`Details for ${friend.name}`}
        >
          {open ? '▲' : '▼'}
        </button>
        <button
          className="friend-water-button"
          type="button"
          onClick={handleWater}
          aria-label={`Water ${friend.name}`}
        >
          💧
        </button>
      </div>
      {open && (
        <div className="water-details">
          <select
            className="water-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Interaction type"
          >
            <option value="">Any interaction</option>
            {INTERACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'message' ? 'Message' : t === 'call' ? 'Call' : 'In person'}
              </option>
            ))}
          </select>
          <input
            className="water-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Quick note (optional)"
            aria-label="Note"
            autoFocus
          />
          <div className="water-actions">
            <button className="water-save" type="button" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

export default FriendList
