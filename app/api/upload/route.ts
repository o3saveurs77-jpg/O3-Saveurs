import { NextResponse } from "next/server";
import { isStorageConfigured, putPublicObject } from "@/lib/storage";
import { requireAdmin } from "@/lib/guard";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

/**
 * Signatures de fichier (magic bytes). `file.type` est **déclaré par le client** :
 * un fichier arbitraire renommé en `.jpg` avec le bon `Content-Type` passait le
 * contrôle. On vérifie donc les premiers octets.
 */
const SIGNATURES: { type: string; check: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/png",
    check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    // RIFF….WEBP
    type: "image/webp",
    check: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    // boîte ISO-BMFF « ftyp » + marque avif / avis
    type: "image/avif",
    check: (b) =>
      b[4] === 0x66 &&
      b[5] === 0x74 &&
      b[6] === 0x79 &&
      b[7] === 0x70 &&
      b[8] === 0x61 &&
      b[9] === 0x76 &&
      b[10] === 0x69,
  },
];

/** Extension déduite du type réel, pour ne pas rejouer le nom fourni. */
const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * POST /api/upload (multipart, champ « file ») — réservé à l'administration.
 * Renvoie `{ url }`, l'adresse publique à stocker dans `Dish.photo`.
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response; // 401 sans session, 403 sans le rôle

  /* Contrôlé avant de lire le fichier : sans cela on faisait monter plusieurs
   * mégaoctets depuis un téléphone pour échouer à l'arrivée, sur un message
   * qui ne parlait qu'à un développeur. */
  if (!isStorageConfigured()) {
    console.error("[upload] stockage objet non configuré (variables CELLAR_*).");
    return NextResponse.json(
      {
        error:
          "L'espace de stockage des photos n'est pas encore configuré. " +
          "Sur Clever Cloud : ajouter l'addon Cellar à l'application, puis créer un bucket " +
          "et renseigner CELLAR_BUCKET. En attendant, vous pouvez saisir une adresse d'image " +
          "du site, par exemple /photos/p04.jpg.",
      },
      { status: 503 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Le fichier est vide." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image trop lourde (5 Mo maximum)." }, { status: 413 });
  }
  if (!(ALLOWED as readonly string[]).includes(file.type)) {
    /* Le cas courant est la photo prise à l'iPhone, enregistrée en HEIC : le
     * format est refusé par les navigateurs autant que par nous, et le dire
     * évite de croire à une panne du site. */
    const heic = /hei[cf]/i.test(file.type);
    return NextResponse.json(
      {
        error: heic
          ? "Les photos iPhone au format HEIC ne sont pas acceptées. Sur l'iPhone : Réglages → Appareil photo → Formats → « Le plus compatible », ou envoyez la photo par email pour la convertir en JPEG."
          : "Format non supporté (JPEG, PNG, WebP ou AVIF).",
      },
      { status: 415 },
    );
  }

  // Contrôle du contenu réel, et non du type annoncé.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = SIGNATURES.find((s) => s.check(head))?.type;

  if (!detected) {
    return NextResponse.json(
      { error: "Ce fichier n'est pas une image reconnue." },
      { status: 415 },
    );
  }
  if (detected !== file.type) {
    return NextResponse.json(
      { error: `Le contenu du fichier ne correspond pas à son type déclaré.` },
      { status: 415 },
    );
  }

  try {
    // La clé est calculée côté serveur : un nom de fichier venu du navigateur
    // peut contenir n'importe quoi, y compris de quoi sortir du dossier prévu.
    const url = await putPublicObject(
      "dishes",
      EXTENSION[detected],
      Buffer.from(await file.arrayBuffer()),
      detected,
    );
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error("[upload] dépôt sur le stockage objet échoué:", error);
    return NextResponse.json(
      { error: "Envoi impossible. Vérifiez la configuration du stockage (addon Cellar)." },
      { status: 500 },
    );
  }
}
