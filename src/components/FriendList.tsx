import { useState } from 'react'
import type { Friend, Interaction, LogInteractionInput, WateringState } from '../friends/Friend'
import { deriveWateringState, sortFriendsByUrgency, hasUpcomingBirthday } from '../friends/Friend'
import './FriendList.css'

interface FriendListProps {
  friends: Friend[]
  onWater: (friendId: string, input?: LogInteractionInput) => void
}

const INTERACTION_TYPES = ['message', 'call', 'in-person'] as const
const TYPE_LABELS: Record<string, string> = {
  message: 'Message',
  call: 'Call',
  'in-person': 'In person',
}

function wateringIcon(state: WateringState): string {
  switch (state) {
    case 'watered':
      return '🪴'
    case 'nearing':
      return '🌿'
    case 'dry':
      return '💧'
  }
}

function daysSinceContact(lastInteractionAt: string | undefined, now: Date): number | null {
  if (!lastInteractionAt) return null
  return Math.floor((now.getTime() - new Date(lastInteractionAt).getTime()) / 86400000)
}

function FriendList({ friends, onWater }: FriendListProps) {
  const now = new Date()
  const sorted = sortFriendsByUrgency(friends, now)

  const firstDryIndex = sorted.findIndex(
    (f) => deriveWateringState(f, now) === 'dry',
  )

  return (
    <div className="friend-list">
      {sorted.map((friend, index) => (
        <div key={friend.id}>
          {index === 0 && firstDryIndex === 0 && (
            <p className="friend-urgency-header">Needs attention</p>
          )}
          {index === firstDryIndex && firstDryIndex > 0 && (
            <p className="friend-urgency-header">Needs attention</p>
          )}
          <FriendCard
            friend={friend}
            onWater={onWater}
            wateringState={deriveWateringState(friend, now)}
            hasBirthday={hasUpcomingBirthday(friend, now)}
          />
        </div>
      ))}
    </div>
  )
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function InteractionHistory({ interactions }: { interactions: Interaction[] }) {
  if (interactions.length === 0) return null

  const sorted = [...interactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  return (
    <div className="history">
      <h3 className="history-title">Recent chats</h3>
      <ul className="history-list">
        {sorted.map((int) => (
          <li key={int.id} className="history-item">
            <div className="history-header">
              <span className="history-date">{formatRelativeDate(int.date)}</span>
              {int.type && (
                <span className="history-type">{TYPE_LABELS[int.type]}</span>
              )}
            </div>
            {int.note && <p className="history-note">{int.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FriendCard({
  friend,
  onWater,
  wateringState,
  hasBirthday,
}: {
  friend: Friend
  onWater: (friendId: string, input?: LogInteractionInput) => void
  wateringState: WateringState
  hasBirthday: boolean
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

  const days = daysSinceContact(friend.lastInteractionAt, new Date())

  return (
    <div className="friend-card-wrapper">
      <div className={`friend-card friend-card--${wateringState}`}>
        <span className="friend-plant">{wateringIcon(wateringState)}</span>
        <div className="friend-info">
          <span className="friend-name">
            {friend.name}
            {hasBirthday && <span className="friend-birthday">🎂</span>}
          </span>
          {days !== null && (
            <span className="friend-watering">{days}d</span>
          )}
        </div>
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
          <h3 className="water-title">Log a chat</h3>
          <select
            className="water-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Interaction type"
          >
            <option value="">Any interaction</option>
            {INTERACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
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
          <InteractionHistory interactions={friend.interactions} />
        </div>
      )}
    </div>
  )
}

export default FriendList
