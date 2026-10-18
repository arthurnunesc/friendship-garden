import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'
import { asyncStorageStore } from '../garden/storage'
import { createGardenAccount } from './gardenAccount'
import { createNativeAccountClient } from './accountClient'
import { createNativeAuth } from './nativeAuth'

function createRuntime() {
  const origin = process.env.EXPO_PUBLIC_ACCOUNT_ORIGIN
  if (!origin || Platform.OS === 'web') return null
  try {
    const auth = createNativeAuth({
      origin,
      fence: {
        getItem: (key) => AsyncStorage.getItem(key + '.signout-fence'),
        setItem: (key, value) => AsyncStorage.setItem(key + '.signout-fence', value),
      },
      secure: {
        getItem: (key) => SecureStore.getItemAsync(key),
        setItem: (key, value) => SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      },
      randomState: async () => [...await Crypto.getRandomBytesAsync(32)]
        .map(byte => byte.toString(16).padStart(2, '0')).join(''),
      openBrowser: (url, callback) => WebBrowser.openAuthSessionAsync(url, callback, { preferEphemeralSession: true }),
    })
    const account = createGardenAccount({
      guest: asyncStorageStore,
      persistence: {
        getItem: (key) => AsyncStorage.getItem(origin + ':' + key),
        setItem: (key, value) => AsyncStorage.setItem(origin + ':' + key, value),
      },
      client: createNativeAccountClient({ origin, auth }),
      clock: () => ({ updatedAt: new Date().toISOString(), changeId: Crypto.randomUUID() }),
    })
    return { account, auth }
  } catch { return null }
}

// One native writer per running app, including React effect remounts.
export const nativeAccount = createRuntime()
