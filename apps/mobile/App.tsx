import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import { useState } from "react";
import { useGardenStore } from "./src/garden/useGardenStore";
import { asyncStorageStore } from "./src/garden/storage";
import { EmptyGarden } from "./src/components/EmptyGarden";
import { AddFriendForm } from "./src/components/AddFriendForm";
import { PopulatedGarden } from "./src/components/PopulatedGarden";

type ViewState = "loading" | "empty" | "adding" | "populated";

export default function App() {
  const { friends, loaded, addFriend, waterFriend, updateFriend, removeFriend } =
    useGardenStore(asyncStorageStore);

  const viewState: ViewState = !loaded
    ? "loading"
    : friends.length === 0
      ? "empty"
      : "populated";

  const [showAddForm, setShowAddForm] = useState(false);

  if (!loaded) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
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
        <EmptyGarden onAddFriend={() => setShowAddForm(true)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <PopulatedGarden
        friends={friends}
        onAddFriend={() => setShowAddForm(true)}
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
