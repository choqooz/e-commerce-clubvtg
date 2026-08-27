import type { TryOnErrorEvent } from "@/lib/types";

function isTryOnErrorEvent(value: unknown): value is TryOnErrorEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    "type" in value &&
    value.type === "error" &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

export function parseSSEErrorEvent(body: string): TryOnErrorEvent | null {
  for (const event of body.split("\n\n")) {
    if (!event.startsWith("data: ")) continue;

    try {
      const parsed: unknown = JSON.parse(event.slice(6));
      if (isTryOnErrorEvent(parsed)) return parsed;
    } catch {}
  }

  return null;
}
