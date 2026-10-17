import {
  InvalidSyncSnapshotError,
  mergeGardenSnapshots,
  type GardenFriend,
  type SyncFriendRecord,
  type SyncInteractionRecord,
  type SyncSnapshot,
} from './snapshot.ts'

type ChangeClock = () => { updatedAt: string; changeId: string }

const EMPTY_SNAPSHOT: SyncSnapshot = { version: 1, friends: [], interactions: [] }

function payload(value: object): string {
  return JSON.stringify(value)
}

function validateCanonicalDate(value: string): void {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new InvalidSyncSnapshotError('Invalid sync snapshot: date must be a canonical UTC ISO timestamp')
  }
}

function nextVersion(
  previous: { updatedAt: string } | undefined,
  clock: ChangeClock,
): { updatedAt: string; changeId: string } {
  const supplied = clock()
  const suppliedTime = new Date(supplied.updatedAt)
  if (
    Number.isNaN(suppliedTime.getTime()) ||
    suppliedTime.toISOString() !== supplied.updatedAt ||
    typeof supplied.changeId !== 'string' || supplied.changeId.trim().length === 0
  ) {
    throw new InvalidSyncSnapshotError('Invalid sync change clock')
  }
  const previousTime = previous === undefined ? Number.NEGATIVE_INFINITY : new Date(previous.updatedAt).getTime()
  const updatedAt = Math.max(suppliedTime.getTime(), previousTime + 1)
  return { updatedAt: new Date(updatedAt).toISOString(), changeId: supplied.changeId }
}

/** Converts a client garden into a versioned snapshot without mutating either input. */
export function recordGardenChanges(
  previous: SyncSnapshot,
  friends: GardenFriend[],
  clock: ChangeClock,
): SyncSnapshot {
  const base = mergeGardenSnapshots(previous, EMPTY_SNAPSHOT)
  const oldFriends = new Map(base.friends.map((record) => [record.id, record]))
  const oldInteractions = new Map(base.interactions.map((record) => [JSON.stringify([record.friendId, record.id]), record]))
  const seenFriends = new Set<string>()
  const seenInteractions = new Set<string>()
  const friendRecords: SyncFriendRecord[] = [...base.friends]
  const interactionRecords: SyncInteractionRecord[] = [...base.interactions]

  for (const friend of friends) {
    if (friend.lastInteractionAt !== undefined) validateCanonicalDate(friend.lastInteractionAt)
    if (seenFriends.has(friend.id)) throw new InvalidSyncSnapshotError(`Duplicate friend identity ${friend.id}`)
    seenFriends.add(friend.id)
    const desiredValue = {
      name: friend.name,
      cadenceDays: friend.cadenceDays,
      createdAt: friend.createdAt,
      ...(friend.birthday === undefined ? {} : { birthday: friend.birthday }),
    }
    const oldFriend = oldFriends.get(friend.id)
    if (
      oldFriend === undefined ||
      oldFriend.deleted ||
      payload(oldFriend.value) !== payload(desiredValue)
    ) {
      const version = nextVersion(oldFriend, clock)
      const record: SyncFriendRecord = { id: friend.id, ...version, deleted: false, value: desiredValue }
      const index = friendRecords.findIndex((item) => item.id === friend.id)
      if (index < 0) friendRecords.push(record)
      else friendRecords[index] = record
    }

    const interactions = [...friend.interactions]
    const representedDates = new Set(interactions.map((item) => item.date))
    if (
      friend.lastInteractionAt !== undefined &&
      !representedDates.has(friend.lastInteractionAt) &&
      (interactions.length === 0 || interactions.every((item) => item.date < friend.lastInteractionAt!))
    ) {
      let id = `legacy-last-${friend.lastInteractionAt}`
      while (interactions.some((item) => item.id === id)) id += '-legacy'
      interactions.push({ id, date: friend.lastInteractionAt })
    }

    for (const interaction of interactions) {
      const identity = JSON.stringify([friend.id, interaction.id])
      if (seenInteractions.has(identity)) throw new InvalidSyncSnapshotError(`Duplicate interaction identity ${identity}`)
      seenInteractions.add(identity)
      const value = {
        date: interaction.date,
        ...(interaction.type === undefined ? {} : { type: interaction.type }),
        ...(interaction.note === undefined ? {} : { note: interaction.note }),
      }
      const old = oldInteractions.get(identity)
      if (old === undefined || old.deleted || payload(old.value) !== payload(value)) {
        const version = nextVersion(old, clock)
        const record: SyncInteractionRecord = {
          friendId: friend.id,
          id: interaction.id,
          ...version,
          deleted: false,
          value,
        }
        const index = interactionRecords.findIndex((item) => item.friendId === friend.id && item.id === interaction.id)
        if (index < 0) interactionRecords.push(record)
        else interactionRecords[index] = record
      }
    }
  }

  for (let index = 0; index < friendRecords.length; index += 1) {
    const old = friendRecords[index]!
    if (!old.deleted && !seenFriends.has(old.id)) {
      friendRecords[index] = { id: old.id, ...nextVersion(old, clock), deleted: true }
    }
  }

  for (let index = 0; index < interactionRecords.length; index += 1) {
    const old = interactionRecords[index]!
    const identity = JSON.stringify([old.friendId, old.id])
    if (!old.deleted && !seenInteractions.has(identity)) {
      interactionRecords[index] = { friendId: old.friendId, id: old.id, ...nextVersion(old, clock), deleted: true }
    }
  }

  return mergeGardenSnapshots(EMPTY_SNAPSHOT, {
    version: 1,
    friends: friendRecords,
    interactions: interactionRecords,
  })
}
