import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(req: Request) {
  try {
    // 1. Verify user is authenticated and is admin
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const primaryEmail = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId
    )?.emailAddress;

    if (!primaryEmail || primaryEmail !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // 2. Parse FormData
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    }

    // 3. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `El archivo excede el límite de 5MB (${(file.size / 1024 / 1024).toFixed(1)}MB)` },
        { status: 400 }
      );
    }

    // 4. Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Tipo de archivo no permitido: ${file.type}. Solo se aceptan JPEG, PNG y WebP.` },
        { status: 400 }
      );
    }

    // 5. Prepare file for Supabase
    const fileBuffer = await file.arrayBuffer();
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `products/${fileName}`;

    // 6. Upload using Admin Client (Bypasses RLS)
    const { error: uploadError } = await supabaseAdmin.storage
      .from("product-images")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase Upload Error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 7. Get Public URL
    const { data: publicURLData } = supabaseAdmin.storage
      .from("product-images")
      .getPublicUrl(filePath);

    return NextResponse.json({ publicUrl: publicURLData.publicUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("API Upload Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
