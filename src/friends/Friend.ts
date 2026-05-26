export interface Interaction {
  id: string
  date: string
  type?: 'message' | 'call' | 'in-person'
  note?: string
}

export type WateringState = 'watered' | 'nearing' | 'dry'

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

export interface LogInteractionInput {
  type?: 'message' | 'call' | 'in-person'
  note?: string
}

export function logInteraction(
  friend: Friend,
  input: LogInteractionInput = {},
): Friend {
  const now = new Date().toISOString()
  const interaction: Interaction = {
    id: `int-${nextInteractionId++}`,
    date: now,
  }
  if (input.type) interaction.type = input.type
  if (input.note) interaction.note = input.note
  return {
    ...friend,
    lastInteractionAt: now,
    interactions: [...friend.interactions, interaction],
  }
}

const NEARING_MULTIPLIER = 1.5

export function deriveWateringState(
  friend: Friend,
  now: Date = new Date(),
): WateringState {
  if (!friend.lastInteractionAt) return 'dry'

  const last = new Date(friend.lastInteractionAt)
  const daysSince = (now.getTime() - last.getTime()) / 86400000

  if (daysSince < friend.cadenceDays) return 'watered'
  if (daysSince < friend.cadenceDays * NEARING_MULTIPLIER) return 'nearing'
  return 'dry'
}

const STATE_ORDER: Record<WateringState, number> = {
  dry: 0,
  nearing: 1,
  watered: 2,
}

export function sortFriendsByUrgency(
  friends: Friend[],
  now: Date = new Date(),
): Friend[] {
  return [...friends].sort((a, b) => {
    const stateA = STATE_ORDER[deriveWateringState(a, now)]
    const stateB = STATE_ORDER[deriveWateringState(b, now)]
    if (stateA !== stateB) return stateA - stateB

    const daysA = a.lastInteractionAt
      ? (now.getTime() - new Date(a.lastInteractionAt).getTime()) / 86400000
      : Infinity
    const daysB = b.lastInteractionAt
      ? (now.getTime() - new Date(b.lastInteractionAt).getTime()) / 86400000
      : Infinity

    return daysB - daysA // more days = more urgent within same state
  })
}
