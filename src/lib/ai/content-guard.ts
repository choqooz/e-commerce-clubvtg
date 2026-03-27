import type OpenAI from "openai";

export interface ContentGuardResult {
  approved: boolean;
  reason?: string;
  code?: "nsfw_content" | "no_person_detected" | "inappropriate_image";
}

/**
 * Step 1: OpenAI Moderation API (FREE)
 * Checks for NSFW, violence, hate, self-harm via omni-moderation-latest.
 */
async function moderateImage(
  openai: OpenAI,
  imageBase64: string,
): Promise<{ flagged: boolean; categories?: string[] }> {
  const response = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: [
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${imageBase64}`,
        },
      },
    ],
  });

  const result = response.results[0];
  if (!result) return { flagged: false };

  if (result.flagged) {
    const flaggedCategories = Object.entries(result.categories)
      .filter(([, flagged]) => flagged)
      .map(([category]) => category);
    return { flagged: true, categories: flaggedCategories };
  }

  return { flagged: false };
}

/**
 * Step 2: GPT-4o-mini Vision Guard (~$0.003-0.005)
 * Checks if image contains a real person suitable for virtual try-on.
 */
async function validatePersonInImage(
  openai: OpenAI,
  imageBase64: string,
): Promise<ContentGuardResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 100,
    messages: [
      {
        role: "system",
        content:
          "You are an image validator for a virtual clothing try-on app. Respond ONLY with valid JSON. No markdown, no extra text.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: 'Analyze this image for a virtual try-on clothing app. Answer in JSON format: {"has_person": boolean, "appropriate": boolean, "reason": string}. Rules: has_person=true if there is a clearly visible human person (partial or full body). appropriate=true if the image is suitable for a clothing try-on (no explicit nudity, no offensive content, no memes, no screenshots, no drawings/cartoons — only real photographs of real people). Keep reason under 15 words in Spanish.',
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    // Fail open — don't block legitimate users if the guard itself errors
    return { approved: true };
  }

  try {
    const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      has_person: boolean;
      appropriate: boolean;
      reason: string;
    };

    if (!parsed.has_person) {
      return {
        approved: false,
        reason: parsed.reason || "No se detectó una persona en la imagen",
        code: "no_person_detected",
      };
    }

    if (!parsed.appropriate) {
      return {
        approved: false,
        reason:
          parsed.reason ||
          "La imagen no es apropiada para el probador virtual",
        code: "inappropriate_image",
      };
    }

    return { approved: true };
  } catch {
    // Fail open on JSON parse error
    return { approved: true };
  }
}

/**
 * Combined content guard: Moderation (free) → Person detection (~$0.004).
 * Fails open — if the guard itself throws, it returns approved: true.
 */
export async function runContentGuard(
  openai: OpenAI,
  imageBuffer: Buffer,
): Promise<ContentGuardResult> {
  try {
    const imageBase64 = imageBuffer.toString("base64");

    // Step 1: Free moderation check
    const moderation = await moderateImage(openai, imageBase64);
    if (moderation.flagged) {
      return {
        approved: false,
        reason: `Imagen bloqueada: contenido inapropiado detectado (${moderation.categories?.join(", ")})`,
        code: "nsfw_content",
      };
    }

    // Step 2: Person detection (~$0.004)
    return await validatePersonInImage(openai, imageBase64);
  } catch (error) {
    // Fail open — guard infrastructure failure should not block users
    console.error("Content guard error (failing open):", error);
    return { approved: true };
  }
}
