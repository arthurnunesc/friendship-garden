import { useState, type FormEvent } from 'react'
import './AddFriendForm.css'

export interface AddFriendData {
  name: string
  birthday?: string
  cadenceDays?: number
}

interface AddFriendFormProps {
  onSubmit: (data: AddFriendData) => void
  onCancel: () => void
}

const CADENCE_OPTIONS = [
  { value: '', label: '2 weeks (default)' },
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
  { value: '21', label: '3 weeks' },
  { value: '30', label: '1 month' },
  { value: '60', label: '2 months' },
]

function AddFriendForm({ onSubmit, onCancel }: AddFriendFormProps) {
  const [name, setName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [cadence, setCadence] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    onSubmit({
      name: trimmed,
      birthday: birthday || undefined,
      cadenceDays: cadence ? Number(cadence) : undefined,
    })
    setName('')
    setBirthday('')
    setCadence('')
  }

  return (
    <form className="add-friend-form" onSubmit={handleSubmit}>
      <label className="add-friend-label" htmlFor="friend-name">
        What's their name?
      </label>
      <input
        id="friend-name"
        className="add-friend-input"
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
      />

      <details className="add-friend-details">
        <summary className="add-friend-summary">More details (optional)</summary>

        <label className="add-friend-optional-label" htmlFor="friend-birthday">
          Birthday
        </label>
        <input
          id="friend-birthday"
          className="add-friend-input"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
        />

        <label className="add-friend-optional-label" htmlFor="friend-cadence">
          Contact cadence
        </label>
        <select
          id="friend-cadence"
          className="add-friend-input add-friend-select"
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
        >
          {CADENCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </details>

      <div className="add-friend-actions">
        <button className="add-friend-submit" type="submit" disabled={name.trim().length === 0}>
          Add to garden
        </button>
        <button className="add-friend-cancel" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default AddFriendForm
