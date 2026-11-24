import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import EmailReminders from './EmailReminders'
import type { EmailReminderClient } from '../../packages/garden-sync/src/reminderSettings'

const user = { id: 'a', email: 'a@example.invalid' }

describe('email reminders', () => {
  it('loads only on open and changes settings only after explicit consent', async () => {
    const client: EmailReminderClient = {
      read: vi.fn<EmailReminderClient['read']>().mockResolvedValue({ enabled: false }),
      update: vi.fn<EmailReminderClient['update']>().mockImplementation(async (_id, change) =>
        change.enabled ? { enabled: true, timeZone: change.timeZone } : { enabled: false }),
    }
    const click = userEvent.setup()
    render(<EmailReminders client={client} user={user} />)
    expect(client.read).not.toHaveBeenCalled()
    await click.click(screen.getByRole('button', { name: 'email reminders' }))
    expect(client.read).toHaveBeenCalledWith('a')
    expect(screen.getByText(/delivery is not active yet/)).toBeInTheDocument()
    await click.click(await screen.findByRole('button', { name: 'enable email reminders' }))
    expect(client.update).toHaveBeenCalledWith('a', { enabled: true, email: user.email, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    await click.click(await screen.findByRole('button', { name: 'disable email reminders' }))
    expect(client.update).toHaveBeenLastCalledWith('a', { enabled: false })
  })
  it('does not report success on failure and resets when identity changes', async () => {
    const client: EmailReminderClient = {
      read: vi.fn<EmailReminderClient['read']>().mockResolvedValue({ enabled: false }),
      update: vi.fn<EmailReminderClient['update']>().mockRejectedValue(new Error('private')),
    }
    const click = userEvent.setup()
    const view = render(<EmailReminders key="a" client={client} user={user} />)
    await click.click(screen.getByRole('button', { name: 'email reminders' }))
    await click.click(await screen.findByRole('button', { name: 'enable email reminders' }))
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private')
    expect(screen.getByText('email reminders are disabled.')).toBeInTheDocument()
    view.rerender(<EmailReminders key="b" client={client} user={{ id: 'b', email: 'b@example.invalid' }} />)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.queryByText('email reminders are disabled.')).not.toBeInTheDocument()
  })
})

it('does not enable when the device cannot resolve a time zone', async () => {
  const client: EmailReminderClient = {
    read: vi.fn<EmailReminderClient['read']>().mockResolvedValue({ enabled: false }), update: vi.fn(),
  }
  const click = userEvent.setup()
  render(<EmailReminders client={client} user={user} />)
  await click.click(screen.getByRole('button', { name: 'email reminders' }))
  await screen.findByRole('button', { name: 'enable email reminders' })
  const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: '' } as Intl.ResolvedDateTimeFormatOptions)
  try {
    await click.click(screen.getByRole('button', { name: 'enable email reminders' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not determine your time zone')
    expect(client.update).not.toHaveBeenCalled()
  } finally { spy.mockRestore() }
})
