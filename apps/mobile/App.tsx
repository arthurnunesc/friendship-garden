import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
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
  const { friends, loaded, addFriend, waterFriend, updateFriend, removeFriend, importGarden } =
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
          onSubmit={(data) => {
            addFriend(data);
            setShowAddForm(false);
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
  app: {
    flex: 1,
    backgroundColor: "#fafafa",
  },
});
