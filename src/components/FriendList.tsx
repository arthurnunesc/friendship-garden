import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import type { Friend, Interaction, LogInteractionInput, WateringState, EditFriendInput } from '../friends/Friend'
import { deriveWateringState, sortFriendsByUrgency, hasUpcomingBirthday, DEFAULT_CADENCE_DAYS } from '../friends/Friend'
import './FriendList.css'

interface FriendListProps {
  friends: Friend[]
  onWater: (friendId: string, input?: LogInteractionInput) => void
  onEdit: (friendId: string, input: EditFriendInput) => void
  onRemove: (friendId: string) => void
  onRemoveInteraction: (friendId: string, interactionId: string) => void
}

const INTERACTION_TYPES = ['message', 'call', 'in-person'] as const
const TYPE_LABELS: Record<string, string> = {
  message: 'message',
  call: 'call',
  'in-person': 'in person',
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

function formatLastChatLabel(lastInteractionAt: string | undefined): string {
  if (!lastInteractionAt) return 'no chats recorded'

  const now = new Date()
  const diffMs = now.getTime() - new Date(lastInteractionAt).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`
  return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`
}

function FriendList({ friends, onWater, onEdit, onRemove, onRemoveInteraction }: FriendListProps) {
  const now = new Date()
  const sorted = sortFriendsByUrgency(friends, now)
  const cardElsRef = useRef(new Map<string, HTMLElement>())
  const prevRectsRef = useRef(new Map<string, DOMRect>())
  const rafRef = useRef<number>(0)
  const [openId, setOpenId] = useState<null | { type: 'details' | 'water'; id: string }>(null)

  const setCardRef = (id: string) => (el: HTMLElement | null) => {
    if (el) cardElsRef.current.set(id, el)
    else cardElsRef.current.delete(id)
  }

  useLayoutEffect(() => {
    let cancelled = false
    cancelAnimationFrame(rafRef.current)

    cardElsRef.current.forEach((el) => {
      el.style.transition = 'none'
      el.style.transform = ''
    })

    const nextRects = new Map<string, DOMRect>()
    cardElsRef.current.forEach((el, id) => {
      nextRects.set(id, el.getBoundingClientRect())
    })

    const animatables: Array<{ el: HTMLElement; dy: number }> = []

    cardElsRef.current.forEach((el, id) => {
      if (id === openId?.id) return
      const next = nextRects.get(id)!
      const prev = prevRectsRef.current.get(id)
      if (prev) {
        const dy = prev.top - next.top
        if (Math.abs(dy) > 2) animatables.push({ el, dy })
      }
    })

    prevRectsRef.current = nextRects

    if (animatables.length === 0) return

    animatables.forEach(({ el, dy }) => {
      el.style.transform = `translateY(${dy}px)`
    })

    void document.body.offsetHeight

    rafRef.current = requestAnimationFrame(() => {
      if (cancelled) return
      animatables.forEach(({ el }) => {
        el.style.transition = 'transform 300ms linear'
        el.style.transform = ''
      })
    })

    return () => {
      cancelled = true
    }
  })

  const firstDryIndex = sorted.findIndex(
    (f) => deriveWateringState(f, now) === 'dry',
  )

  return (
    <div className="friend-list">
      {sorted.map((friend, index) => {
          const state = deriveWateringState(friend, now)
          return (
        <div
          key={friend.id}
          ref={setCardRef(friend.id)}
          className="friend-card-slot"
          style={{ zIndex: sorted.length - index }}
        >
          {index === 0 && firstDryIndex === 0 && (
            <p className="friend-urgency-header">needs attention</p>
          )}
          {index === firstDryIndex && firstDryIndex > 0 && (
            <p className="friend-urgency-header">needs attention</p>
          )}
          <FriendCard
            friend={friend}
            onWater={onWater}
            onEdit={onEdit}
            onRemove={onRemove}
            onRemoveInteraction={onRemoveInteraction}
            wateringState={state}
            hasBirthday={hasUpcomingBirthday(friend, now)}
            open={openId?.type === 'details' && openId.id === friend.id}
            showWaterPopup={openId?.type === 'water' && openId.id === friend.id}
            onToggleOpen={() =>
              setOpenId((prev) =>
                prev?.type === 'details' && prev.id === friend.id
                  ? null
                  : { type: 'details', id: friend.id },
              )
            }
            onToggleWater={() =>
              setOpenId((prev) =>
                prev?.type === 'water' && prev.id === friend.id
                  ? null
                  : { type: 'water', id: friend.id },
              )
            }
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

function InteractionHistory({
  interactions,
  onRemoveInteraction,
}: {
  interactions: Interaction[]
  onRemoveInteraction: (interactionId: string) => void
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  if (interactions.length === 0) return null

  const sorted = [...interactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  const hasMore = sorted.length > 4
  const visible = showAll ? sorted : sorted.slice(0, 4)

  return (
    <div className="history">
      <h3 className="history-title">recent chats</h3>
      <ul className="history-list">
        {visible.map((int) => (
          <li key={int.id} className="history-item">
            <div className="history-content">
              <div className="history-header">
                <span className="history-header-row">
                  <span className="history-header-text">
                    <span className="history-date">{formatRelativeDate(int.date)}</span>
                    {int.type && (
                      <span className="history-type">{TYPE_LABELS[int.type]}</span>
                    )}
                  </span>
                  <span className="history-delete-slot">
                    {confirmingId !== int.id && (
                      <button
                        className="history-delete-button"
                        type="button"
                        onClick={() => setConfirmingId(int.id)}
                        aria-label="Delete chat"
                      >
                        🗑️
                      </button>
                    )}
                  </span>
                </span>
              </div>
              {confirmingId === int.id && (
                <div className="history-delete-confirm-inline">
                  <span className="history-delete-confirm-text">remove?</span>
                  <button
                    className="history-delete-yes"
                    type="button"
                    onClick={() => {
                      onRemoveInteraction(int.id)
                      setConfirmingId(null)
                    }}
                  >
                    yes
                  </button>
                  <button
                    className="history-delete-no"
                    type="button"
                    onClick={() => setConfirmingId(null)}
                  >
                    no
                  </button>
                </div>
              )}
              {int.note && <p className="history-note">{int.note}</p>}
            </div>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          className="history-expand-button"
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
        >
          {showAll ? 'collapse' : 'see all'}
        </button>
      )}
    </div>
  )
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
}: {
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
}) {
  const [type, setType] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [watered, setWatered] = useState(false)
  const wateredTimer = useRef<ReturnType<typeof setTimeout>>()
  const [editName, setEditName] = useState(friend.name)
  const [editBirthday, setEditBirthday] = useState(friend.birthday ?? '')
  const [editCadence, setEditCadence] = useState(String(friend.cadenceDays))
  const popupRef = useRef<HTMLDivElement>(null)
  const waterButtonRef = useRef<HTMLButtonElement>(null)
  const expandButtonRef = useRef<HTMLButtonElement>(null)

  const handleWaterClick = () => {
    if (showWaterPopup) {
      onWater(friend.id)
      onToggleWater()
      setWatered(true)
      clearTimeout(wateredTimer.current)
      wateredTimer.current = setTimeout(() => setWatered(false), 2000)
      return
    }

    setType('')
    setNote('')
    onToggleWater()
  }

  const handleSaveChat = () => {
    const input: LogInteractionInput = {}
    if (type) input.type = type as LogInteractionInput['type']
    if (note.trim()) input.note = note.trim()
    onWater(friend.id, input)
    onToggleWater()
    setType('')
    setNote('')
    setWatered(true)
    clearTimeout(wateredTimer.current)
    wateredTimer.current = setTimeout(() => setWatered(false), 2000)
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

  useEffect(() => {
    if (!showWaterPopup) return
    const handler = () => onToggleWater()
    document.addEventListener('scroll', handler, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', handler, { capture: true })
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

  const lastChatLabel = formatLastChatLabel(friend.lastInteractionAt)

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
          onClick={() => {
            onToggleOpen()
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
          💦
        </button>
      </div>
      {open && (
        <div className="water-details">
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
        <div className="water-popup" ref={popupRef} data-testid="water-popup">
          <div className="water-type-buttons">
            <button
              className={`water-type-button${type === '' ? ' water-type-button--active' : ''}`}
              onClick={() => setType('')}
            >
              any
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

export default FriendList
