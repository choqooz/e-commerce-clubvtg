import { describe, expect, it } from "vitest";
import { parseSSEErrorEvent } from "./sse";

describe("parseSSEErrorEvent", () => {
  it("returns a valid error event from an SSE response body", () => {
    expect(
      parseSSEErrorEvent(
        'data: {"type":"error","message":"No se pudo verificar el contenido de la imagen. Intentá de nuevo.","code":"content_guard_unavailable"}\n\n',
      ),
    ).toEqual({
      code: "content_guard_unavailable",
      message: "No se pudo verificar el contenido de la imagen. Intentá de nuevo.",
      type: "error",
    });
  });

  it.each(["", "data: not-json\n\n", 'data: {"type":"progress"}\n\n'])(
    "rejects empty or malformed error bodies: %s",
    (body) => {
      expect(parseSSEErrorEvent(body)).toBeNull();
    },
  );
});
