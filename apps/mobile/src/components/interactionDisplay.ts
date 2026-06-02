import type { Interaction } from "../garden/Friend";

export const TYPE_LABELS: Record<string, string> = {
  message: "message",
  call: "call",
  "in-person": "in person",
};

export function getTypeLabel(type?: string): string | undefined {
  if (!type) return undefined;
  return TYPE_LABELS[type] ?? type;
}

export function formatInteractionDate(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  return `${diffMonths}mo ago`;
}

export function sortInteractions(a: Interaction, b: Interaction): number {
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}
