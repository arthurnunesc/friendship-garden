import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import type { useReminders } from '../reminders/useReminders'
import { BackupSection } from './BackupSection'
import type { Friend, ImportError, ImportResult } from '../garden/Friend'

interface ReminderSettingsProps {
  reminders: ReturnType<typeof useReminders>
  onClose: () => void
  friends: Friend[]
  onImport(payload: unknown): Promise<ImportResult | ImportError>
  accountSection?: ReactNode
}

export function ReminderSettings({ reminders, onClose, friends, onImport, accountSection }: ReminderSettingsProps) {
  const [timeDraft, setTimeDraft] = useState(reminders.settings.preferredTime)
  const [deviceSettingsError, setDeviceSettingsError] = useState<string | null>(null)

  useEffect(() => {
    setTimeDraft(reminders.settings.preferredTime)
  }, [reminders.settings.preferredTime])

  const openDeviceSettings = async () => {
    try {
      await Linking.openSettings()
      setDeviceSettingsError(null)
    } catch {
      setDeviceSettingsError('Could not open device settings.')
    }
  }

  const remindersActive = reminders.settings.enabled && reminders.permissionStatus === 'granted'
  const controlsDisabled = !reminders.loaded || reminders.busy

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.header}>
        <Text style={styles.title}>settings</Text>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
          style={styles.closeTarget}
        >
          <Text style={styles.closeButton}>done</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.explanation}>
        Friendship Garden can gently remind you when someone may need attention.
      </Text>

      {!reminders.loaded && (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>
            {reminders.error ? 'Could not load saved reminder settings.' : 'Loading reminder settings…'}
          </Text>
          {reminders.error && (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => { void reminders.retryLoad() }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Retry loading reminder settings"
            >
              <Text style={styles.retryButtonText}>retry</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>enable reminders</Text>
          {reminders.permissionStatus === 'denied' && (
            <Text style={styles.deniedHint}>notifications are disabled at the OS level</Text>
          )}
        </View>
        <Switch
          value={remindersActive}
          onValueChange={(value) => { void reminders.setEnabled(value) }}
          trackColor={{ false: '#ddd', true: '#4a7c59' }}
          thumbColor={Platform.OS === 'android' ? '#f4f3f4' : '#fff'}
          disabled={controlsDisabled}
          accessibilityLabel="Enable reminders"
        />
      </View>

      {reminders.loaded && reminders.permissionStatus === 'denied' && (
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>
            Notifications are currently denied. Enable them in your device settings to receive reminders.
          </Text>
          {reminders.settings.enabled && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => { void reminders.setEnabled(false) }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Turn off saved reminders"
            >
              <Text style={styles.secondaryButtonText}>turn off saved reminders</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={() => { void openDeviceSettings() }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open device settings"
          >
            <Text style={styles.permissionButtonText}>open device settings</Text>
          </TouchableOpacity>
          {deviceSettingsError && <Text style={styles.errorText}>{deviceSettingsError}</Text>}
        </View>
      )}

      <View style={styles.timeSection}>
        <Text style={styles.sectionLabel}>preferred reminder time</Text>
        <Text style={styles.timeHint}>reminders will arrive around your chosen time</Text>
        <View style={styles.timeRow}>
          <TextInput
            value={timeDraft}
            onChangeText={setTimeDraft}
            placeholder="09:00"
            autoCapitalize="none"
            autoCorrect={false}
            editable={reminders.loaded && !reminders.busy}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            style={[styles.timeInput, controlsDisabled && styles.disabledInput]}
            accessibilityLabel="Preferred reminder time, 24 hour format"
          />
          <TouchableOpacity
            style={[styles.saveButton, controlsDisabled && styles.disabledButton]}
            onPress={() => { void reminders.setTime(timeDraft) }}
            disabled={controlsDisabled}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Save preferred reminder time"
          >
            <Text style={styles.saveButtonText}>save time</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.formatHint}>Use 24-hour time, for example 18:30.</Text>
      </View>

      {reminders.error && <Text style={styles.errorText} accessibilityRole="alert">{reminders.error}</Text>}
      {accountSection}
      <BackupSection friends={friends} onImport={onImport} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingTop: 56, paddingHorizontal: 24, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a1a' },
  closeTarget: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  closeButton: { fontSize: 17, color: '#4a7c59', fontWeight: '500' },
  explanation: { fontSize: 15, color: '#666', lineHeight: 22, marginBottom: 24 },
  loadingBox: { marginBottom: 16, padding: 12, borderRadius: 10, backgroundColor: '#f5f5f2' },
  loadingText: { fontSize: 14, color: '#666', lineHeight: 20 },
  retryButton: { minHeight: 44, marginTop: 6, alignSelf: 'flex-start', justifyContent: 'center' },
  retryButtonText: { fontSize: 14, fontWeight: '600', color: '#4a7c59' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 56, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowText: { flex: 1, marginRight: 16 },
  rowLabel: { fontSize: 17, color: '#1a1a1a' },
  deniedHint: { fontSize: 13, color: '#d9744a', marginTop: 4 },
  permissionBox: { backgroundColor: '#fdf6f0', borderRadius: 12, padding: 16, marginTop: 16 },
  permissionText: { fontSize: 14, color: '#888', lineHeight: 20 },
  permissionButton: { minHeight: 44, marginTop: 12, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#4a7c59', alignSelf: 'flex-start', justifyContent: 'center' },
  permissionButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  secondaryButton: { minHeight: 44, marginTop: 12, paddingHorizontal: 4, justifyContent: 'center', alignSelf: 'flex-start' },
  secondaryButtonText: { fontSize: 14, fontWeight: '600', color: '#4a7c59' },
  timeSection: { marginTop: 28 },
  sectionLabel: { fontSize: 15, fontWeight: '500', color: '#1a1a1a', marginBottom: 4 },
  timeHint: { fontSize: 13, color: '#999', marginBottom: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#d7d7d7', borderRadius: 10, paddingHorizontal: 12, fontSize: 17, color: '#1a1a1a' },
  disabledInput: { backgroundColor: '#f0f0f0', color: '#888' },
  saveButton: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10, backgroundColor: '#4a7c59' },
  disabledButton: { opacity: 0.5 },
  saveButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  formatHint: { marginTop: 8, fontSize: 13, color: '#999' },
  errorText: { marginTop: 12, fontSize: 14, color: '#b4472b', lineHeight: 20 },
})
