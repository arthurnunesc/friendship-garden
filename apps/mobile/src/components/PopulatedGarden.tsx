import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import type { Friend, InteractionType } from "../garden/Friend";
import { FriendList } from "./FriendList";

interface PopulatedGardenProps {
  friends: Friend[];
  onAddFriend: () => void;
  onSettings: () => void;
  onWater: (id: string, type?: InteractionType, note?: string) => Promise<boolean> | boolean | void;
  onEdit: (id: string, name: string, birthday: string, cadenceDays: number) => Promise<boolean> | boolean | void;
  onRemove: (id: string) => Promise<boolean> | boolean | void;
}

export function PopulatedGarden({
  friends,
  onAddFriend,
  onSettings,
  onWater,
  onEdit,
  onRemove,
}: PopulatedGardenProps) {
  const countLabel =
    friends.length === 1
      ? "your garden has 1 plant"
      : `your garden has ${friends.length} plants`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.title}>Friendship Garden</Text>
            <Text style={styles.count}>{countLabel}</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={onSettings}
            activeOpacity={0.6}
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FriendList
        friends={friends}
        onWater={onWater}
        onEdit={onEdit}
        onRemove={onRemove}
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={onAddFriend}
        activeOpacity={0.7}
      >
        <Text style={styles.addButtonText}>+ add a friend</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTextCol: {
    flex: 1,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  settingsIcon: {
    fontSize: 20,
    color: '#888',
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  count: {
    fontSize: 14,
    color: "#888",
  },
  addButton: {
    paddingVertical: 14,
    marginHorizontal: 24,
    marginBottom: 32,
    borderRadius: 14,
    backgroundColor: "#4a7c59",
    alignItems: "center",
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
