import OpenAI from 'openai';

let _openai: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY env var');
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function generateTryOn(
  userImageBuffer: Buffer,
  productImageUrl: string,
  prompt: string,
  dimensions: { width: number; height: number }
): Promise<{ imageBase64: string }> {
  const openai = getOpenAI();

  // Determine size based on orientation
  const size =
    dimensions.height > dimensions.width
      ? '1024x1536'
      : dimensions.width > dimensions.height
        ? '1536x1024'
        : '1024x1024';

  // Fetch product image
  const productResponse = await fetch(productImageUrl);
  const productBuffer = Buffer.from(await productResponse.arrayBuffer());

  // Create File objects with JPEG mime (use Uint8Array to satisfy BlobPart)
  const userFile = new File([new Uint8Array(userImageBuffer)], 'user.jpg', {
    type: 'image/jpeg',
  });
  const productFile = new File([new Uint8Array(productBuffer)], 'product.jpg', {
    type: 'image/jpeg',
  });

  // Call with retry
  async function callOpenAI() {
    return openai.images.edit({
      model: 'gpt-image-1.5',
      image: [userFile, productFile],
      prompt,
      size: size as '1024x1536' | '1536x1024' | '1024x1024',
      quality: 'medium',
      input_fidelity: 'high',
      output_format: 'jpeg',
    });
  }

  let response;
  try {
    response = await callOpenAI();
  } catch {
    // Single retry after 1 second
    await new Promise((resolve) => setTimeout(resolve, 1000));
    response = await callOpenAI();
  }

  const imageBase64 = response.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error('OpenAI returned no image data');
  }

  return { imageBase64 };
}
