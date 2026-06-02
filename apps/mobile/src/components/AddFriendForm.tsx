import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { DEFAULT_CADENCE_DAYS } from "../garden/Friend";

interface AddFriendFormProps {
  onSubmit: (data: { name: string; birthday?: string; cadenceDays?: number }) => void;
  onCancel: () => void;
}

const CADENCE_OPTIONS: { label: string; days: number }[] = [
  { label: "every week", days: 7 },
  { label: "every 2 weeks", days: 14 },
  { label: "every 3 weeks", days: 21 },
  { label: "every month", days: 30 },
  { label: "every 2 months", days: 60 },
];

export function AddFriendForm({ onSubmit, onCancel }: AddFriendFormProps) {
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [cadenceDays, setCadenceDays] = useState(DEFAULT_CADENCE_DAYS);
  const [showDetails, setShowDetails] = useState(false);
  const [cadenceIndex, setCadenceIndex] = useState(1);

  const trimmed = name.trim();
  const isValid = trimmed.length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({
      name: trimmed,
      birthday: birthday || undefined,
      cadenceDays,
    });
  };

  const handleCadenceChange = (index: number) => {
    setCadenceIndex(index);
    setCadenceDays(CADENCE_OPTIONS[index].days);
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>add someone to your garden</Text>

        <Text style={styles.label}>name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="friend's name"
          placeholderTextColor="#aaa"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <TouchableOpacity
          style={styles.detailsToggle}
          onPress={() => setShowDetails(!showDetails)}
        >
          <Text style={styles.detailsToggleText}>
            {showDetails ? "▾ less options" : "▸ more options"}
          </Text>
        </TouchableOpacity>

        {showDetails && (
          <View style={styles.detailsSection}>
            <Text style={styles.label}>birthday</Text>
            <TextInput
              style={styles.input}
              value={birthday}
              onChangeText={setBirthday}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#aaa"
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
            />

            <Text style={styles.label}>contact cadence</Text>
            <View style={styles.cadenceRow}>
              {CADENCE_OPTIONS.map((option, index) => (
                <TouchableOpacity
                  key={option.days}
                  style={[
                    styles.cadenceChip,
                    index === cadenceIndex && styles.cadenceChipActive,
                  ]}
                  onPress={() => handleCadenceChange(index)}
                >
                  <Text
                    style={[
                      styles.cadenceChipText,
                      index === cadenceIndex && styles.cadenceChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.submitButton, !isValid && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isValid}
            activeOpacity={0.7}
          >
            <Text style={styles.submitText}>add to garden</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  container: {
    padding: 24,
    paddingBottom: 48,
  },
  heading: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#888",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    fontSize: 17,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    color: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  detailsToggle: {
    marginTop: 16,
    paddingVertical: 8,
  },
  detailsToggleText: {
    fontSize: 15,
    color: "#4a7c59",
    fontWeight: "500",
  },
  detailsSection: {
    marginBottom: 8,
  },
  cadenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cadenceChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "transparent",
  },
  cadenceChipActive: {
    backgroundColor: "#e8f4ea",
    borderColor: "#4a7c59",
  },
  cadenceChipText: {
    fontSize: 14,
    color: "#666",
  },
  cadenceChipTextActive: {
    color: "#4a7c59",
    fontWeight: "500",
  },
  actions: {
    marginTop: 32,
    gap: 12,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#4a7c59",
    alignItems: "center",
  },
  submitButtonDisabled: {
    backgroundColor: "#a0c4a0",
  },
  submitText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    color: "#999",
  },
});
