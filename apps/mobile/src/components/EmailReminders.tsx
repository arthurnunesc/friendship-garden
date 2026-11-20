import { useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { EmailReminderClient, EmailReminderSettings } from '../../../../packages/garden-sync/src/reminderSettings'

export function EmailReminders({ client, user }: { client: EmailReminderClient, user: { id: string, email: string } }) {
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
  const button = (label: string, onPress: () => void, disabled = false) => <TouchableOpacity
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}>
    <Text style={styles.actionText}>{label}</Text>
  </TouchableOpacity>
  return <View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="email reminders" accessibilityState={{ expanded: open }}
      onPress={() => {
        setOpen(!open)
        if (!open && !working.current) {
          setSettings(null)
          void run(() => client.read(user.id))
        }
      }} style={styles.action}>
      <Text style={styles.actionText}>email reminders</Text>
    </TouchableOpacity>
    {open && <View>
      <Text style={styles.body}>email delivery is not active yet. emails will use your synced garden.</Text>
      {pending && <Text accessibilityLiveRegion="polite" style={styles.body}>saving or loading email reminders…</Text>}
      {settings && <>
        <Text accessibilityLiveRegion="polite" style={styles.body}>email reminders are {settings.enabled ? 'enabled' : 'disabled'}.</Text>
        {settings.enabled
          ? button('disable email reminders', () => { void run(() => client.update(user.id, { enabled: false })) }, pending)
          : button('enable email reminders', enable, pending)}
      </>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!settings && !pending && button('retry email reminder settings', () => { void run(() => client.read(user.id)) })}
    </View>}
  </View>
}

const styles = StyleSheet.create({
  action: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  actionText: { fontSize: 16, fontWeight: '600', color: '#4a7c59', textAlign: 'center', lineHeight: 22 },
  body: { fontSize: 15, color: '#1a1a1a', lineHeight: 22, marginBottom: 12 },
  error: { fontSize: 15, color: '#b4472b', lineHeight: 22, marginBottom: 8 },
  disabled: { opacity: 0.5 },
})
