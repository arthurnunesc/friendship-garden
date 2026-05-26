export interface Friend {
  id: string
  name: string
  createdAt: string
}

let nextId = 1

export function createFriend(name: string): Friend {
  const id = `friend-${nextId++}`
  return { id, name: name.trim(), createdAt: new Date().toISOString() }
}
