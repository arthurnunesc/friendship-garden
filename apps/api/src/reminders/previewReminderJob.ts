import { materializeGarden, type SyncSnapshot } from '../../../../packages/garden-sync/src/snapshot.ts'
import { deliverEmailDigest, type EmailDigestMessage } from './deliverEmailDigest.ts'
import type { createEmailReminderStore } from './emailReminderStore.ts'

type Store = Pick<ReturnType<typeof createEmailReminderStore>, 'findVerifiedOwner' | 'read' | 'claim' | 'markAccepted' | 'isSuppressed'>

export async function runPreviewReminderJob(to: string, deps: {
  store: Store
  readGarden(userId: string): Promise<SyncSnapshot>
  send(message: EmailDigestMessage): Promise<void>
  now(): Date
}) {
  if (await deps.store.isSuppressed(to)) return 'skipped'
  const accountId = await deps.store.findVerifiedOwner(to)
  if (!accountId) return 'skipped'
  return deliverEmailDigest({ accountId, email: to, emailVerified: true, now: deps.now(),
    friends: materializeGarden(await deps.readGarden(accountId)) }, deps.store, deps.send)
}
