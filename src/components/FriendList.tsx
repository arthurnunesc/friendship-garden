import { useLayoutEffect, useRef, useState } from 'react'
import type { EditFriendInput, Friend, LogInteractionInput } from '../friends/Friend'
import { deriveWateringState, hasUpcomingBirthday, sortFriendsByUrgency } from '../friends/Friend'
import FriendCard from './FriendCard'
import './FriendList.css'

interface FriendListProps {
  friends: Friend[]
  onWater: (friendId: string, input?: LogInteractionInput) => void
  onEdit: (friendId: string, input: EditFriendInput) => void
  onRemove: (friendId: string) => void
  onRemoveInteraction: (friendId: string, interactionId: string) => void
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
    (friend) => deriveWateringState(friend, now) === 'dry',
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
            {index === firstDryIndex && (
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

export default FriendList
