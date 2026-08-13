/**
 * Verse les photos livrées dans `public/photos/` sur Cellar et repointe la base
 * — `npm run db:photos-cellar`.
 *
 * Jusqu'ici les photos venaient de deux endroits : celles de la livraison
 * initiale, servies depuis `public/`, et celles téléversées depuis
 * l'administration, déposées sur Cellar. Deux origines pour une même chose,
 * donc deux façons de casser. Tout passe désormais par Cellar.
 *
 * La clé porte une empreinte du contenu — `plats/p04-a1b2c3d4.jpg`. C'est ce
 * qui rend honnête le `immutable` de l'en-tête de cache : un fichier modifié
 * reçoit une nouvelle clé, donc une nouvelle adresse, et ne peut pas rester
 * périmé un an dans le navigateur d'un visiteur.
 *
 * Ce qu'il ne touche pas, volontairement :
 *
 *  · **`Order.lines`** — les lignes des commandes déjà passées. Ce sont des
 *    instantanés : une facture doit rester lisible telle qu'elle a été émise,
 *    dix ans durant (code de commerce). Six commandes y référencent d'anciens
 *    chemins ; ils continueront de fonctionner tant que `public/photos/` reste
 *    dans le dépôt, et n'ont de toute façon pas à être réécrits.
 *
 * Relançable sans dommage : un objet déjà présent sous la même empreinte n'est
 * pas redéposé, et les remplacements en base sont idempotents.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE = join(process.cwd(), "public", "photos");
const PREFIXE = "plats";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

function host(): string {
  const raw = process.env.CELLAR_ADDON_HOST?.trim();
  if (!raw) throw new Error("CELLAR_ADDON_HOST absente");
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function bucket(): string {
  const b = process.env.CELLAR_BUCKET?.trim();
  if (!b) throw new Error("CELLAR_BUCKET absente");
  return b;
}

const s3 = new S3Client({
  endpoint: `https://${host()}`,
  region: process.env.CELLAR_REGION?.trim() || "us-east-1",
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.CELLAR_ADDON_KEY_ID!.trim(),
    secretAccessKey: process.env.CELLAR_ADDON_KEY_SECRET!.trim(),
  },
});

/** `/photos/p04.jpg` → `https://bucket.hôte/plats/p04-a1b2c3d4.jpg` */
async function verser(): Promise<Map<string, string>> {
  const fichiers = readdirSync(SOURCE).filter((f) => TYPES[f.split(".").pop()!.toLowerCase()]);
  if (!fichiers.length) throw new Error(`Aucune image dans ${SOURCE}`);

  const correspondance = new Map<string, string>();
  let deposes = 0;
  let dejaLa = 0;

  for (const fichier of fichiers) {
    const corps = readFileSync(join(SOURCE, fichier));
    const ext = fichier.split(".").pop()!.toLowerCase();
    const base = fichier.slice(0, -(ext.length + 1));
    const empreinte = createHash("sha256").update(corps).digest("hex").slice(0, 8);
    const cle = `${PREFIXE}/${base}-${empreinte}.${ext}`;

    let present = false;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: cle }));
      present = true;
    } catch {
      present = false;
    }

    if (present) {
      dejaLa++;
    } else {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: cle,
          Body: corps,
          ContentType: TYPES[ext],
          ACL: "public-read",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      deposes++;
    }

    correspondance.set(`/photos/${fichier}`, `https://${bucket()}.${host()}/${cle}`);
  }

  console.log(`📷 ${fichiers.length} photos : ${deposes} déposée(s), ${dejaLa} déjà présente(s)`);
  return correspondance;
}

/** Remplace tous les anciens chemins d'une chaîne. Sans correspondance, rend la chaîne telle quelle. */
function repointer(texte: string, correspondance: Map<string, string>): string {
  let sortie = texte;
  for (const [ancien, nouveau] of correspondance) {
    if (sortie.includes(ancien)) sortie = sortie.split(ancien).join(nouveau);
  }
  return sortie;
}

async function repointerLesPlats(correspondance: Map<string, string>): Promise<void> {
  const plats = await prisma.dish.findMany({
    where: { photo: { startsWith: "/photos/" } },
    select: { id: true, name: true, photo: true },
  });

  let faits = 0;
  const orphelins: string[] = [];

  for (const plat of plats) {
    const nouveau = repointer(plat.photo!, correspondance);
    if (nouveau === plat.photo) {
      // Le fichier référencé n'existe pas dans `public/photos/` : on ne peut
      // rien verser, et écraser par une adresse morte serait pire que laisser.
      orphelins.push(`${plat.name} → ${plat.photo}`);
      continue;
    }
    await prisma.dish.update({ where: { id: plat.id }, data: { photo: nouveau } });
    faits++;
  }

  console.log(`🍽️  ${faits} plat(s) repointé(s) sur Cellar`);
  if (orphelins.length) {
    console.log(
      `\n⚠️  ${orphelins.length} plat(s) référencent un fichier absent de public/photos — laissés en l'état :\n   ` +
        orphelins.join("\n   "),
    );
  }
}

async function repointerLesSections(correspondance: Map<string, string>): Promise<void> {
  const sections = await prisma.pageSection.findMany({
    where: { contentJson: { contains: "/photos/" } },
    select: { id: true, contentJson: true },
  });

  let faits = 0;
  for (const section of sections) {
    const nouveau = repointer(section.contentJson, correspondance);
    if (nouveau === section.contentJson) continue;
    await prisma.pageSection.update({ where: { id: section.id }, data: { contentJson: nouveau } });
    faits++;
  }

  console.log(`📄 ${faits} section(s) de page repointée(s)`);
}

async function main() {
  console.log(`— Photos vers Cellar (${bucket()}.${host()}) —\n`);

  const correspondance = await verser();
  await repointerLesPlats(correspondance);
  await repointerLesSections(correspondance);

  const restants = await prisma.dish.count({ where: { photo: { startsWith: "/photos/" } } });
  console.log(
    restants
      ? `\n⚠️  ${restants} plat(s) pointent encore sur public/photos.`
      : "\n✅ Plus aucun plat ne dépend de public/photos.",
  );
  console.log(
    "\nLes commandes déjà passées gardent leurs anciens chemins : ce sont des\n" +
      "instantanés de facture, ils ne se réécrivent pas.",
  );
}

main()
  .catch((e) => {
    console.error("❌ échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
