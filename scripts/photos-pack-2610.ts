/**
 * Pose les 79 photos du dossier « Photos_plats_O3_Saveurs » (2026-10-26) —
 * `npx tsx scripts/photos-pack-2610.ts <dossier> [--dry-run]`, puis
 * `npx tsx --env-file=.env scripts/photos-vers-cellar.ts` pour verser sur Cellar.
 *
 * Deux nommages dans le dossier :
 *  · `NN_nom.jpg` — NN est le numéro du dépliant, qui ne suit PAS les `dN` de
 *    la base (les desserts y sont 43–47, les jus 48–52) : la table ci-dessous
 *    fait la correspondance, et chaque fiche est contrôlée par son nom avant
 *    d'être touchée ;
 *  · `S_<id>_nom.jpg` — l'identifiant du plat en base, pour ceux que le
 *    dépliant ne montre pas (canettes, couscous, sur commande…).
 *
 * Quinze images de 820 px de large sont des découpes de captures d'écran :
 * bandes crème et coins arrondis du site sur les bords, et, pour le n° 14,
 * du texte de page autour de la photo. Les bandes sont détectées et rognées,
 * puis 24 px de plus sur les bords concernés pour effacer les arrondis ; le
 * n° 14 a un cadrage fixe.
 *
 * Sortie : `public/photos/<id>_2610.jpg` (le suffixe évite d'écraser les
 * anciens fichiers, que des commandes passées référencent encore), largeur
 * 1400 px au plus, jamais agrandie, JPEG 84 mozjpeg 4:4:4 comme les lots
 * précédents. Les fiches sont pointées sur ce chemin ; `photos-vers-cellar`
 * les repointe ensuite sur Cellar.
 *
 * Ce qui a été appliqué le 2026-10-26 : 63 des 79 photos étaient déjà en ligne
 * à l'identique. Seules 16 fiches ont été repointées — la Salade Marocaine (en
 * ligne, c'était la vignette du dépliant) et les 15 captures recadrées — après
 * un passage `--sans-base` et une comparaison avec les photos en ligne.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
/** Écrit les fichiers sans toucher la base : pour contrôler les recadrages d'abord. */
const SANS_BASE = args.includes("--sans-base");
const SOURCE = args.find((a) => !a.startsWith("--"));
if (!SOURCE) throw new Error("Usage : npx tsx scripts/photos-pack-2610.ts <dossier> [--dry-run]");

/** Numéro du dépliant → [id en base, nom attendu]. */
const DEPLIANT: Record<number, [string, string]> = {
  1: ["d1", "Pastels Thon"], 2: ["d2", "Pastels Viande hachée"], 3: ["d3", "Pastels Poulet"],
  4: ["d4", "Salade composée"], 5: ["d5", "Patates fourrées au fromage"],
  6: ["d6", "Salade Saumon Avocat"], 7: ["d7", "Salade Pâtes & Poulet"], 8: ["d8", "Salade Poulet Mozzarella"],
  9: ["d9", "Salade César Avocat"], 10: ["d10", "Cecina de Bœuf"],
  11: ["d11", "Tajine Veau & Pruneaux"], 12: ["d12", "Tajine Poulet Olives & Citron confit"],
  13: ["d13", "Tajine Boulettes de Bœuf"], 14: ["d14", "Chakchouka"],
  15: ["d15", "Salade d'Aubergines (Zaalouk)"], 16: ["salade-marocaine", "Salade Marocaine"],
  17: ["d17", "Thiéboudiène Poulet"], 18: ["d18", "Thiéboudiène Bœuf"], 19: ["d19", "Thiéboudiène Poisson"],
  20: ["d20", "Yassa Poulet"], 21: ["d21", "Mafé Bœuf"],
  22: ["d22", "Brochette Poulet"], 23: ["d23", "Brochette Bœuf"], 24: ["d24", "Poulet Rôti"],
  25: ["d25", "Cuisse de Poulet"], 26: ["d26", "Pilon de Poulet"], 27: ["d27", "Ailes de Poulet"],
  28: ["d28", "Poisson Entier Grillé"],
  29: ["d29", "Sandwich Merguez"], 30: ["d30", "Sandwich Brochette Poulet"], 31: ["d31", "Sandwich Kefta"],
  32: ["d32", "Sandwich Brochette Bœuf"],
  33: ["d33", "Riz Blanc"], 34: ["d34", "Alloco"], 35: ["d35", "Riz Rouge"], 36: ["d36", "Thiéboudiène blanc"],
  37: ["d37", "Frites Maison"], 38: ["d38", "Salade Composée"], 39: ["d39", "Patate fourrée au fromage"],
  40: ["d40", "Sauce Ô3 Verte"], 41: ["d41", "Sauce Ô3 Piquante"], 42: ["d42", "Piment frais"],
  43: ["d49", "Ananas frais"], 44: ["d50", "Tiramisu"], 45: ["d51", "Fondant Chocolat"],
  46: ["d52", "Mousse au Chocolat"], 47: ["d53", "Tarte du jour"],
  48: ["d43", "Jus de Gingembre"], 49: ["d44", "Jus de Bissap"], 50: ["d45", "Cocktail Maison"],
  51: ["d46", "Jus d'Avocat"], 52: ["d47", "Jus d'Orange"],
};

/** Cadrages fixes, là où la détection automatique ne suffit pas. */
const CADRAGE_FIXE: Record<number, { left: number; top: number; width: number; height: number }> = {
  // Capture d'une fiche du site : texte et pied de page autour de la photo.
  14: { left: 0, top: 150, width: 720, height: 535 },
};

/** Vrai quand une ligne ou colonne est du fond crème du site (clair, presque uni). */
function estFond(px: Buffer, n: number, at: (i: number) => number): boolean {
  let clairs = 0;
  for (let i = 0; i < n; i++) {
    const o = at(i);
    const [r, g, b] = [px[o], px[o + 1], px[o + 2]];
    if (r > 225 && g > 215 && b > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 30) clairs++;
  }
  return clairs / n > 0.9;
}

/** Rogne les bandes de fond d'une capture, puis l'arrondi des coins sur les bords touchés. */
async function rognerCapture(src: string) {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const ligne = (y: number) => estFond(data, w, (x) => (y * w + x) * 3);
  const colonne = (x: number) => estFond(data, h, (y) => (y * w + x) * 3);
  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < h / 4 && ligne(top)) top++;
  while (bottom > (h * 3) / 4 && ligne(bottom)) bottom--;
  while (left < w / 4 && colonne(left)) left++;
  while (right > (w * 3) / 4 && colonne(right)) right--;
  /* Les cartes du site ont des coins arrondis côté droit : on en retire
   * toujours l'arrondi, et sur chaque autre bord où une bande a été ôtée. */
  const R = 24;
  if (top > 0) top += R;
  if (bottom < h - 1) bottom -= R;
  if (left > 0) left += R;
  right -= R;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function main() {
  const fichiers = readdirSync(SOURCE!).filter((f) => /\.jpe?g$/i.test(f)).sort();
  const plats = await prisma.dish.findMany({ select: { id: true, name: true } });
  const parId = new Map(plats.map((p) => [p.id, p.name]));
  const poses: { id: string; fichier: string }[] = [];
  const refus: string[] = [];

  for (const f of fichiers) {
    let id: string;
    let num: number | null = null;
    const s = f.match(/^S_(.+?)_/);
    const n = f.match(/^(\d{2})_/);
    if (s) {
      id = s[1];
    } else if (n) {
      num = Number(n[1]);
      const attendu = DEPLIANT[num];
      if (!attendu) { refus.push(`${f} : numéro ${num} inconnu`); continue; }
      if (parId.get(attendu[0]) !== attendu[1]) {
        refus.push(`${f} : ${attendu[0]} s'appelle « ${parId.get(attendu[0])} », attendu « ${attendu[1]} »`);
        continue;
      }
      id = attendu[0];
    } else {
      refus.push(`${f} : nom non reconnu`);
      continue;
    }
    if (!parId.has(id)) { refus.push(`${f} : aucun plat ${id} en base`); continue; }

    const src = join(SOURCE!, f);
    const meta = await sharp(src).metadata();
    let pipeline = sharp(src);
    let note = "";
    if (num !== null && CADRAGE_FIXE[num]) {
      pipeline = pipeline.extract(CADRAGE_FIXE[num]);
      note = " (cadrage fixe)";
    } else if (meta.width === 820) {
      const box = await rognerCapture(src);
      pipeline = pipeline.extract(box);
      note = ` (capture rognée à ${box.width}x${box.height})`;
    }
    const sortie = `${id}_2610.jpg`;
    console.log(`   ${f} → ${parId.get(id)}${note}`);
    if (!DRY) {
      await pipeline
        .resize({ width: 1400, withoutEnlargement: true })
        .jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toFile(join("public", "photos", sortie));
    }
    poses.push({ id, fichier: sortie });
  }

  const sansPhoto = plats.filter((p) => !poses.some((x) => x.id === p.id)).map((p) => p.name);
  if (refus.length) console.log(`\n⚠️  ${refus.length} refus :\n   ${refus.join("\n   ")}`);
  if (sansPhoto.length) console.log(`\nℹ️  plats sans photo dans ce lot : ${sansPhoto.join(", ")}`);
  if (refus.length) throw new Error("Refus : aucune fiche n'a été repointée");

  if (SANS_BASE) {
    console.log(`\n📁 ${poses.length} fichier(s) écrit(s) dans public/photos, base non touchée.`);
    return;
  }
  if (!DRY) {
    await prisma.$transaction(
      poses.map((p) => prisma.dish.update({ where: { id: p.id }, data: { photo: `/photos/${p.fichier}` } })),
    );
  }
  console.log(`\n${DRY ? "🔍 Simulation" : "✅"} ${poses.length} fiche(s) ${DRY ? "à pointer" : "pointées"} sur public/photos.`);
}

main()
  .catch((e) => {
    console.error("\n❌", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
