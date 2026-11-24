import type { WateringState } from "../garden/Friend";

const EMOJI: Record<WateringState, string> = {
  dry: "🥀",
  nearing: "🌿",
  watered: "🪴",
};

const LABEL: Record<WateringState, string> = {
  dry: "may need attention",
  nearing: "nearing",
  watered: "doing well",
};

export function getWateringEmoji(state: WateringState): string {
  return EMOJI[state];
}

export function getWateringLabel(state: WateringState): string {
  return LABEL[state];
}
