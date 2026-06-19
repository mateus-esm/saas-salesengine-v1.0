import {
  formatCopilotActivity,
  stringifyCopilotPayload,
} from "@/lib/copilotActivity";

const DEFAULT_LEAD_NAME = "este lead";

export function humanizeCopilotAction(
  action: unknown,
  leadName = DEFAULT_LEAD_NAME,
): string {
  return `${formatCopilotActivity(action, { leadName }).title}?`;
}

export function stringifyActionDetails(action: unknown): string {
  return stringifyCopilotPayload(action);
}
