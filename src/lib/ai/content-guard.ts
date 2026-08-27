import type OpenAI from "openai";
import { z } from "zod";

const contentGuardSchema = z.object({
  has_person: z.boolean(),
  appropriate: z.boolean(),
  reason: z.string(),
});

export const CONTENT_GUARD_OUTCOME = {
  APPROVED: "approved",
  REJECTED: "rejected",
  UNAVAILABLE: "unavailable",
} as const;

const CONTENT_GUARD_CODE = {
  INAPPROPRIATE_IMAGE: "inappropriate_image",
  NO_PERSON_DETECTED: "no_person_detected",
  NSFW_CONTENT: "nsfw_content",
  UNAVAILABLE: "content_guard_unavailable",
} as const;

type ContentGuardCode = (typeof CONTENT_GUARD_CODE)[keyof typeof CONTENT_GUARD_CODE];
type ContentGuardOutcome = (typeof CONTENT_GUARD_OUTCOME)[keyof typeof CONTENT_GUARD_OUTCOME];

export interface ContentGuardResult {
  outcome: ContentGuardOutcome;
  reason?: string;
  code?: ContentGuardCode;
}

/**
 * Step 1: OpenAI Moderation API (FREE)
 * Checks for NSFW, violence, hate, self-harm via omni-moderation-latest.
 */
async function moderateImage(
  openai: OpenAI,
  imageBase64: string,
  imageMimeType: string,
): Promise<{ flagged: boolean; categories?: string[] }> {
  const response = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: [
      {
        type: "image_url",
        image_url: {
          url: `data:${imageMimeType};base64,${imageBase64}`,
        },
      },
    ],
  });

  const result = response.results[0];
  if (!result) {
    throw new Error("Content moderation response did not contain a result.");
  }

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
  imageMimeType: string,
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
              url: `data:${imageMimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    return {
      outcome: CONTENT_GUARD_OUTCOME.UNAVAILABLE,
      code: CONTENT_GUARD_CODE.UNAVAILABLE,
    };
  }

  try {
    const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = contentGuardSchema.parse(JSON.parse(jsonStr));

    if (!parsed.has_person) {
      return {
        outcome: CONTENT_GUARD_OUTCOME.REJECTED,
        reason: parsed.reason || "No se detectó una persona en la imagen",
        code: CONTENT_GUARD_CODE.NO_PERSON_DETECTED,
      };
    }

    if (!parsed.appropriate) {
      return {
        outcome: CONTENT_GUARD_OUTCOME.REJECTED,
        reason: parsed.reason || "La imagen no es apropiada para el probador virtual",
        code: CONTENT_GUARD_CODE.INAPPROPRIATE_IMAGE,
      };
    }

    return { outcome: CONTENT_GUARD_OUTCOME.APPROVED };
  } catch {
    return {
      outcome: CONTENT_GUARD_OUTCOME.UNAVAILABLE,
      code: CONTENT_GUARD_CODE.UNAVAILABLE,
    };
  }
}

/**
 * Combined content guard: Moderation (free) → Person detection (~$0.004).
 */
export async function runContentGuard(
  openai: OpenAI,
  imageBuffer: Buffer,
  imageMimeType = "image/jpeg",
): Promise<ContentGuardResult> {
  try {
    const imageBase64 = imageBuffer.toString("base64");

    // Step 1: Free moderation check
    const moderation = await moderateImage(openai, imageBase64, imageMimeType);
    if (moderation.flagged) {
      return {
        outcome: CONTENT_GUARD_OUTCOME.REJECTED,
        reason: `Imagen bloqueada: contenido inapropiado detectado (${moderation.categories?.join(", ")})`,
        code: CONTENT_GUARD_CODE.NSFW_CONTENT,
      };
    }

    // Step 2: Person detection (~$0.004)
    return await validatePersonInImage(openai, imageBase64, imageMimeType);
  } catch (error) {
    console.error("Content guard unavailable:", error);
    return {
      outcome: CONTENT_GUARD_OUTCOME.UNAVAILABLE,
      code: CONTENT_GUARD_CODE.UNAVAILABLE,
    };
  }
}
