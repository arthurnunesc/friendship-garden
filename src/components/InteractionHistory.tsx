import { useState } from 'react'
import type { Interaction } from '../friends/Friend'
import { formatRelativeDate } from '../friends/date'
import { TYPE_LABELS } from './interactionDisplay'

interface InteractionHistoryProps {
  interactions: Interaction[]
  onRemoveInteraction: (interactionId: string) => void
}

function InteractionHistory({ interactions, onRemoveInteraction }: InteractionHistoryProps) {
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

export default InteractionHistory
