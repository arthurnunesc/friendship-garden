import type { InteractionType } from '../friends/Friend'

export const TYPE_LABELS: Record<InteractionType, string> = {
  message: 'message',
  call: 'call',
  'in-person': 'in person',
}
