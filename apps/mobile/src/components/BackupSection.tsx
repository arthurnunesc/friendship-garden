import React, { useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { validateAndImportGarden, type Friend, type ImportError, type ImportResult } from '../garden/Friend'
import { pickBackup, shareBackup } from '../garden/backupFiles'

interface BackupSectionProps {
  friends: Friend[]
  onImport(payload: unknown): Promise<ImportResult | ImportError>
}

// Extend the existing settings surface: green actions, system type, and calm
// feedback. Validation and an explicit preview protect replacement of local data.
export function BackupSection({ friends, onImport }: BackupSectionProps) {
  const [draft, setDraft] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [pending, setPending] = useState<Friend[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const working = useRef(false)
  const interactionCount = pending?.reduce((sum, friend) => sum + friend.interactions.length, 0) ?? 0

  const run = async (operation: () => Promise<void>) => {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError(null)
    setFeedback(null)
    try { await operation() } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete the backup action. Try again.')
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  const preview = (text: string) => {
    setPending(null)
    let payload: unknown
    try { payload = JSON.parse(text) } catch {
      throw new Error('This backup is not valid JSON. Choose a garden export or check the pasted text.')
    }
    const result = validateAndImportGarden(payload)
    if (!result.success) throw new Error(result.error)
    setPending(result.friends)
  }

  const choose = () => run(async () => {
    const text = await pickBackup()
    if (text !== null) preview(text)
  })
  const confirm = () => run(async () => {
    if (pending === null) return
    const result = await onImport({ version: 1, friends: pending })
    if (!result.success) throw new Error(result.error)
    setFeedback(`Imported ${result.friends.length} ${result.friends.length === 1 ? 'friend' : 'friends'}. Your garden is saved on this device.`)
    setPending(null)
    setDraft('')
    setShowPaste(false)
  })

  const button = (label: string, text: string, action: () => void, primary = false) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: busy }} disabled={busy} onPress={action}
      activeOpacity={0.7} style={[styles.button, primary && styles.primary, busy && styles.disabled]}>
      <Text style={[styles.buttonText, primary && styles.primaryText]}>{text}</Text>
    </TouchableOpacity>
  )

  return (
    <View style={styles.section}>
      <Text style={styles.title}>garden backups</Text>
      <Text style={styles.description}>
        Export your garden from the web app, then choose its JSON file here. Names, birthdays, cadence, and interaction history stay with your garden.
      </Text>
      {button('Choose garden backup file', 'choose backup file', () => { void choose() }, true)}
      {button('Paste garden backup JSON', showPaste ? 'hide pasted JSON' : 'paste JSON instead', () => {
        setShowPaste(!showPaste)
        setPending(null)
        setError(null)
        setFeedback(null)
      })}
      {showPaste && (
        <View>
          <TextInput accessibilityLabel="Garden backup JSON" value={draft}
            onChangeText={(text) => { setDraft(text); setPending(null); setError(null); setFeedback(null) }}
            editable={!busy} multiline autoCapitalize="none" autoCorrect={false}
            placeholder="Paste the full web export JSON" placeholderTextColor="#666"
            textAlignVertical="top" style={styles.input} />
          {button('Review pasted garden backup', 'review backup', () => { void run(async () => preview(draft)) })}
        </View>
      )}
      {pending !== null && (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>review before replacing</Text>
          <Text style={styles.description}>
            This backup has {pending.length} {pending.length === 1 ? 'friend' : 'friends'} and {interactionCount} recorded {interactionCount === 1 ? 'interaction' : 'interactions'}.
          </Text>
          {pending.length > 0 && <Text style={styles.names}>{pending.map((friend) => friend.name).join('\n')}</Text>}
          <Text style={styles.description}>
            Replace the {friends.length} {friends.length === 1 ? 'friend' : 'friends'} on this device? This does not merge gardens. Export your current garden first if you want to keep it. Enabled reminders will be updated for the imported garden.
          </Text>
          {button('Replace garden with backup', 'replace garden', () => { void confirm() }, true)}
          {button('Cancel garden replacement', 'cancel', () => { setPending(null); setError(null) })}
        </View>
      )}
      {busy && <Text style={styles.description} accessibilityLiveRegion="polite">Working on your backup…</Text>}
      {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {feedback && <Text style={styles.feedback} accessibilityLiveRegion="polite">{feedback}</Text>}
      <View style={styles.export}>
        <Text style={styles.description}>Keep a copy of this garden using the same format as the web app. Backups include personal notes; share them only with people you trust.</Text>
        {button('Export garden backup', 'export this garden', () => { void run(async () => { await shareBackup(friends) }) })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: 36, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#ddd' },
  title: { fontSize: 20, fontWeight: '600', color: '#1a1a1a', marginBottom: 12 },
  description: { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 12 },
  button: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 8, borderRadius: 10 },
  primary: { backgroundColor: '#4a7c59' },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#4a7c59' },
  primaryText: { color: '#fff' },
  disabled: { opacity: 0.5 },
  input: { height: 160, borderWidth: 1, borderColor: '#bbb', borderRadius: 10, padding: 12, fontSize: 15, color: '#1a1a1a', marginBottom: 8 },
  preview: { marginTop: 16 },
  previewTitle: { fontSize: 17, fontWeight: '600', color: '#1a1a1a', marginBottom: 8 },
  names: { fontSize: 16, color: '#1a1a1a', lineHeight: 24, marginBottom: 16 },
  error: { fontSize: 15, color: '#b4472b', lineHeight: 22, marginVertical: 12 },
  feedback: { fontSize: 15, color: '#356040', lineHeight: 22, marginVertical: 12 },
  export: { marginTop: 24 },
})
