import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import type { Friend, InteractionType } from "../garden/Friend";
import { FriendList } from "./FriendList";

interface PopulatedGardenProps {
  friends: Friend[];
  onAddFriend: () => void;
  onWater: (id: string, type?: InteractionType, note?: string) => void;
  onEdit: (id: string, name: string, birthday: string, cadenceDays: number) => void;
  onRemove: (id: string) => void;
}

export function PopulatedGarden({
  friends,
  onAddFriend,
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
        <Text style={styles.title}>Friendship Garden</Text>
        <Text style={styles.count}>{countLabel}</Text>
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
