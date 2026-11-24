import { expect, it, vi } from 'vitest'
import { deliverEmailDigest } from './deliverEmailDigest.js'

const email = 'synthetic@example.invalid'
const input = {
  accountId: 'fixture', email, emailVerified: true,
  now: new Date('2026-11-20T12:00:00Z'), friends: [{ cadenceDays: 1 }],
}
const preference = { email, timeZone: 'UTC', revision: 'original' }

it('does not submit a claimed digest if consent was withdrawn before delivery', async () => {
  const store = {
    read: vi.fn().mockResolvedValueOnce(preference).mockResolvedValueOnce(null),
    claim: vi.fn().mockResolvedValue('lease'),
    markAccepted: vi.fn(),
    isSuppressed: vi.fn().mockResolvedValue(false),
  }
  const send = vi.fn()
  await expect(deliverEmailDigest(input, store, send)).resolves.toBe('skipped')
  expect(store.claim).toHaveBeenCalledWith('fixture', '2026-11-20', preference)
  expect(send).not.toHaveBeenCalled()
  expect(store.markAccepted).not.toHaveBeenCalled()
})

it('does not acknowledge a lease when submission has an uncertain outcome', async () => {
  const store = {
    read: vi.fn().mockResolvedValue(preference),
    claim: vi.fn().mockResolvedValue('lease'),
    markAccepted: vi.fn(),
    isSuppressed: vi.fn().mockResolvedValue(false),
  }
  const send = vi.fn().mockRejectedValue(new Error('Synthetic timeout'))
  await expect(deliverEmailDigest(input, store, send)).rejects.toThrow('Synthetic timeout')
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: email, idempotencyKey: expect.stringMatching(/^reminder\//) }))
  expect(store.markAccepted).not.toHaveBeenCalled()
})
