import { useRef, useState } from 'react'
import type { EmailReminderClient, EmailReminderSettings } from '../../packages/garden-sync/src/reminderSettings'

export default function EmailReminders({ client, user }: { client: EmailReminderClient, user: { id: string, email: string } }) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<EmailReminderSettings | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const working = useRef(false)

  async function run(action: () => Promise<EmailReminderSettings>) {
    if (working.current) return
    working.current = true
    setPending(true)
    setError(null)
    try { setSettings(await action()) }
    catch { setError('Could not update or load email reminders. Please try again.') }
    finally { working.current = false; setPending(false) }
  }
  function enable() {
    let timeZone: string
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (!timeZone) throw new Error()
      new Intl.DateTimeFormat('en', { timeZone }).format()
    } catch { setError('Could not determine your time zone. Check your device settings and try again.'); return }
    void run(() => client.update(user.id, { enabled: true, email: user.email, timeZone }))
  }
  return <div>
    <button type="button" className="tool-button" aria-expanded={open} onClick={() => {
      setOpen(!open)
      if (!open && !working.current) {
        setSettings(null)
        void run(() => client.read(user.id))
      }
    }}>email reminders</button>
    {open && <div>
      <p>email delivery is not active yet. emails will use your synced garden.</p>
      {pending && <p role="status">saving or loading email reminders…</p>}
      {settings && <>
        <p role="status">email reminders are {settings.enabled ? 'enabled' : 'disabled'}.</p>
        {settings.enabled
          ? <button type="button" className="tool-button" disabled={pending} onClick={() => void run(() => client.update(user.id, { enabled: false }))}>disable email reminders</button>
          : <button type="button" className="tool-button" disabled={pending} onClick={enable}>enable email reminders</button>}
      </>}
      {error && <p role="alert">{error}</p>}
      {!settings && !pending && <button type="button" className="tool-button" onClick={() => void run(() => client.read(user.id))}>retry email reminder settings</button>}
    </div>}
  </div>
}
