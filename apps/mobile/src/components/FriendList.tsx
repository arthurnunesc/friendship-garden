import { View, FlatList, Text, StyleSheet } from "react-native";
import type { Friend, InteractionType } from "../garden/Friend";
import {
  deriveWateringState,
  hasUpcomingBirthday,
  sortFriendsByUrgency,
} from "../garden/Friend";
import { FriendListItem } from "./FriendListItem";

interface FriendListProps {
  friends: Friend[];
  onWater: (id: string, type?: InteractionType, note?: string) => void;
  onEdit: (id: string, name: string, birthday: string, cadenceDays: number) => void;
  onRemove: (id: string) => void;
}

function getDaysSince(friend: Friend, now: Date): number {
  if (!friend.lastInteractionAt) return Infinity;
  return (now.getTime() - new Date(friend.lastInteractionAt).getTime()) / 86400000;
}

export function FriendList({
  friends,
  onWater,
  onEdit,
  onRemove,
}: FriendListProps) {
  const now = new Date();
  const sorted = sortFriendsByUrgency(friends, now);

  const firstDryIndex = sorted.findIndex(
    (f) => deriveWateringState(f, now) === "dry",
  );

  return (
    <FlatList
      data={sorted}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item, index }) => {
        const state = deriveWateringState(item, now);
        const needsAttentionHeader =
          state === "dry" && index === firstDryIndex;

        return (
          <View>
            {needsAttentionHeader && (
              <Text style={styles.needsAttention}>may need attention</Text>
            )}
            <FriendListItem
              friend={item}
              wateringState={state}
              daysSince={getDaysSince(item, now)}
              hasBirthday={hasUpcomingBirthday(item, now)}
              onWater={onWater}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  needsAttention: {
    fontSize: 13,
    fontWeight: "500",
    color: "#b0883a",
    marginLeft: 32,
    marginBottom: 2,
    marginTop: 10,
  },
});
