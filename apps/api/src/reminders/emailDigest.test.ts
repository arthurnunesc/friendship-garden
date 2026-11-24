import { describe, expect, it } from 'vitest'
import { planEmailDigest } from './emailDigest.js'

const base = {
  accountId: 'synthetic-account',
  email: 'synthetic@example.invalid',
  emailVerified: true,
  preference: { email: 'synthetic@example.invalid', timeZone: 'America/New_York' },
  now: new Date('2026-03-08T05:00:00Z'),
  friends: [{ cadenceDays: 1, lastInteractionAt: '2026-03-08T04:59:59Z', name: 'Private name' }],
}

describe('planEmailDigest', () => {
  it('requires separate opt-in for the current verified account address', () => {
    expect(planEmailDigest({ ...base, preference: null })).toBeNull()
    expect(planEmailDigest({ ...base, emailVerified: false })).toBeNull()
    expect(planEmailDigest({ ...base, email: 'changed@example.invalid' })).toBeNull()
    expect(planEmailDigest({ ...base, preference: { ...base.preference, timeZone: 'invalid' } })).toBeNull()
  })

  it('uses local dates, not elapsed 24-hour periods, across a DST change', () => {
    const friends = [{ cadenceDays: 1, lastInteractionAt: '2026-03-08T05:30:00Z' }]
    expect(planEmailDigest({ ...base, friends, now: new Date('2026-03-09T03:59:59Z') })).toBeNull()
    expect(planEmailDigest({ ...base, friends, now: new Date('2026-03-09T04:00:00Z') })).not.toBeNull()
  })

  it('skips empty or not-yet-due gardens and treats an uncontacted friend as due', () => {
    expect(planEmailDigest({ ...base, friends: [] })).toBeNull()
    expect(planEmailDigest({ ...base, friends: [{ ...base.friends[0], cadenceDays: 2 }] })).toBeNull()
    expect(planEmailDigest({ ...base, friends: [{ cadenceDays: 14 }] })).not.toBeNull()
  })

  it('produces one stable key per account and local day and keeps private details out of the message', () => {
    const one = planEmailDigest(base)!
    const sameDay = planEmailDigest({ ...base, friends: [...base.friends, ...base.friends], now: new Date('2026-03-09T03:59:59Z') })
    expect(sameDay).toEqual(one)
    expect(planEmailDigest({ ...base, now: new Date('2026-03-09T04:00:00Z') })?.idempotencyKey).not.toBe(one.idempotencyKey)
    expect(planEmailDigest({ ...base, accountId: 'other' })?.idempotencyKey).not.toBe(one.idempotencyKey)
    expect(JSON.stringify(one)).not.toMatch(/Private name|synthetic-account/)
  })
})
