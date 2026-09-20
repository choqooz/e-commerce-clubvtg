import OpenAI from "openai";

const TRY_ON_MODELS = {
  LEGACY: "gpt-image-1.5",
  FLARE: "gpt-image-2.5-flare-2026-09-08",
  SUNBURST: "gpt-image-2.5-sunburst-2026-09-08",
} as const;

type TryOnModel = (typeof TRY_ON_MODELS)[keyof typeof TRY_ON_MODELS];

let _openai: OpenAI | null = null;

function isTryOnModel(value: string): value is TryOnModel {
  return Object.values(TRY_ON_MODELS).includes(value as TryOnModel);
}

function resolveTryOnModel(): TryOnModel {
  const model = process.env.OPENAI_TRYON_MODEL;

  if (model !== undefined && !isTryOnModel(model)) {
    throw new Error("Invalid OPENAI_TRYON_MODEL; set it to gpt-image-1.5 to roll back");
  }

  return model ?? TRY_ON_MODELS.FLARE;
}

export function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY env var");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function generateTryOn(
  userImageBuffer: Buffer,
  productImageUrl: string,
  prompt: string,
  dimensions: { width: number; height: number },
): Promise<{ imageBase64: string }> {
  const model = resolveTryOnModel();
  const openai = getOpenAI();

  // Determine size based on orientation
  const size =
    dimensions.height > dimensions.width
      ? "1024x1536"
      : dimensions.width > dimensions.height
        ? "1536x1024"
        : "1024x1024";

  // Fetch product image
  const productResponse = await fetch(productImageUrl);
  const productBuffer = Buffer.from(await productResponse.arrayBuffer());

  // Create File objects with JPEG mime (use Uint8Array to satisfy BlobPart)
  const userFile = new File([new Uint8Array(userImageBuffer)], "user.jpg", {
    type: "image/jpeg",
  });
  const productFile = new File([new Uint8Array(productBuffer)], "product.jpg", {
    type: "image/jpeg",
  });

  // Call with retry
  async function callOpenAI() {
    return openai.images.edit({
      model: model as "gpt-image-1.5",
      image: [userFile, productFile],
      prompt,
      size: size as "1024x1536" | "1536x1024" | "1024x1024",
      quality: "medium",
      ...(model === TRY_ON_MODELS.LEGACY ? { input_fidelity: "high" as const } : {}),
      output_format: "jpeg",
    });
  }

  const maxRetries = 2;
  let response: Awaited<ReturnType<typeof callOpenAI>> | undefined;

  for (let attempt = 1; ; attempt++) {
    try {
      response = await callOpenAI();
      break;
    } catch (error: unknown) {
      const status =
        error instanceof Error && "status" in error ? (error as { status: number }).status : 0;
      const isTransient = status === 0 || status === 429 || status >= 500;

      if (!isTransient || attempt >= maxRetries) {
        throw error;
      }
      // Only retry transient errors (5xx, 429, network)
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  const imageBase64 = response?.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("OpenAI returned no image data");
  }

  return { imageBase64 };
}
