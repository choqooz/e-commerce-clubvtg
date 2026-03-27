function getReplacementRule(category: string): string {
  switch (category.toLowerCase()) {
    case "tops":
      return "GARMENT-SPECIFIC REPLACEMENT RULE: This garment is a TOP (shirt, t-shirt, blouse). Replace ONLY the upper body clothing. The person's pants, shorts, skirt, shoes, belt, and all lower-body clothing must remain EXACTLY unchanged from image 1. Do not modify anything below the waist.";
    case "bottoms":
      return "GARMENT-SPECIFIC REPLACEMENT RULE: This garment is BOTTOMS (pants, jeans, shorts, or skirt). Replace ONLY the lower body clothing. The person's shirt, jacket, top, and all upper-body clothing must remain EXACTLY unchanged from image 1. Do not modify anything above the waist.";
    case "outerwear":
      return "GARMENT-SPECIFIC REPLACEMENT RULE: This garment is OUTERWEAR (jacket, coat, or hoodie). Add or replace ONLY the outer layer on top of existing clothing. The inner shirt/top and pants must remain EXACTLY unchanged from image 1. Layer the outerwear naturally over existing clothing.";
    case "knitwear":
      return "GARMENT-SPECIFIC REPLACEMENT RULE: This garment is KNITWEAR (sweater, cardigan, knit top). Replace ONLY the upper body clothing. The person's pants, shorts, skirt, shoes, belt, and all lower-body clothing must remain EXACTLY unchanged from image 1. Do not modify anything below the waist.";
    case "accessories":
      return "GARMENT-SPECIFIC REPLACEMENT RULE: This is an ACCESSORY (hat, scarf, bag, jewelry). Add or replace ONLY this specific accessory. ALL clothing on the person must remain EXACTLY unchanged from image 1.";
    case "footwear":
      return "GARMENT-SPECIFIC REPLACEMENT RULE: This is FOOTWEAR (shoes, boots, sneakers). Replace ONLY the footwear. ALL clothing on the person must remain EXACTLY unchanged from image 1. Do not modify anything above the ankles.";
    default:
      return "GARMENT-SPECIFIC REPLACEMENT RULE: Replace ONLY the clothing item shown in image 2. All other garments on the person must remain EXACTLY unchanged from image 1.";
  }
}

export function buildTryOnPrompt(category: string): string {
  return [
    // Identity anchor
    "Virtual try-on clothing swap.",
    "Image 1 is the IDENTITY ANCHOR — a photo of a person. Image 2 is the TARGET GARMENT.",
    "Replace ONLY the clothing on the person in image 1 with the exact garment from image 2.",

    // Facial expression lock (most impactful for user trust)
    "CRITICAL — FACIAL EXPRESSION LOCK: The person's facial expression must be pixel-perfect identical to image 1.",
    "Same mouth position (open, closed, smile degree), same eye openness, same gaze direction, same eyebrow position, same micro-expressions.",
    "Do NOT alter, soften, or reinterpret any facial muscle. The face in the output must be indistinguishable from image 1.",

    // Color & lighting preservation
    "CRITICAL — COLOR AND LIGHTING PRESERVATION: The output must have IDENTICAL lighting, color temperature, exposure, white balance, and color grading as image 1.",
    "Do NOT darken, brighten, warm, cool, or shift the overall tonality. Skin tone and complexion must not change — no darkening, no brightening, no saturation shift.",
    "Shadows, highlights, and ambient light direction must match image 1 exactly.",

    // Identity preservation
    "The person's face, facial features, skin tone, hair (color, style, length), pose, body shape, proportions, camera angle, and background must remain identical to image 1.",

    // Garment fidelity
    "The garment from image 2 must be reproduced exactly — same color, pattern, texture, fabric appearance, style, and construction details.",
    "Fit the garment naturally to the person's body geometry, respecting folds and draping physics.",

    // Garment-specific replacement rule (category-aware)
    getReplacementRule(category),

    // Hard constraint
    "This is a clothing swap ONLY. Nothing else changes. No artistic reinterpretation. No style transfer. No enhancement.",
  ].join(" ");
}
