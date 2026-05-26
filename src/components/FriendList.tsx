import type { Friend } from '../friends/Friend'
import './FriendList.css'

interface FriendListProps {
  friends: Friend[]
}

function FriendList({ friends }: FriendListProps) {
  if (friends.length === 0) return null

  return (
    <ul className="friend-list">
      {friends.map((friend) => (
        <li key={friend.id} className="friend-card">
          <span className="friend-plant">🪴</span>
          <span className="friend-name">{friend.name}</span>
        </li>
      ))}
    </ul>
  )
}

export default FriendList
