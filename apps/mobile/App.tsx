import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useState } from "react";
import { useGardenStore } from "./src/garden/useGardenStore";
import { asyncStorageStore } from "./src/garden/storage";
import { EmptyGarden } from "./src/components/EmptyGarden";
import { AddFriendForm } from "./src/components/AddFriendForm";
import { PopulatedGarden } from "./src/components/PopulatedGarden";
import { ReminderSettings } from "./src/components/ReminderSettings";
import { useReminders } from "./src/reminders/useReminders";

type ViewState = "loading" | "empty" | "adding" | "populated";

export default function App() {
  const { friends, loaded, error, retryLoad, addFriend, waterFriend, updateFriend, removeFriend, importGarden } =
    useGardenStore(asyncStorageStore);
  const reminders = useReminders(friends, loaded);

  const viewState: ViewState = !loaded
    ? "loading"
    : friends.length === 0
      ? "empty"
      : "populated";

  const [showAddForm, setShowAddForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (!loaded) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
        <Text style={styles.loadMessage} accessibilityRole={error ? 'alert' : undefined}>
          {error ?? 'loading your garden…'}
        </Text>
        {error && <TouchableOpacity style={styles.retry} accessibilityRole="button"
          onPress={() => { void retryLoad() }}><Text style={styles.retryText}>retry loading garden</Text></TouchableOpacity>}
      </SafeAreaView>
    );
  }

  if (showSettings) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
        <ReminderSettings
          reminders={reminders}
          friends={friends}
          onImport={importGarden}
          onClose={() => setShowSettings(false)}
        />
      </SafeAreaView>
    );
  }

  if (showAddForm) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
        <AddFriendForm
          onSubmit={async (data) => {
            const saved = await addFriend(data);
            if (saved) setShowAddForm(false);
            return saved;
          }}
          onCancel={() => setShowAddForm(false)}
        />
      </SafeAreaView>
    );
  }

  if (viewState === "empty") {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
        <EmptyGarden
          onAddFriend={() => setShowAddForm(true)}
          onSettings={() => setShowSettings(true)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <PopulatedGarden
        friends={friends}
        onAddFriend={() => setShowAddForm(true)}
        onSettings={() => setShowSettings(true)}
        onWater={(id, type, note) => waterFriend(id, type, note)}
        onEdit={(id, name, birthday, cadenceDays) =>
          updateFriend(id, { name, birthday: birthday || undefined, cadenceDays })
        }
        onRemove={removeFriend}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadMessage: { color: '#555', padding: 24, fontSize: 15, lineHeight: 22 },
  retry: { minHeight: 48, marginHorizontal: 24, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: '#4a7c59', borderRadius: 14 },
  retryText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  error: { color: '#b4472b', paddingHorizontal: 24, paddingVertical: 12, fontSize: 14, lineHeight: 20 },
  app: {
    flex: 1,
    backgroundColor: "#fafafa",
  },
});
