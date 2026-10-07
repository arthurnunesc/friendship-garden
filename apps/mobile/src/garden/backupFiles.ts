import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { exportGarden, type Friend } from './Friend'

export async function pickBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (result.canceled) return null
  const file = new File(result.assets[0].uri)
  try {
    return await file.text()
  } finally {
    if (file.uri.startsWith(Paths.cache.uri)) file.delete()
  }
}

export async function shareBackup(friends: Friend[]): Promise<void> {
  if (!await Sharing.isAvailableAsync()) {
    throw new Error('File sharing is not available on this device.')
  }
  const file = new File(Paths.cache, `friendship-garden-${Date.now()}.json`)
  try {
    file.write(JSON.stringify(exportGarden(friends), null, 2))
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Save or share your garden backup',
    })
  } finally {
    if (file.exists) file.delete()
  }
}
