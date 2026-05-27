import { useState, useRef, useEffect } from 'react'
import type { Friend, Interaction, LogInteractionInput, WateringState, EditFriendInput } from '../friends/Friend'
import { deriveWateringState, sortFriendsByUrgency, hasUpcomingBirthday, DEFAULT_CADENCE_DAYS } from '../friends/Friend'
import './FriendList.css'

interface FriendListProps {
  friends: Friend[]
  onWater: (friendId: string, input?: LogInteractionInput) => void
  onEdit: (friendId: string, input: EditFriendInput) => void
  onRemove: (friendId: string) => void
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
      return '🥀'
  }
}

function daysSinceContact(lastInteractionAt: string | undefined, now: Date): number | null {
  if (!lastInteractionAt) return null
  return Math.floor((now.getTime() - new Date(lastInteractionAt).getTime()) / 86400000)
}

function FriendList({ friends, onWater, onEdit, onRemove }: FriendListProps) {
  const now = new Date()
  const sorted = sortFriendsByUrgency(friends, now)

  const firstDryIndex = sorted.findIndex(
    (f) => deriveWateringState(f, now) === 'dry',
  )

  return (
    <div className="friend-list">
      {sorted.map((friend, index) => {
          const state = deriveWateringState(friend, now)
          return (
        <div key={`${friend.id}-${state}`}>
          {index === 0 && firstDryIndex === 0 && (
            <p className="friend-urgency-header">Needs attention</p>
          )}
          {index === firstDryIndex && firstDryIndex > 0 && (
            <p className="friend-urgency-header">Needs attention</p>
          )}
          <FriendCard
            friend={friend}
            onWater={onWater}
            onEdit={onEdit}
            onRemove={onRemove}
            wateringState={state}
            hasBirthday={hasUpcomingBirthday(friend, now)}
          />
        </div>
        )
      })}
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
  onEdit,
  onRemove,
  wateringState,
  hasBirthday,
}: {
  friend: Friend
  onWater: (friendId: string, input?: LogInteractionInput) => void
  onEdit: (friendId: string, input: EditFriendInput) => void
  onRemove: (friendId: string) => void
  wateringState: WateringState
  hasBirthday: boolean
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [showWaterPopup, setShowWaterPopup] = useState(false)
  const [editName, setEditName] = useState(friend.name)
  const [editBirthday, setEditBirthday] = useState(friend.birthday ?? '')
  const [editCadence, setEditCadence] = useState(String(friend.cadenceDays))
  const popupRef = useRef<HTMLDivElement>(null)
  const waterButtonRef = useRef<HTMLButtonElement>(null)
  const expandButtonRef = useRef<HTMLButtonElement>(null)
  const popupActiveRef = useRef(false)

  useEffect(() => {
    popupActiveRef.current = showWaterPopup
  }, [showWaterPopup])

  const handleWaterClick = () => {
    if (popupActiveRef.current) {
      onWater(friend.id)
      popupActiveRef.current = false
      setShowWaterPopup(false)
      return
    }

    popupActiveRef.current = true
    setOpen(false)
    setType('')
    setNote('')
    setShowWaterPopup(true)
  }

  const handleSaveChat = () => {
    const input: LogInteractionInput = {}
    if (type) input.type = type as LogInteractionInput['type']
    if (note.trim()) input.note = note.trim()
    onWater(friend.id, input)
    setShowWaterPopup(false)
    popupActiveRef.current = false
    setType('')
    setNote('')
  }

  useEffect(() => {
    if (!showWaterPopup) return
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        waterButtonRef.current &&
        !waterButtonRef.current.contains(e.target as Node) &&
        expandButtonRef.current &&
        !expandButtonRef.current.contains(e.target as Node)
      ) {
        setShowWaterPopup(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showWaterPopup])

  useEffect(() => {
    if (!showWaterPopup) return
    const handler = () => setShowWaterPopup(false)
    document.addEventListener('scroll', handler, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', handler, { capture: true })
  }, [showWaterPopup])

  const handleSaveEdit = () => {
    const trimmed = editName.trim()
    if (trimmed.length === 0) return
    onEdit(friend.id, {
      name: trimmed,
      birthday: editBirthday || undefined,
      cadenceDays: Number(editCadence) || DEFAULT_CADENCE_DAYS,
    })
    setEditing(false)
  }

  const handleCancelEdit = () => {
    setEditName(friend.name)
    setEditBirthday(friend.birthday ?? '')
    setEditCadence(String(friend.cadenceDays))
    setEditing(false)
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
          ref={expandButtonRef}
          onClick={() => {
            setShowWaterPopup(false)
            setOpen((p) => !p)
          }}
          aria-label={`Details for ${friend.name}`}
        >
          {open ? '▲' : '▼'}
        </button>
        <button
          className="friend-water-button"
          type="button"
          ref={waterButtonRef}
          onClick={handleWaterClick}
          aria-label={`Water ${friend.name}`}
        >
          💧
        </button>
      </div>
      {open && (
        <div className="water-details">
          <InteractionHistory interactions={friend.interactions} />

          <div className="edit-section">
            {!editing ? (
              <button
                className="edit-start-button"
                type="button"
                onClick={() => {
                  setEditName(friend.name)
                  setEditBirthday(friend.birthday ?? '')
                  setEditCadence(String(friend.cadenceDays))
                  setEditing(true)
                }}
              >
                Edit name, birthday, or cadence
              </button>
            ) : (
              <div className="edit-form">
                <label className="add-friend-optional-label" htmlFor={`edit-name-${friend.id}`}>
                  Name
                </label>
                <input
                  id={`edit-name-${friend.id}`}
                  className="add-friend-input water-note"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <label className="add-friend-optional-label" htmlFor={`edit-bday-${friend.id}`}>
                  Birthday
                </label>
                <input
                  id={`edit-bday-${friend.id}`}
                  className="add-friend-input water-note"
                  type="date"
                  value={editBirthday}
                  onChange={(e) => setEditBirthday(e.target.value)}
                />
                <label className="add-friend-optional-label" htmlFor={`edit-cadence-${friend.id}`}>
                  Cadence
                </label>
                <select
                  id={`edit-cadence-${friend.id}`}
                  className="add-friend-input water-note"
                  value={editCadence}
                  onChange={(e) => setEditCadence(e.target.value)}
                  style={{ appearance: 'auto' as React.CSSProperties['appearance'] }}
                >
                  <option value="7">1 week</option>
                  <option value="14">2 weeks</option>
                  <option value="21">3 weeks</option>
                  <option value="30">1 month</option>
                  <option value="60">2 months</option>
                </select>
                <div className="water-actions">
                  <button
                    className="water-save"
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={editName.trim().length === 0}
                  >
                    Save
                  </button>
                  <button
                    className="water-cancel"
                    type="button"
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="remove-section">
            {!confirmRemove ? (
              <button
                className="remove-start-button"
                type="button"
                onClick={() => setConfirmRemove(true)}
              >
                Remove from garden
              </button>
            ) : (
              <div className="remove-confirm">
                <p className="remove-confirm-text">
                  Remove {friend.name} and their conversation history?
                </p>
                <div className="water-actions">
                  <button
                    className="remove-confirm-button"
                    type="button"
                    onClick={() => onRemove(friend.id)}
                  >
                    Yes, remove
                  </button>
                  <button
                    className="water-cancel"
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showWaterPopup && (
        <div className="water-popup" ref={popupRef} data-testid="water-popup">
          <div className="water-type-buttons">
            <button
              className={`water-type-button${type === '' ? ' water-type-button--active' : ''}`}
              onClick={() => setType('')}
            >
              Any
            </button>
            {INTERACTION_TYPES.map((t) => (
              <button
                key={t}
                className={`water-type-button${type === t ? ' water-type-button--active' : ''}`}
                onClick={() => setType(type === t ? '' : t)}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
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
            <button className="water-save" type="button" onClick={handleSaveChat}>
              Save
            </button>
            <button
              className="water-cancel"
              type="button"
              onClick={() => setShowWaterPopup(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default FriendList
