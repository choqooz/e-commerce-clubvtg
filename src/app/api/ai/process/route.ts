import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimiter } from "@/lib/rate-limit";
import { validateImage, processUserImage } from "@/lib/ai/image-processing";
import { getOpenAI, generateTryOn } from "@/lib/ai/openai";
import { buildTryOnPrompt } from "@/lib/ai/prompts";
import { runContentGuard } from "@/lib/ai/content-guard";
import type { TryOnSSEEvent, TryOnErrorEvent } from "@/lib/types";

export const maxDuration = 90;

// ── Helpers ──

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, { headers: SSE_HEADERS });
}

/** Quick bail-out for pre-stream errors (auth, rate-limit, etc.) */
function createErrorSSE(
  message: string,
  code: TryOnErrorEvent["code"],
): Response {
  const event: TryOnErrorEvent = { type: "error", message, code };
  const body = `data: ${JSON.stringify(event)}\n\n`;
  return new Response(body, { headers: SSE_HEADERS });
}

// ── POST Handler ──

export async function POST(req: Request) {
  // ── 1. Authentication ──
  const { userId } = await auth();
  if (!userId) {
    return createErrorSSE("No autenticado", "server_error");
  }

  // ── 2. Email verification ──
  const user = await currentUser();
  const primaryEmail = user?.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  );
  if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
    return createErrorSSE(
      "Debés verificar tu email antes de usar esta función",
      "not_verified",
    );
  }

  // ── 3. Rate limiting ──
  const { success: withinLimit } = await rateLimiter.limit(userId);
  if (!withinLimit) {
    return createErrorSSE(
      "Demasiadas solicitudes. Esperá un momento e intentá de nuevo.",
      "rate_limited",
    );
  }

  // ── 4. Parse form data ──
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return createErrorSSE("Solicitud inválida", "server_error");
  }

  const productSlug = formData.get("productSlug") as string | null;
  const imageFile = formData.get("image") as File | null;

  if (!productSlug || !imageFile) {
    return createErrorSSE(
      "Faltan datos requeridos (productSlug, image)",
      "server_error",
    );
  }

  // ── 5-12: SSE Pipeline ──
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let logId: string | null = null;
      let creditDeducted = false;

      function sendEvent(event: TryOnSSEEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        // ── 5. Validate & process image ──
        sendEvent({
          type: "progress",
          step: "validating",
          message: "Validando imagen...",
        });

        const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
        const validation = await validateImage(imageBuffer);

        if (!validation.valid) {
          sendEvent({
            type: "error",
            message: validation.error ?? "Imagen no válida",
            code: "invalid_image",
          });
          return;
        }

        const { buffer: processedBuffer, width, height } =
          await processUserImage(imageBuffer);

        // ── 6. Check credits ──
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("credits")
          .eq("id", userId)
          .single();

        if (profileError || !profile) {
          sendEvent({
            type: "error",
            message: "No se pudo verificar tu perfil",
            code: "server_error",
          });
          return;
        }

        if (profile.credits < 1) {
          sendEvent({
            type: "error",
            message: "No tenés créditos suficientes",
            code: "insufficient_credits",
          });
          return;
        }

        // ── 7. Fetch product ──
        const { data: product, error: productError } = await supabaseAdmin
          .from("products")
          .select("id, title, category, image_urls, status")
          .eq("slug", productSlug)
          .single();

        if (productError || !product) {
          sendEvent({
            type: "error",
            message: "Producto no encontrado",
            code: "server_error",
          });
          return;
        }

        if (product.status !== "available") {
          sendEvent({
            type: "error",
            message: "Este producto ya no está disponible",
            code: "server_error",
          });
          return;
        }

        const productImageUrl = product.image_urls?.[0];
        if (!productImageUrl) {
          sendEvent({
            type: "error",
            message: "El producto no tiene imagen",
            code: "server_error",
          });
          return;
        }

        // ── 8. Upload user image ──
        sendEvent({
          type: "progress",
          step: "uploading",
          message: "Subiendo foto...",
        });

        const timestamp = Date.now();
        const uploadPath = `${userId}/${timestamp}.jpg`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from("user-uploads")
          .upload(uploadPath, processedBuffer, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (uploadError) {
          console.error("User image upload error:", uploadError);
          sendEvent({
            type: "error",
            message: "Error al subir la imagen",
            code: "server_error",
          });
          return;
        }

        // Get signed URL for the uploaded user image
        const { data: userSignedData, error: userSignedError } =
          await supabaseAdmin.storage
            .from("user-uploads")
            .createSignedUrl(uploadPath, 3600);

        if (userSignedError || !userSignedData?.signedUrl) {
          console.error("Signed URL error:", userSignedError);
          sendEvent({
            type: "error",
            message: "Error al procesar la imagen",
            code: "server_error",
          });
          return;
        }

        // ── 9. Deduct credit ──
        sendEvent({
          type: "progress",
          step: "processing",
          message: "Procesando...",
        });

        const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
          "use_ai_credit",
          {
            p_user_id: userId,
            p_product_id: product.id,
            p_user_image_url: uploadPath,
          },
        );

        if (rpcError || !rpcResult) {
          console.error("Credit deduction RPC error:", rpcError);
          sendEvent({
            type: "error",
            message: "Error al procesar créditos",
            code: "insufficient_credits",
          });
          return;
        }

        logId = rpcResult as string;
        creditDeducted = true;

        // ── 10. Content guard (after credit deduction — Option A) ──
        sendEvent({
          type: "progress",
          step: "content_check",
          message: "Verificando contenido...",
        });

        const guardResult = await runContentGuard(getOpenAI(), processedBuffer);
        if (!guardResult.approved) {
          // Credit already deducted — no refund (disuades abuse)
          await supabaseAdmin
            .from("ai_tryon_logs")
            .update({
              status: "failed" as const,
              error_message: guardResult.reason ?? "Contenido rechazado",
            })
            .eq("id", logId);

          sendEvent({
            type: "error",
            message:
              guardResult.reason ??
              "Imagen no válida para el probador virtual",
            code: guardResult.code ?? "inappropriate_image",
          });
          controller.close();
          return;
        }

        // ── 11. Generate try-on ──
        sendEvent({
          type: "progress",
          step: "generating",
          message: "Generando prueba virtual...",
        });

        const prompt = buildTryOnPrompt(product.category);
        const { imageBase64 } = await generateTryOn(
          processedBuffer,
          productImageUrl,
          prompt,
          { width, height },
        );

        // ── 12. Save result ──
        sendEvent({
          type: "progress",
          step: "finalizing",
          message: "Finalizando...",
        });

        const resultBuffer = Buffer.from(imageBase64, "base64");
        const resultPath = `${userId}/${logId}.jpg`;

        const { error: resultUploadError } = await supabaseAdmin.storage
          .from("ai-results")
          .upload(resultPath, resultBuffer, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (resultUploadError) {
          console.error("Result upload error:", resultUploadError);
          throw new Error("Error al guardar el resultado");
        }

        // Get signed URL for the result
        const { data: resultSignedData, error: resultSignedError } =
          await supabaseAdmin.storage
            .from("ai-results")
            .createSignedUrl(resultPath, 3600);

        if (resultSignedError || !resultSignedData?.signedUrl) {
          console.error("Result signed URL error:", resultSignedError);
          throw new Error("Error al generar URL del resultado");
        }

        // Update the ai_tryon_logs record with the result
        await supabaseAdmin
          .from("ai_tryon_logs")
          .update({
            result_image_url: resultPath,
            status: "completed" as const,
          })
          .eq("id", logId);

        // Fetch updated credits
        const { data: updatedProfile } = await supabaseAdmin
          .from("profiles")
          .select("credits")
          .eq("id", userId)
          .single();

        // ── 13. Return complete event ──
        sendEvent({
          type: "complete",
          resultUrl: resultSignedData.signedUrl,
          logId,
          creditsRemaining: updatedProfile?.credits ?? 0,
        });
      } catch (error: unknown) {
        console.error("AI process pipeline error:", error);

        // If credit was deducted, refund and mark log as failed
        if (creditDeducted && logId) {
          try {
            await supabaseAdmin.rpc("refund_ai_credit", {
              p_log_id: logId,
            });
            await supabaseAdmin
              .from("ai_tryon_logs")
              .update({
                status: "failed" as const,
                error_message:
                  error instanceof Error ? error.message : "Error desconocido",
              })
              .eq("id", logId);
          } catch (refundError) {
            console.error("Failed to refund credit:", refundError);
          }
        }

        sendEvent({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Error inesperado en la generación",
          code: "generation_failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}

