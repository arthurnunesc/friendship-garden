import { StyleSheet, Text, View } from "react-native";

interface EmptyGardenProps {
  onAddFriend: () => void;
}

export function EmptyGarden({ onAddFriend }: EmptyGardenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🌱</Text>
      <Text style={styles.title}>Friendship Garden</Text>
      <Text style={styles.subtitle}>
        Your garden is quiet right now. Add someone you want to keep close.
      </Text>
      <Text style={styles.addPrompt} onPress={onAddFriend}>
        + add your first friend
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  addPrompt: {
    fontSize: 17,
    color: "#4a7c59",
    fontWeight: "500",
  },
});
