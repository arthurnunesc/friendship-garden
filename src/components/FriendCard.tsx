import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  INTERACTION_TYPES,
  type EditFriendInput,
  type Friend,
  type LogInteractionInput,
  type WateringState,
} from '../friends/Friend'
import { formatRelativeDate } from '../friends/date'
import InteractionHistory from './InteractionHistory'
import { TYPE_LABELS } from './interactionDisplay'

interface FriendCardProps {
  friend: Friend
  onWater: (friendId: string, input?: LogInteractionInput) => void
  onEdit: (friendId: string, input: EditFriendInput) => void
  onRemove: (friendId: string) => void
  onRemoveInteraction: (friendId: string, interactionId: string) => void
  wateringState: WateringState
  hasBirthday: boolean
  open: boolean
  showWaterPopup: boolean
  onToggleOpen: () => void
  onToggleWater: () => void
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

function FriendCard({
  friend,
  onWater,
  onEdit,
  onRemove,
  onRemoveInteraction,
  wateringState,
  hasBirthday,
  open,
  showWaterPopup,
  onToggleOpen,
  onToggleWater,
}: FriendCardProps) {
  const [type, setType] = useState<LogInteractionInput['type'] | ''>('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [watered, setWatered] = useState(false)
  const wateredTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [editName, setEditName] = useState(friend.name)
  const [editBirthday, setEditBirthday] = useState(friend.birthday ?? '')
  const [editCadence, setEditCadence] = useState(String(friend.cadenceDays))
  const popupRef = useRef<HTMLDivElement>(null)
  const waterButtonRef = useRef<HTMLButtonElement>(null)
  const expandButtonRef = useRef<HTMLButtonElement>(null)

  const showWateredToast = () => {
    setWatered(true)
    clearTimeout(wateredTimer.current)
    wateredTimer.current = setTimeout(() => setWatered(false), 2000)
  }

  const handleWaterClick = () => {
    if (showWaterPopup) {
      onWater(friend.id)
      onToggleWater()
      showWateredToast()
      return
    }

    setType('')
    setNote('')
    onToggleWater()
  }

  const handleSaveChat = () => {
    const input: LogInteractionInput = {}
    if (type) input.type = type
    if (note.trim()) input.note = note.trim()
    onWater(friend.id, input)
    onToggleWater()
    setType('')
    setNote('')
    showWateredToast()
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
        onToggleWater()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showWaterPopup])

  useEffect(
    () => () => clearTimeout(wateredTimer.current),
    [],
  )

  const handleSaveEdit = () => {
    const trimmed = editName.trim()
    if (trimmed.length === 0) return
    onEdit(friend.id, {
      name: trimmed,
      birthday: editBirthday || undefined,
      cadenceDays: Number(editCadence) || undefined,
    })
    setEditing(false)
  }

  const handleCancelEdit = () => {
    setEditName(friend.name)
    setEditBirthday(friend.birthday ?? '')
    setEditCadence(String(friend.cadenceDays))
    setEditing(false)
  }

  const lastChatLabel = formatRelativeDate(friend.lastInteractionAt)

  return (
    <div className="friend-card-wrapper">
      <div className={`friend-card friend-card--${wateringState}`}>
        <span className="friend-plant">{wateringIcon(wateringState)}</span>
        <div className="friend-info">
          <span className="friend-name">
            {friend.name}
            {hasBirthday && <span className="friend-birthday">🎂</span>}
          </span>
          <span className={`friend-watering${wateringState === 'dry' ? ' friend-watering--dry' : ''}`}>
            {lastChatLabel}
          </span>
        </div>
        <button
          className="friend-expand-button"
          type="button"
          ref={expandButtonRef}
          onClick={onToggleOpen}
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
          💦
        </button>
      </div>
      {open && (
        <div className="water-details water-panel">
          <InteractionHistory
            interactions={friend.interactions}
            onRemoveInteraction={(interactionId) => onRemoveInteraction(friend.id, interactionId)}
          />

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
                Edit details
              </button>
            ) : (
              <div className="edit-form">
                <label className="add-friend-optional-label" htmlFor={`edit-name-${friend.id}`}>
                  name
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
                  birthday
                </label>
                <input
                  id={`edit-bday-${friend.id}`}
                  className="add-friend-input water-note"
                  type="date"
                  value={editBirthday}
                  onChange={(e) => setEditBirthday(e.target.value)}
                />
                <label className="add-friend-optional-label" htmlFor={`edit-cadence-${friend.id}`}>
                  cadence
                </label>
                <select
                  id={`edit-cadence-${friend.id}`}
                  className="add-friend-input water-note"
                  value={editCadence}
                  onChange={(e) => setEditCadence(e.target.value)}
                  style={{ appearance: 'auto' as CSSProperties['appearance'] }}
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
                    save
                  </button>
                  <button
                    className="water-cancel"
                    type="button"
                    onClick={handleCancelEdit}
                  >
                    cancel
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
                remove from garden
              </button>
            ) : (
              <div className="remove-confirm">
                <p className="remove-confirm-text">
                  Remove {friend.name} and their history?
                </p>
                <div className="water-actions">
                  <button
                    className="remove-confirm-button"
                    type="button"
                    onClick={() => onRemove(friend.id)}
                  >
                    yes, remove
                  </button>
                  <button
                    className="water-cancel"
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                  >
                    cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showWaterPopup && (
        <div className="water-popup water-panel" ref={popupRef} data-testid="water-popup">
          <div className="water-type-buttons">
            <button
              className={`water-type-button${type === '' ? ' water-type-button--active' : ''}`}
              type="button"
              onClick={() => setType('')}
            >
              any
            </button>
            {INTERACTION_TYPES.map((t) => (
              <button
                key={t}
                className={`water-type-button${type === t ? ' water-type-button--active' : ''}`}
                type="button"
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
            placeholder="quick note (optional)"
            aria-label="Note"
            autoFocus
          />
          <div className="water-actions">
            <button className="water-save" type="button" onClick={handleSaveChat}>
              save
            </button>
            <button
              className="water-cancel"
              type="button"
              onClick={onToggleWater}
            >
              cancel
            </button>
          </div>
        </div>
      )}
      {watered && <div className="watered-toast">chat added!</div>}
    </div>
  )
}

export default FriendCard
