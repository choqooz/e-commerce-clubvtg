import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructors: [] as Array<Record<string, unknown>>,
  edit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({
  default: class MockOpenAI {
    images = { edit: mocks.edit };

    constructor(options: Record<string, unknown>) {
      mocks.constructors.push(options);
    }
  },
}));

import { generateTryOn } from "./openai";

const models = {
  flare: "gpt-image-2.5-flare-2026-09-08",
  legacy: "gpt-image-1.5",
  sunburst: "gpt-image-2.5-sunburst-2026-09-08",
};

function request(dimensions = { width: 100, height: 200 }) {
  return generateTryOn(
    Buffer.from("user"),
    "https://product.invalid/image.jpg",
    "try-on prompt",
    dimensions,
  );
}

function latestRequest() {
  return mocks.edit.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_TRYON_MODEL;
  mocks.edit.mockResolvedValue({ data: [{ b64_json: "image-base64" }] });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(Buffer.from("product")));
});

afterEach(() => {
  mocks.constructors.length = 0;
  mocks.edit.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_TRYON_MODEL;
});

describe("generateTryOn", () => {
  it("defaults to pinned Flare with the production Images Edit request and return shape", async () => {
    await expect(request()).resolves.toEqual({ imageBase64: "image-base64" });

    expect(mocks.constructors).toEqual([{ apiKey: "test-key" }]);
    expect(latestRequest()).toMatchObject({
      model: models.flare,
      output_format: "jpeg",
      prompt: "try-on prompt",
      quality: "medium",
      size: "1024x1536",
    });
    expect(latestRequest()).not.toHaveProperty("input_fidelity");
  });

  it("uses legacy 1.5 as the explicit rollback with high input fidelity", async () => {
    process.env.OPENAI_TRYON_MODEL = models.legacy;

    await request();

    expect(latestRequest()).toMatchObject({ input_fidelity: "high", model: models.legacy });
  });

  it("allows pinned Sunburst and omits legacy fidelity for 2.5", async () => {
    process.env.OPENAI_TRYON_MODEL = models.sunburst;

    await request();

    expect(latestRequest()).toMatchObject({ model: models.sunburst });
    expect(latestRequest()).not.toHaveProperty("input_fidelity");
  });

  it("fails closed before any provider work for an invalid model override", async () => {
    process.env.OPENAI_TRYON_MODEL = "gpt-image-unpinned";

    await expect(request()).rejects.toThrow("Invalid OPENAI_TRYON_MODEL");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it.each([
    [{ width: 100, height: 200 }, "1024x1536"],
    [{ width: 200, height: 100 }, "1536x1024"],
    [{ width: 100, height: 100 }, "1024x1024"],
  ])("keeps the orientation size %s", async (dimensions, size) => {
    await request(dimensions);

    expect(latestRequest()).toMatchObject({ size });
  });

  it("retries one transient Images Edit failure", async () => {
    mocks.edit
      .mockRejectedValueOnce(Object.assign(new Error("temporary"), { status: 500 }))
      .mockResolvedValueOnce({ data: [{ b64_json: "image-base64" }] });
    vi.useFakeTimers();

    const result = request();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toEqual({ imageBase64: "image-base64" });
    expect(mocks.edit).toHaveBeenCalledTimes(2);
  });

  it("rejects an Images Edit response without image data", async () => {
    mocks.edit.mockResolvedValue({ data: [] });

    await expect(request()).rejects.toThrow("OpenAI returned no image data");
  });
});
