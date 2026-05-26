import { useState, type FormEvent } from 'react'
import './AddFriendForm.css'

interface AddFriendFormProps {
  onSubmit: (name: string) => void
  onCancel: () => void
}

function AddFriendForm({ onSubmit, onCancel }: AddFriendFormProps) {
  const [name, setName] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    onSubmit(trimmed)
    setName('')
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
