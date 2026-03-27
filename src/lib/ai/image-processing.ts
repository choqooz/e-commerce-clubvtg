import sharp from "sharp";

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 95;
const MAX_MEGAPIXELS = 649_000; // ~0.59MP + tolerance

export async function processUserImage(
  buffer: Buffer,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const inputMeta = await sharp(buffer).metadata();
  const isJpeg = inputMeta.format === "jpeg";
  const needsResize =
    (inputMeta.width ?? 0) > MAX_DIMENSION ||
    (inputMeta.height ?? 0) > MAX_DIMENSION;

  let pipeline = sharp(buffer)
    .rotate() // Auto-rotate based on EXIF
    .withMetadata({ orientation: undefined }); // Strip EXIF

  if (needsResize) {
    pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Only re-encode to JPEG if the input isn't already JPEG or we had to resize.
  // Avoids double JPEG compression (client 0.95 → server 0.95) which degrades
  // color accuracy and introduces generation-loss artifacts.
  if (!isJpeg || needsResize) {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY });
  }

  const processed = await pipeline.toBuffer();
  const meta = await sharp(processed).metadata();

  return {
    buffer: processed,
    width: meta.width ?? MAX_DIMENSION,
    height: meta.height ?? MAX_DIMENSION,
  };
}

export async function validateImage(buffer: Buffer): Promise<{
  valid: boolean;
  error?: string;
  metadata?: { width: number; height: number; format: string };
}> {
  try {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      return { valid: false, error: "No se pudo leer la imagen" };
    }

    if (metadata.width < 256 || metadata.height < 256) {
      return {
        valid: false,
        error: "La imagen es muy pequeña (mínimo 256x256)",
      };
    }

    if (metadata.width * metadata.height > MAX_MEGAPIXELS) {
      return {
        valid: false,
        error: "La imagen excede el límite de resolución permitido",
      };
    }

    return {
      valid: true,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || "unknown",
      },
    };
  } catch {
    return { valid: false, error: "Formato de imagen no válido" };
  }
}
