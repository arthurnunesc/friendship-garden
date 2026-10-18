import { useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import type { GardenAccount, GardenAccountState } from '../sync/gardenAccount'

interface AccountSectionProps {
  account: GardenAccount
  state: GardenAccountState
}

export function AccountSection({ account, state }: AccountSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const working = useRef(false)
  const blocked = busy || state.phase === 'checking' || state.phase === 'syncing'
  const viewingAccount = state.user !== null && state.viewAccount?.id === state.user.id

  const run = async (action: () => Promise<void>, success?: string, allowDuringSync = false) => {
    if (working.current || state.phase === 'checking' || (state.phase === 'syncing' && !allowDuringSync)) return
    working.current = true
    setBusy(true)
    setNotice(null)
    try {
      await action()
      if (success) setNotice(success)
    } catch {
      setNotice('Could not complete that account action. Please try again.')
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  const action = (label: string, onPress: () => void, primary = false, disabled = blocked, key?: string) => (
    <TouchableOpacity
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: disabled && blocked }}
      activeOpacity={0.7}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, primary && styles.primaryAction, disabled && styles.disabled]}
    >
      <Text style={[styles.actionText, primary && styles.primaryActionText]}>{label}</Text>
    </TouchableOpacity>
  )

  return (
    <View style={styles.section}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Account and sync"
        accessibilityState={{ expanded }}
        activeOpacity={0.7}
        onPress={() => { setExpanded((value) => !value) }}
        style={styles.summary}
      >
        <View style={styles.summaryText}>
          <Text style={styles.title}>account &amp; sync</Text>
          <Text style={styles.summaryHint}>{expanded ? 'hide account settings' : 'sign in or view saved gardens'}</Text>
        </View>
        <Text style={styles.disclosure}>{expanded ? 'hide' : 'show'}</Text>
      </TouchableOpacity>

      {expanded && <View style={styles.content}>
        {state.user ? <>
          <Text style={styles.body}>signed in as <Text style={styles.email}>{state.user.email}</Text></Text>
          {viewingAccount ? <>
            <Text style={styles.body}>this account garden is saved here and synced across your devices. your original local garden is kept separately.</Text>
            {action(state.phase === 'syncing' ? 'syncing…' : 'sync now', () => { void run(() => account.sync()) }, true)}
          </> : <>
            <Text style={styles.body}>signing in has not uploaded your local garden.</Text>
            <Text style={styles.body}>enable sync to store friendship details on our server. you can merge this device’s local garden, or use only the account garden. the original local copy stays here.</Text>
            {action('merge local garden & sync', () => { void run(() => account.enable('import')) }, true)}
            {action('use account garden only', () => { void run(() => account.enable('account')) })}
            <Text style={styles.hint}>not ready? close this section to keep using your local garden.</Text>
          </>}
          {action('sign out & return to local garden', () => { void run(() => account.signOut(), undefined, true) }, false, busy || state.phase === 'checking')}
        </> : <>
          {state.viewAccount && <Text style={styles.body}>showing the saved account copy for <Text style={styles.email}>{state.viewAccount.email}</Text>. sign in again to sync it.</Text>}
          <Text style={styles.body}>your local garden stays on this device. sign in if you want to sync across devices; nothing is uploaded until you choose.</Text>
          {action('continue with google', () => {
            void run(async () => {
              await account.client.google()
              await account.refresh()
            })
          }, true)}
          <Text style={styles.label}>or sign in by email</Text>
          <TextInput
            accessibilityLabel="Email address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!blocked}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#666"
            textContentType="emailAddress"
            value={email}
            style={[styles.input, blocked && styles.disabledInput]}
          />
          {action('email a sign-in link', () => {
            void run(() => account.client.email(email.trim()), 'check your email for a sign-in link. it expires in five minutes. open it on this device to sign in.')
          }, true, blocked || !email.trim())}
          {action('check sign-in / retry connection', () => { void run(() => account.refresh()) })}
          {account.savedAccounts().map((user) => action(`open saved garden: ${user.email}`, () => {
            void run(() => account.openOffline(user.id))
          }, false, blocked, user.id))}
        </>}
        {state.phase === 'checking' && <Text accessibilityLiveRegion="polite" style={styles.status}>checking your account…</Text>}
        {state.phase === 'syncing' && <Text accessibilityLiveRegion="polite" style={styles.status}>syncing your account garden…</Text>}
        {state.phase === 'ready' && <Text accessibilityLiveRegion="polite" style={styles.status}>up to date</Text>}
        {state.phase === 'offline' && <Text accessibilityLiveRegion="polite" style={styles.status}>saved on this device</Text>}
        {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
        {state.error && state.user && action('reconnect / check sign-in', () => { void run(() => account.refresh()) })}
        {notice && <Text accessibilityLiveRegion="polite" style={styles.status}>{notice}</Text>}
      </View>}
    </View>
  )
}

export default AccountSection

const styles = StyleSheet.create({
  section: { marginTop: 36, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#ddd' },
  summary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { flex: 1, paddingRight: 16 },
  title: { fontSize: 20, fontWeight: '600', color: '#1a1a1a' },
  summaryHint: { marginTop: 3, fontSize: 14, color: '#555', lineHeight: 20 },
  disclosure: { fontSize: 16, fontWeight: '600', color: '#4a7c59' },
  content: { paddingTop: 16 },
  body: { fontSize: 15, color: '#1a1a1a', lineHeight: 22, marginBottom: 12 },
  email: { fontWeight: '600' },
  hint: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 8 },
  label: { fontSize: 15, fontWeight: '500', color: '#1a1a1a', marginTop: 8, marginBottom: 6 },
  input: { minHeight: 48, width: '100%', borderWidth: 1, borderColor: '#bbb', borderRadius: 10, paddingHorizontal: 12, fontSize: 17, color: '#1a1a1a', marginBottom: 8 },
  action: { minHeight: 48, width: '100%', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, marginBottom: 8 },
  primaryAction: { backgroundColor: '#4a7c59' },
  actionText: { fontSize: 16, fontWeight: '600', color: '#4a7c59', textAlign: 'center', lineHeight: 22 },
  primaryActionText: { color: '#fff' },
  disabled: { opacity: 0.5 },
  disabledInput: { backgroundColor: '#f0f0f0', color: '#666' },
  status: { fontSize: 15, color: '#356040', lineHeight: 22, marginTop: 4 },
  error: { fontSize: 15, color: '#b4472b', lineHeight: 22, marginTop: 4 },
})
