/* QR code de la carte, rendu en SVG côté serveur.
 *
 * Le SVG plutôt qu'un PNG : le QR reste net à l'impression (affichette de
 * table, vitrine, flyer) quelle que soit la taille, pour ~1 ko. Rien n'est
 * expédié au navigateur en JavaScript — la page l'affiche dans une balise
 * `<img>` ordinaire.
 *
 * L'adresse encodée est déduite des en-têtes de la requête et non d'une
 * constante : le même code sert donc en préproduction, sur le domaine
 * définitif et en local, sans configuration. `NEXTAUTH_URL` ne sert que de
 * repli quand l'en-tête `host` manque.
 */

import QRCode from "qrcode";
import { headers } from "next/headers";

/** Cibles autorisées. Une liste fermée : le paramètre vient de l'URL. */
const TARGETS = {
  /** la carte en ligne — le visiteur peut commander dans la foulée */
  carte: "/carte",
  /** le PDF officiel — la carte à emporter, hors ligne */
  pdf: "/carte-o3-saveurs.pdf",
} as const;

type Target = keyof typeof TARGETS;

const isTarget = (v: string | null): v is Target => v !== null && v in TARGETS;

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return process.env.NEXTAUTH_URL ?? "https://o3saveurs.fr";

  /* `x-forwarded-proto` est posé par le proxy de l'hébergeur (Clever Cloud). En
   * local il est absent et l'hôte commence par `localhost` : le https forcé
   * donnerait un QR qui ne s'ouvre pas pendant le développement. */
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const param = new URL(req.url).searchParams.get("cible");
  const target: Target = isTarget(param) ? param : "carte";

  const url = `${await requestOrigin()}${TARGETS[target]}`;

  const svg = await QRCode.toString(url, {
    type: "svg",
    /* `M` corrige environ 15 % de surface abîmée : la marge de sûreté usuelle
     * pour un code imprimé qui prend la buée d'un service ou le soleil d'une
     * vitrine. `H` grossirait la trame sans bénéfice ici. */
    errorCorrectionLevel: "M",
    /* Zone silencieuse de 2 modules. Le défaut de la bibliothèque est 4, ce qui
     * creuse un cadre blanc visible dans la pastille de la page. Deux modules
     * restent au-dessus du seuil de lecture des téléphones actuels. */
    margin: 2,
    color: { dark: "#1f1a17", light: "#ffffff" },
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      /* Le code ne dépend que du domaine : il ne changera pas d'une semaine à
       * l'autre. On le laisse en cache partagé, revalidé en tâche de fond. */
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
