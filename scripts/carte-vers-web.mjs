/**
 * Fabrique la carte téléchargeable du site — `npm run carte:web`.
 *
 * Le PDF de création (`O3-Saveurs Carte-FINALE-corrigee.pdf`) pèse **119 Mo**
 * pour 65 pages. Ce n'est pas un défaut de compression : il a été produit par
 * `pypdf` en collant les corrections successives par-dessus les versions
 * précédentes, sous forme de bandes raster **non compressées**, sans jamais
 * retirer le contenu recouvert (voir §13 de RECONCILIATION-CARTE.md). Le
 * ré-encoder ne suffit pas — `pdftocairo` le ramène à 95 Mo, pas plus.
 *
 * Deux conséquences, et ce script les traite ensemble :
 *
 *  · **Le poids.** Personne ne télécharge 119 Mo depuis un téléphone, et
 *    l'envoyer par email est exclu.
 *  · **Les prix fantômes.** Sous chaque correction dort l'ancienne valeur :
 *    la page Chakchouka contient `5,00` (visible) et `6,00` (masqué). Un
 *    Ctrl+F ou un copier-coller dans le PDF de création remonte des prix qui
 *    n'existent plus. Un imprimeur dont le flux ré-aplatit le texte peut même
 *    les faire réapparaître à l'impression.
 *
 * La sortie est donc rendue **en image** : ce qui est visible est le seul
 * contenu qui subsiste, les couches mortes disparaissent avec la couche texte.
 * La carte consultable et interrogeable reste celle du site, en HTML, à
 * `/carte` — c'est elle que lisent les moteurs de recherche, pas ce PDF.
 *
 * ⚠ Ce script est un pansement, pas une solution. Le jour où la carte est
 * réexportée **à plat** depuis l'outil de création (Canva, InDesign…), le PDF
 * obtenu sera plus léger *et* gardera son texte : il ira directement dans
 * `public/`, et ce fichier n'aura plus lieu d'être.
 *
 * Prérequis : `pdftoppm` et `pdfinfo` (poppler-utils, déjà installés via scoop).
 *
 * Usage :
 *   npm run carte:web
 *   npm run carte:web -- --dpi=200 --qualite=88
 *   npm run carte:web -- --source="autre.pdf" --sortie=public/autre.pdf
 *
 * Écrit en `.mjs` et non en `.ts` à dessein : `@react-pdf/pdfkit` ne livre
 * aucune déclaration de types, et l'importer depuis un `.ts` ferait échouer
 * `npm run typecheck` sur tout le dépôt.
 */

import PDFDocument from "@react-pdf/pdfkit";
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (nom, defaut) =>
  args.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? defaut;

const SOURCE = resolve(opt("source", "O3-Saveurs Carte-FINALE-corrigee.pdf"));
const SORTIE = resolve(opt("sortie", "public/carte-o3-saveurs.pdf"));

/* 150 dpi est la résolution native des photos de la carte : au-delà, on
 * n'ajoute que du poids à interpoler. En deçà, les prix en petits caractères
 * commencent à baver. */
const DPI = Number(opt("dpi", "150"));
const QUALITE = Number(opt("qualite", "82"));

const mo = (o) => `${(o / 1024 / 1024).toFixed(1)} Mo`;

function exigeOutil(nom) {
  try {
    execFileSync(nom, ["-v"], { stdio: "ignore" });
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(
        `❌ ${nom} introuvable. Ce script s'appuie sur poppler-utils :\n` +
          `   scoop install poppler   (ou l'équivalent de votre gestionnaire)`,
      );
      process.exit(1);
    }
    /* `-v` sort en code non nul chez poppler : l'outil est bien là. */
  }
}

/** Dimensions de page de la source, en points — jamais devinées. */
function tailleDePage(pdf) {
  const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
  const m = info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
  if (!m) throw new Error("pdfinfo n'a pas rendu la taille de page.");
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
  return { largeur: Number(m[1]), hauteur: Number(m[2]), pages };
}

function main() {
  exigeOutil("pdftoppm");
  exigeOutil("pdfinfo");

  if (!existsSync(SOURCE)) {
    console.error(`❌ Source introuvable : ${SOURCE}`);
    process.exit(1);
  }

  const { largeur, hauteur, pages } = tailleDePage(SOURCE);
  const avant = statSync(SOURCE).size;

  console.log(`Source  : ${SOURCE}`);
  console.log(`          ${pages} pages, ${largeur} × ${hauteur} pts, ${mo(avant)}`);
  console.log(`Rendu   : ${DPI} dpi, JPEG qualité ${QUALITE}\n`);

  const atelier = mkdtempSync(join(tmpdir(), "carte-"));
  try {
    console.log("Rastérisation…");
    execFileSync(
      "pdftoppm",
      ["-jpeg", "-jpegopt", `quality=${QUALITE}`, "-r", String(DPI), SOURCE, join(atelier, "p")],
      { stdio: "inherit" },
    );

    /* Tri lexicographique : `pdftoppm` numérote sur largeur fixe (p-01, p-02…),
     * donc l'ordre alphabétique est l'ordre des pages. Le vérifier quand même —
     * une carte dont les pages sont mélangées ne se voit qu'à l'ouverture. */
    const images = readdirSync(atelier)
      .filter((f) => f.endsWith(".jpg"))
      .sort();
    if (images.length !== pages) {
      throw new Error(`${images.length} images rendues pour ${pages} pages attendues.`);
    }

    console.log(`Assemblage de ${images.length} pages…`);
    const doc = new PDFDocument({ size: [largeur, hauteur], margin: 0, autoFirstPage: false });
    doc.info.Title = "Ô 3 Saveurs — Carte";
    doc.info.Author = "Ô 3 Saveurs";

    const flux = createWriteStream(SORTIE);
    doc.pipe(flux);
    for (const img of images) {
      doc.addPage({ size: [largeur, hauteur], margin: 0 });
      doc.image(join(atelier, img), 0, 0, { width: largeur, height: hauteur });
    }
    doc.end();

    flux.on("finish", () => {
      const apres = statSync(SORTIE).size;
      console.log(`\n✅ ${SORTIE}`);
      console.log(`   ${mo(avant)} → ${mo(apres)}  (${(apres / avant * 100).toFixed(1)} % du poids d'origine)`);
      console.log("\nLa couche texte a disparu avec la rastérisation : c'est voulu.");
      console.log("Elle portait d'anciens prix sous les corrections (RECONCILIATION-CARTE.md §13).");
      rmSync(atelier, { recursive: true, force: true });
    });
  } catch (e) {
    rmSync(atelier, { recursive: true, force: true });
    throw e;
  }
}

main();
