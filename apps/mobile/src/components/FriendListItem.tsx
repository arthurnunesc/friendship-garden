import { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  TextInput,
  Pressable,
} from "react-native";
import type { Friend, WateringState, InteractionType } from "../garden/Friend";
import { INTERACTION_TYPES } from "../garden/Friend";
import { getWateringEmoji, getWateringLabel } from "./WateringIcon";
import { formatRelativeDate } from "../garden/date";
import { InteractionHistory } from "./InteractionHistory";
import { TYPE_LABELS } from "./interactionDisplay";

interface FriendListItemProps {
  friend: Friend;
  wateringState: WateringState;
  daysSince: number;
  hasBirthday: boolean;
  onWater: (id: string, type?: InteractionType, note?: string) => void;
  onEdit: (id: string, name: string, birthday: string, cadenceDays: number) => void;
  onRemove: (id: string) => void;
}

export function FriendListItem({
  friend,
  wateringState,
  hasBirthday,
  onWater,
  onEdit,
  onRemove,
}: FriendListItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [showWaterPopup, setShowWaterPopup] = useState(false);
  const [interactionType, setInteractionType] = useState<
    InteractionType | undefined
  >(undefined);
  const [interactionNote, setInteractionNote] = useState("");

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(friend.name);
  const [editBirthday, setEditBirthday] = useState(friend.birthday ?? "");
  const [editCadenceIndex, setEditCadenceIndex] = useState(() => {
    const idx = CADENCE_VALUES.indexOf(friend.cadenceDays);
    return idx >= 0 ? idx : 1;
  });

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const emoji = getWateringEmoji(wateringState);
  const stateLabel = getWateringLabel(wateringState);

  const handleWater = useCallback(() => {
    onWater(friend.id, interactionType, interactionNote || undefined);
    setShowWaterPopup(false);
    setInteractionType(undefined);
    setInteractionNote("");
    setExpanded(false);
  }, [friend.id, interactionType, interactionNote, onWater]);

  const handleQuickWater = useCallback(() => {
    onWater(friend.id);
  }, [friend.id, onWater]);

  const handleCancelWater = useCallback(() => {
    setShowWaterPopup(false);
    setInteractionType(undefined);
    setInteractionNote("");
  }, []);

  const handleEditSave = useCallback(() => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    onEdit(
      friend.id,
      trimmed,
      editBirthday || undefined as unknown as string,
      CADENCE_VALUES[editCadenceIndex],
    );
    setShowEdit(false);
  }, [friend.id, editName, editBirthday, editCadenceIndex, onEdit]);

  const handleRemove = useCallback(() => {
    onRemove(friend.id);
    setShowRemoveConfirm(false);
  }, [friend.id, onRemove]);

  const waterColor =
    wateringState === "dry"
      ? "#d9744a"
      : wateringState === "nearing"
        ? "#c9a23b"
        : "#4a7c59";

  return (
    <>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.emoji}>{emoji}</Text>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{friend.name}</Text>
              {hasBirthday && <Text style={styles.birthdayBadge}> 🎂</Text>}
            </View>
            <Text style={styles.lastChat}>
              {friend.lastInteractionAt
                ? `last talked ${formatRelativeDate(friend.lastInteractionAt)}`
                : "no chats recorded"}
            </Text>
            <Text style={[styles.stateLabel, { color: waterColor }]}>
              {stateLabel}
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleQuickWater}
              activeOpacity={0.6}
            >
              <Text style={styles.waterIcon}>💦</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowWaterPopup(true)}
              activeOpacity={0.6}
            >
              <Text style={styles.noteIcon}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setExpanded(!expanded)}
              activeOpacity={0.6}
            >
              <Text style={styles.expandIcon}>{expanded ? "▲" : "▼"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {expanded && (
          <View style={styles.expandedSection}>
            <InteractionHistory interactions={friend.interactions} />

            <TouchableOpacity
              style={styles.editButton}
              onPress={() => {
                setEditName(friend.name);
                setEditBirthday(friend.birthday ?? "");
                const idx = CADENCE_VALUES.indexOf(friend.cadenceDays);
                setEditCadenceIndex(idx >= 0 ? idx : 1);
                setShowEdit(true);
              }}
            >
              <Text style={styles.editButtonText}>edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => setShowRemoveConfirm(true)}
            >
              <Text style={styles.removeButtonText}>remove from garden</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal
        visible={showWaterPopup}
        transparent
        animationType="fade"
        onRequestClose={handleCancelWater}
      >
        <Pressable style={styles.overlay} onPress={handleCancelWater}>
          <Pressable style={styles.popup} onPress={() => {}}>
            <Text style={styles.popupTitle}>log a conversation</Text>
            <Text style={styles.popupSubtitle}>with {friend.name}</Text>

            <Text style={styles.popupLabel}>how did you talk?</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[
                  styles.typeChip,
                  !interactionType && styles.typeChipActive,
                ]}
                onPress={() => setInteractionType(undefined)}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    !interactionType && styles.typeChipTextActive,
                  ]}
                >
                  any
                </Text>
              </TouchableOpacity>
              {INTERACTION_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.typeChip,
                    interactionType === t && styles.typeChipActive,
                  ]}
                  onPress={() => setInteractionType(t)}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      interactionType === t && styles.typeChipTextActive,
                    ]}
                  >
                    {TYPE_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.popupLabel}>note (optional)</Text>
            <TextInput
              style={styles.noteInput}
              value={interactionNote}
              onChangeText={setInteractionNote}
              placeholder="what did you talk about?"
              placeholderTextColor="#aaa"
              multiline
              numberOfLines={2}
              returnKeyType="done"
            />

            <View style={styles.popupActions}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleWater}
                activeOpacity={0.7}
              >
                <Text style={styles.saveButtonText}>save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCancelWater}>
                <Text style={styles.cancelText}>cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showEdit}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEdit(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowEdit(false)}
        >
          <Pressable style={styles.popup} onPress={() => {}}>
            <Text style={styles.popupTitle}>edit {friend.name}</Text>

            <Text style={styles.popupLabel}>name</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="name"
              placeholderTextColor="#aaa"
            />

            <Text style={styles.popupLabel}>birthday</Text>
            <TextInput
              style={styles.input}
              value={editBirthday}
              onChangeText={setEditBirthday}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#aaa"
              keyboardType="numbers-and-punctuation"
            />

            <Text style={styles.popupLabel}>cadence</Text>
            <View style={styles.cadenceRow}>
              {CADENCE_OPTIONS.map((option, index) => (
                <TouchableOpacity
                  key={option.days}
                  style={[
                    styles.typeChip,
                    index === editCadenceIndex && styles.typeChipActive,
                  ]}
                  onPress={() => setEditCadenceIndex(index)}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      index === editCadenceIndex && styles.typeChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.popupActions}>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  !editName.trim() && styles.saveButtonDisabled,
                ]}
                onPress={handleEditSave}
                disabled={!editName.trim()}
                activeOpacity={0.7}
              >
                <Text style={styles.saveButtonText}>save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowEdit(false)}>
                <Text style={styles.cancelText}>cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showRemoveConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRemoveConfirm(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowRemoveConfirm(false)}
        >
          <Pressable style={styles.popup} onPress={() => {}}>
            <Text style={styles.popupTitle}>
              remove {friend.name} from your garden?
            </Text>
            <Text style={styles.warningText}>
              This will remove all interaction history for {friend.name}.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.removeConfirmButton}
                onPress={handleRemove}
                activeOpacity={0.7}
              >
                <Text style={styles.removeConfirmText}>yes, remove</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowRemoveConfirm(false)}
              >
                <Text style={styles.cancelText}>cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const CADENCE_OPTIONS = [
  { label: "every week", days: 7 },
  { label: "every 2 weeks", days: 14 },
  { label: "every 3 weeks", days: 21 },
  { label: "every month", days: 30 },
  { label: "every 2 months", days: 60 },
];

const CADENCE_VALUES = CADENCE_OPTIONS.map((o) => o.days);

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  emoji: {
    fontSize: 32,
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  birthdayBadge: {
    fontSize: 16,
  },
  lastChat: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  stateLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  waterIcon: {
    fontSize: 18,
  },
  noteIcon: {
    fontSize: 20,
    color: "#888",
    fontWeight: "600",
  },
  expandIcon: {
    fontSize: 12,
    color: "#888",
  },
  expandedSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  editButton: {
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#f5f5f5",
    marginTop: 12,
  },
  editButtonText: {
    fontSize: 15,
    color: "#555",
  },
  removeButton: {
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    marginTop: 8,
  },
  removeButtonText: {
    fontSize: 15,
    color: "#d9744a",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  popup: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  popupSubtitle: {
    fontSize: 15,
    color: "#888",
    marginBottom: 20,
  },
  popupLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#888",
    marginBottom: 8,
    marginTop: 16,
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "transparent",
  },
  typeChipActive: {
    backgroundColor: "#e8f4ea",
    borderColor: "#4a7c59",
  },
  typeChipText: {
    fontSize: 14,
    color: "#666",
  },
  typeChipTextActive: {
    color: "#4a7c59",
    fontWeight: "500",
  },
  noteInput: {
    fontSize: 15,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    color: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    minHeight: 60,
    textAlignVertical: "top",
  },
  input: {
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    color: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  cadenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  popupActions: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  saveButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: "#4a7c59",
  },
  saveButtonDisabled: {
    backgroundColor: "#a0c4a0",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  cancelText: {
    fontSize: 15,
    color: "#999",
  },
  warningText: {
    fontSize: 14,
    color: "#888",
    lineHeight: 20,
    marginTop: 8,
  },
  confirmActions: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  removeConfirmButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: "#d9744a",
  },
  removeConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
