import { planEmailDigest } from './emailDigest.ts'
import type { createEmailReminderStore } from './emailReminderStore.ts'

type Store = Pick<ReturnType<typeof createEmailReminderStore>, 'read' | 'claim' | 'markAccepted' | 'isSuppressed'>
type DigestInput = Omit<Parameters<typeof planEmailDigest>[0], 'preference'>
export type EmailDigestMessage = Omit<NonNullable<ReturnType<typeof planEmailDigest>>, 'localDay'>

/** The sender must deduplicate by idempotencyKey, including on a timeout. */
export async function deliverEmailDigest(input: DigestInput, store: Store, send: (message: EmailDigestMessage) => Promise<void>) {
  const preference = await store.read(input.accountId)
  if (!preference) return 'skipped'
  const digest = planEmailDigest({ ...input, preference })
  if (!digest) return 'skipped'
  const { localDay, ...message } = digest
  const token = await store.claim(input.accountId, localDay, preference)
  if (!token) return 'skipped'
  const current = await store.read(input.accountId)
  if (!current || current.revision !== preference.revision || await store.isSuppressed(message.to)) return 'skipped'
  await send(message)
  // An expired lease can be reclaimed while the provider call is in flight.
  // Do not acknowledge the replacement worker's lease.
  return await store.markAccepted(input.accountId, localDay, token) ? 'accepted' : 'lease-lost'
}
