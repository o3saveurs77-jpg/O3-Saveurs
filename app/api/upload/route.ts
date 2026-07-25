import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

// POST /api/upload  (multipart: field "file") — réservé admin.
// Renvoie { url } (URL publique Vercel Blob) à stocker dans Dish.photo.
export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Accès réservé à l'administration." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Format non supporté (JPEG, PNG, WebP, AVIF)." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image trop lourde (5 Mo max)." }, { status: 413 });
  }

  try {
    const blob = await put(`dishes/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    console.error("Upload Blob échoué:", err);
    return NextResponse.json(
      { error: "Upload impossible (vérifier BLOB_READ_WRITE_TOKEN)." },
      { status: 500 },
    );
  }
}
