import { useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import type { Interaction } from "../garden/Friend";
import { getTypeLabel, formatInteractionDate, sortInteractions } from "./interactionDisplay";

interface InteractionHistoryProps {
  interactions: Interaction[];
}

const MAX_VISIBLE = 4;

export function InteractionHistory({ interactions }: InteractionHistoryProps) {
  const [showAll, setShowAll] = useState(false);

  if (interactions.length === 0) return null;

  const sorted = [...interactions].sort(sortInteractions);
  const visible = showAll ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hasMore = sorted.length > MAX_VISIBLE;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>recent chats</Text>
      {visible.map((interaction) => {
        const typeLabel = getTypeLabel(interaction.type);
        return (
          <View key={interaction.id} style={styles.item}>
            <Text style={styles.date}>
              {formatInteractionDate(interaction.date)}
            </Text>
            {typeLabel && <Text style={styles.typeBadge}>{typeLabel}</Text>}
            {interaction.note ? (
              <Text style={styles.note}>{interaction.note}</Text>
            ) : null}
          </View>
        );
      })}
      {hasMore && (
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => setShowAll(!showAll)}
        >
          <Text style={styles.toggleText}>
            {showAll ? "collapse" : `see all (${sorted.length})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  heading: {
    fontSize: 13,
    fontWeight: "600",
    color: "#888",
    marginBottom: 10,
    textTransform: "lowercase",
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6,
    gap: 8,
  },
  date: {
    fontSize: 13,
    color: "#aaa",
    minWidth: 50,
  },
  typeBadge: {
    fontSize: 12,
    color: "#4a7c59",
    backgroundColor: "#e8f4ea",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  note: {
    fontSize: 13,
    color: "#555",
    flex: 1,
  },
  toggle: {
    marginTop: 8,
    paddingVertical: 6,
  },
  toggleText: {
    fontSize: 13,
    color: "#4a7c59",
    fontWeight: "500",
  },
});
