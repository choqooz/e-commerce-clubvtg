import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTENT_GUARD_OUTCOME, runContentGuard } from "./content-guard";

function openAIClient({
  moderation,
  vision,
}: {
  moderation: ReturnType<typeof vi.fn>;
  vision: ReturnType<typeof vi.fn>;
}) {
  return {
    chat: { completions: { create: vision } },
    moderations: { create: moderation },
  } as unknown as OpenAI;
}

function approvedModeration() {
  return { results: [{ categories: {}, flagged: false }] };
}

function approvedVision() {
  return {
    choices: [
      {
        message: {
          content: '{"has_person":true,"appropriate":true,"reason":"Apta para probar ropa"}',
        },
      },
    ],
  };
}

afterEach(() => vi.restoreAllMocks());

describe("content guard", () => {
  it("approves an image only after both providers return valid approval results", async () => {
    const moderation = vi.fn().mockResolvedValue(approvedModeration());
    const vision = vi.fn().mockResolvedValue(approvedVision());

    await expect(runContentGuard(openAIClient({ moderation, vision }), Buffer.from("image"))).resolves.toEqual({
      outcome: CONTENT_GUARD_OUTCOME.APPROVED,
    });
  });

  it("rejects moderation-flagged content without calling the vision provider", async () => {
    const moderation = vi.fn().mockResolvedValue({
      results: [{ categories: { sexual: true }, flagged: true }],
    });
    const vision = vi.fn();

    await expect(runContentGuard(openAIClient({ moderation, vision }), Buffer.from("image"))).resolves.toMatchObject({
      code: "nsfw_content",
      outcome: CONTENT_GUARD_OUTCOME.REJECTED,
    });
    expect(vision).not.toHaveBeenCalled();
  });

  it("preserves user-content rejection outcomes from the vision provider", async () => {
    const moderation = vi.fn().mockResolvedValue(approvedModeration());
    const vision = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"has_person":false,"appropriate":true,"reason":"No hay persona"}' } }],
    });

    await expect(runContentGuard(openAIClient({ moderation, vision }), Buffer.from("image"))).resolves.toMatchObject({
      code: "no_person_detected",
      outcome: CONTENT_GUARD_OUTCOME.REJECTED,
    });
  });

  it.each(["", "not json"])("treats empty or malformed vision output as unavailable: %s", async (content) => {
    const moderation = vi.fn().mockResolvedValue(approvedModeration());
    const vision = vi.fn().mockResolvedValue({ choices: [{ message: { content } }] });

    await expect(runContentGuard(openAIClient({ moderation, vision }), Buffer.from("image"))).resolves.toMatchObject({
      code: "content_guard_unavailable",
      outcome: CONTENT_GUARD_OUTCOME.UNAVAILABLE,
    });
  });

  it("treats missing moderation results as unavailable", async () => {
    const moderation = vi.fn().mockResolvedValue({ results: [] });
    const vision = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runContentGuard(openAIClient({ moderation, vision }), Buffer.from("image"))).resolves.toMatchObject({
      code: "content_guard_unavailable",
      outcome: CONTENT_GUARD_OUTCOME.UNAVAILABLE,
    });
    expect(vision).not.toHaveBeenCalled();
  });

  it.each(["moderation", "vision"])("treats %s provider exceptions as unavailable", async (provider) => {
    const moderation = vi.fn().mockResolvedValue(approvedModeration());
    const vision = vi.fn().mockResolvedValue(approvedVision());
    if (provider === "moderation") moderation.mockRejectedValue(new Error("provider failure"));
    else vision.mockRejectedValue(new Error("provider failure"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runContentGuard(openAIClient({ moderation, vision }), Buffer.from("image"))).resolves.toMatchObject({
      code: "content_guard_unavailable",
      outcome: CONTENT_GUARD_OUTCOME.UNAVAILABLE,
    });
  });
});
