export interface Friend {
  id: string
  name: string
  birthday?: string
  cadenceDays: number
  createdAt: string
}

let nextId = 1

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
    createdAt: new Date().toISOString(),
  }
}
