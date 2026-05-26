export interface Interaction {
  id: string
  date: string
}

export interface Friend {
  id: string
  name: string
  birthday?: string
  cadenceDays: number
  lastInteractionAt?: string
  interactions: Interaction[]
  createdAt: string
}

let nextId = 1
let nextInteractionId = 1

export interface CreateFriendInput {
  name: string
  birthday?: string
  cadenceDays?: number
}

export const DEFAULT_CADENCE_DAYS = 14

export function createFriend(input: CreateFriendInput): Friend {
  const id = `friend-${nextId++}`
  return {
    id,
    name: input.name.trim(),
    birthday: input.birthday || undefined,
    cadenceDays: input.cadenceDays ?? DEFAULT_CADENCE_DAYS,
    interactions: [],
    createdAt: new Date().toISOString(),
  }
}

export function logInteraction(friend: Friend): Friend {
  const now = new Date().toISOString()
  const interaction: Interaction = {
    id: `int-${nextInteractionId++}`,
    date: now,
  }
  return {
    ...friend,
    lastInteractionAt: now,
    interactions: [...friend.interactions, interaction],
  }
}
