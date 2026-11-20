import React from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { EmailReminders } from './EmailReminders'
import type { EmailReminderClient } from '../../../../packages/garden-sync/src/reminderSettings'

vi.mock('react-native', () => ({ View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: (styles: unknown) => styles } }))
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })

describe('native email reminders', () => {
  it('loads lazily, enables and disables without garden sync', async () => {
    const client: EmailReminderClient = {
      read: vi.fn<EmailReminderClient['read']>().mockResolvedValue({ enabled: false }),
      update: vi.fn<EmailReminderClient['update']>().mockImplementation(async (_id, change) =>
        change.enabled ? { enabled: true, timeZone: change.timeZone } : { enabled: false }),
    }
    let view!: ReturnType<typeof create>
    await act(async () => { view = create(<EmailReminders client={client} user={{ id: 'a', email: 'a@example.invalid' }} />) })
    expect(client.read).not.toHaveBeenCalled()
    const press = async (label: string) => { await act(async () => { view.root.findByProps({ accessibilityLabel: label }).props.onPress() }) }
    await press('email reminders')
    expect(client.read).toHaveBeenCalledWith('a')
    expect(JSON.stringify(view.toJSON())).toContain('email delivery is not active yet')
    await press('enable email reminders')
    expect(client.update).toHaveBeenCalledWith('a', { enabled: true, email: 'a@example.invalid', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    await press('disable email reminders')
    expect(client.update).toHaveBeenLastCalledWith('a', { enabled: false })
    await act(async () => { view.unmount() })
  })
})

it('does not enable without a resolved device time zone', async () => {
  const client: EmailReminderClient = {
    read: vi.fn<EmailReminderClient['read']>().mockResolvedValue({ enabled: false }), update: vi.fn(),
  }
  let view!: ReturnType<typeof create>
  await act(async () => { view = create(<EmailReminders client={client} user={{ id: 'a', email: 'a@example.invalid' }} />) })
  await act(async () => { view.root.findByProps({ accessibilityLabel: 'email reminders' }).props.onPress() })
  const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: '' } as Intl.ResolvedDateTimeFormatOptions)
  try {
    await act(async () => { view.root.findByProps({ accessibilityLabel: 'enable email reminders' }).props.onPress() })
    expect(JSON.stringify(view.toJSON())).toContain('Could not determine your time zone')
    expect(client.update).not.toHaveBeenCalled()
  } finally { spy.mockRestore(); await act(async () => { view.unmount() }) }
})
