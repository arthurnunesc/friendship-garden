import type { Friend } from '../friends/Friend'
import './FriendList.css'

interface FriendListProps {
  friends: Friend[]
  onWater: (friendId: string) => void
}

function FriendList({ friends, onWater }: FriendListProps) {
  if (friends.length === 0) return null

  return (
    <ul className="friend-list">
      {friends.map((friend) => (
        <li key={friend.id} className="friend-card">
          <span className="friend-plant">🪴</span>
          <span className="friend-name">{friend.name}</span>
          <button
            className="friend-water-button"
            type="button"
            onClick={() => onWater(friend.id)}
            aria-label={`Water ${friend.name}`}
          >
            💧
          </button>
        </li>
      ))}
    </ul>
  )
}

export default FriendList
