const INTERACTION_TYPES = ['message', 'call', 'in-person'] as const

type InteractionType = (typeof INTERACTION_TYPES)[number]

interface VersionedRecord {
  id: string
  updatedAt: string
  changeId: string
  deleted: boolean
}

export interface LiveFriendRecord extends VersionedRecord {
  deleted: false
  value: {
    name: string
    birthday?: string
    cadenceDays: number
    createdAt: string
  }
}

export interface DeletedFriendRecord extends VersionedRecord {
  deleted: true
  value?: never
}

export type SyncFriendRecord = LiveFriendRecord | DeletedFriendRecord

export interface LiveInteractionRecord extends VersionedRecord {
  friendId: string
  deleted: false
  value: {
    date: string
    type?: InteractionType
    note?: string
  }
}

export interface DeletedInteractionRecord extends VersionedRecord {
  friendId: string
  deleted: true
  value?: never
}

export type SyncInteractionRecord =
  | LiveInteractionRecord
  | DeletedInteractionRecord

export interface SyncSnapshot {
  version: 1
  friends: SyncFriendRecord[]
  interactions: SyncInteractionRecord[]
}

export interface GardenInteraction {
  id: string
  date: string
  type?: InteractionType
  note?: string
}

export interface GardenFriend {
  id: string
  name: string
  birthday?: string
  cadenceDays: number
  lastInteractionAt?: string
  interactions: GardenInteraction[]
  createdAt: string
}

type UnknownRecord = Record<string, unknown>

export class InvalidSyncSnapshotError extends Error {}
export class SyncCollisionError extends Error {}

const hasOwn = (value: UnknownRecord, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

function fail(message: string): never {
  throw new InvalidSyncSnapshotError(`Invalid sync snapshot: ${message}`)
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${field} must be a nonblank string`)
  }
  return value
}

function canonicalIsoDate(value: unknown, field: string): string {
  if (typeof value !== 'string') fail(`${field} must be a canonical UTC ISO timestamp`)
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    fail(`${field} must be a canonical UTC ISO timestamp`)
  }
  return value
}

function birthday(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail('birthday must be YYYY-MM-DD')
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail('birthday must be a valid calendar date')
  }
  return value
}

function parseFriendValue(value: unknown): LiveFriendRecord['value'] {
  if (!isRecord(value)) fail('friend value must be an object')
  const parsed: LiveFriendRecord['value'] = {
    name: nonBlank(value.name, 'friend value.name'),
    cadenceDays: value.cadenceDays as number,
    createdAt: canonicalIsoDate(value.createdAt, 'friend value.createdAt'),
  }
  if (!Number.isSafeInteger(parsed.cadenceDays) || parsed.cadenceDays <= 0) {
    fail('friend value.cadenceDays must be a positive safe integer')
  }
  if (value.birthday !== undefined) parsed.birthday = birthday(value.birthday)
  return parsed
}

function parseInteractionValue(value: unknown): LiveInteractionRecord['value'] {
  if (!isRecord(value)) fail('interaction value must be an object')
  const parsed: LiveInteractionRecord['value'] = {
    date: canonicalIsoDate(value.date, 'interaction value.date'),
  }
  if (value.type !== undefined) {
    if (!INTERACTION_TYPES.includes(value.type as InteractionType)) {
      fail('interaction value.type is not known')
    }
    parsed.type = value.type as InteractionType
  }
  if (value.note !== undefined) {
    if (typeof value.note !== 'string') fail('interaction value.note must be a string')
    parsed.note = value.note
  }
  return parsed
}

function parseFriend(value: unknown): SyncFriendRecord {
  if (!isRecord(value)) fail('friend record must be an object')
  const base = {
    id: nonBlank(value.id, 'friend id'),
    updatedAt: canonicalIsoDate(value.updatedAt, 'friend updatedAt'),
    changeId: nonBlank(value.changeId, 'friend changeId'),
  }
  if (typeof value.deleted !== 'boolean') fail('friend deleted must be a boolean')
  if (value.deleted) {
    if (hasOwn(value, 'value')) fail('friend tombstone must not contain value')
    return { ...base, deleted: true }
  }
  if (!hasOwn(value, 'value')) fail('live friend must contain value')
  return { ...base, deleted: false, value: parseFriendValue(value.value) }
}

function parseInteraction(value: unknown): SyncInteractionRecord {
  if (!isRecord(value)) fail('interaction record must be an object')
  const base = {
    friendId: nonBlank(value.friendId, 'interaction friendId'),
    id: nonBlank(value.id, 'interaction id'),
    updatedAt: canonicalIsoDate(value.updatedAt, 'interaction updatedAt'),
    changeId: nonBlank(value.changeId, 'interaction changeId'),
  }
  if (typeof value.deleted !== 'boolean') fail('interaction deleted must be a boolean')
  if (value.deleted) {
    if (hasOwn(value, 'value')) fail('interaction tombstone must not contain value')
    return { ...base, deleted: true }
  }
  if (!hasOwn(value, 'value')) fail('live interaction must contain value')
  return { ...base, deleted: false, value: parseInteractionValue(value.value) }
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left)
  const rightPoints = Array.from(right)
  const length = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index]?.codePointAt(0) as number
    const rightPoint = rightPoints[index]?.codePointAt(0) as number
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1
  }
  return leftPoints.length === rightPoints.length ? 0 : leftPoints.length < rightPoints.length ? -1 : 1
}

function interactionKey(record: SyncInteractionRecord): string {
  return JSON.stringify([record.friendId, record.id])
}

function ensureUniqueIdentities(snapshot: SyncSnapshot): void {
  const friendIds = new Set<string>()
  for (const record of snapshot.friends) {
    if (friendIds.has(record.id)) fail(`duplicate friend identity ${record.id}`)
    friendIds.add(record.id)
  }
  const interactionIds = new Set<string>()
  for (const record of snapshot.interactions) {
    const key = interactionKey(record)
    if (interactionIds.has(key)) fail(`duplicate interaction identity ${key}`)
    interactionIds.add(key)
  }
}

function parseSnapshot(value: unknown): SyncSnapshot {
  if (!isRecord(value)) fail('snapshot must be an object')
  if (value.version !== 1) fail('version must be 1')
  if (!Array.isArray(value.friends)) fail('friends must be an array')
  if (!Array.isArray(value.interactions)) fail('interactions must be an array')
  const snapshot: SyncSnapshot = {
    version: 1,
    friends: value.friends.map(parseFriend),
    interactions: value.interactions.map(parseInteraction),
  }
  ensureUniqueIdentities(snapshot)
  return snapshot
}

function timestamp(record: VersionedRecord): number {
  return new Date(record.updatedAt).getTime()
}

function canonicalRecord(record: SyncFriendRecord | SyncInteractionRecord): string {
  return JSON.stringify(record)
}

function chooseNewer<T extends SyncFriendRecord | SyncInteractionRecord>(left: T, right: T): T {
  const timestampOrder = timestamp(left) - timestamp(right)
  if (timestampOrder !== 0) return timestampOrder > 0 ? left : right
  if (left.deleted !== right.deleted) return left.deleted ? left : right
  const changeOrder = compareCodePoints(left.changeId, right.changeId)
  if (changeOrder !== 0) return changeOrder > 0 ? left : right
  if (canonicalRecord(left) !== canonicalRecord(right)) {
    throw new SyncCollisionError('Sync snapshot collision: same identity/version has different payloads')
  }
  return left
}

function mergeRecords<T extends SyncFriendRecord | SyncInteractionRecord>(
  current: T[],
  incoming: T[],
  key: (record: T) => string,
): T[] {
  const records = new Map<string, T>()
  for (const record of [...current, ...incoming]) {
    const identity = key(record)
    const existing = records.get(identity)
    records.set(identity, existing === undefined ? record : chooseNewer(existing, record))
  }
  return [...records.values()]
}

function compareFriendIdentity(left: SyncFriendRecord, right: SyncFriendRecord): number {
  return compareCodePoints(left.id, right.id)
}

function compareInteractionIdentity(
  left: SyncInteractionRecord,
  right: SyncInteractionRecord,
): number {
  return compareCodePoints(left.friendId, right.friendId) || compareCodePoints(left.id, right.id)
}

/** Validates, canonically copies, and deterministically merges two version-1 snapshots. */
export function mergeGardenSnapshots(current: unknown, incoming: unknown): SyncSnapshot {
  const parsedCurrent = parseSnapshot(current)
  const parsedIncoming = parseSnapshot(incoming)
  return {
    version: 1,
    friends: mergeRecords(parsedCurrent.friends, parsedIncoming.friends, (record) => record.id)
      .sort(compareFriendIdentity),
    interactions: mergeRecords(
      parsedCurrent.interactions,
      parsedIncoming.interactions,
      interactionKey,
    ).sort(compareInteractionIdentity),
  }
}

function compareGardenInteractions(left: GardenInteraction, right: GardenInteraction): number {
  const timestampOrder = new Date(left.date).getTime() - new Date(right.date).getTime()
  return timestampOrder || compareCodePoints(left.id, right.id)
}

/** Validates a snapshot and returns the existing client-facing garden JSON shape. */
export function materializeGarden(snapshot: unknown): GardenFriend[] {
  const parsed = parseSnapshot(snapshot)
  const friends = new Map<string, GardenFriend>()
  for (const record of parsed.friends) {
    if (record.deleted) continue
    const friend: GardenFriend = {
      id: record.id,
      name: record.value.name,
      cadenceDays: record.value.cadenceDays,
      interactions: [],
      createdAt: record.value.createdAt,
    }
    if (record.value.birthday !== undefined) friend.birthday = record.value.birthday
    friends.set(record.id, friend)
  }
  for (const record of parsed.interactions) {
    if (record.deleted) continue
    const friend = friends.get(record.friendId)
    if (friend === undefined) continue
    const interaction: GardenInteraction = { id: record.id, date: record.value.date }
    if (record.value.type !== undefined) interaction.type = record.value.type
    if (record.value.note !== undefined) interaction.note = record.value.note
    friend.interactions.push(interaction)
  }
  return [...friends.values()].sort((left, right) => compareCodePoints(left.id, right.id)).map((friend) => {
    friend.interactions.sort(compareGardenInteractions)
    const last = friend.interactions[friend.interactions.length - 1]
    if (last !== undefined) friend.lastInteractionAt = last.date
    return friend
  })
}
