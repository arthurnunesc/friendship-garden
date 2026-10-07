import { StyleSheet, Text, View, TouchableOpacity } from "react-native";

interface EmptyGardenProps {
  onAddFriend: () => void;
  onSettings: () => void;
}

export function EmptyGarden({ onAddFriend, onSettings }: EmptyGardenProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={onSettings}
        activeOpacity={0.6}
      >
        <Text style={styles.settingsIcon}>⚙</Text>
      </TouchableOpacity>

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
  settingsButton: {
    position: 'absolute',
    top: 56,
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 20,
    color: '#888',
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
