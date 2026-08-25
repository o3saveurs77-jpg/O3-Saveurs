/**
 * Prévient les moteurs qu'il y a quelque chose à explorer — `npm run seo:indexnow`.
 *
 * Un site neuf attend d'être découvert. IndexNow renverse la charge : au lieu
 * d'espérer le passage d'un robot, on lui **notifie** la liste des pages, et
 * l'exploration part dans la minute plutôt que dans les semaines. Le protocole
 * est ouvert (indexnow.org) et un seul appel dessert tous les participants —
 * Bing, Yandex, Seznam, Naver.
 *
 * ⚠️ **Google n'y participe pas.** Rien ici ne remplace la Search Console : ce
 * script ne fait rien pour la recherche Google, et le prétendre serait mentir.
 * Ce qu'il apporte est ailleurs et n'est pas négligeable pour autant : Bing
 * alimente la recherche de ChatGPT et celle de Copilot, et DuckDuckGo lit son
 * index. C'est le canal que le dépôt peut déclencher seul, sans qu'un humain
 * aille cliquer dans une console.
 *
 * L'authentification tient dans un fichier : `public/<clé>.txt` contient la
 * clé, et sa simple présence à la racine du domaine prouve qu'on en maîtrise
 * l'hébergement. La clé n'est donc **pas un secret** — elle est publique par
 * construction, versionnée avec le reste, et ne donne aucun autre pouvoir que
 * celui de signaler ses propres URL.
 *
 * À rejouer après une refonte de la carte ou l'ajout d'une page. Inutile après
 * un simple changement de prix : le plan du site porte déjà les dates de
 * modification, et les robots repassent.
 */

import { PUBLIC_ROUTES, SITE_URL, abs } from "../lib/seo";

try {
  process.loadEnvFile();
} catch {
  /* variables déjà présentes dans l'environnement */
}

/** Clé publiée dans `public/<clé>.txt`. Les deux doivent rester identiques. */
const KEY = process.env.INDEXNOW_KEY?.trim() || "29f9c6e6730d6ce909e3ac78455aa100";

const host = SITE_URL.replace(/^https?:\/\//, "").replace(/^www\./, "");
const urlList = PUBLIC_ROUTES.map((r) => abs(r.path));

async function main() {
  // Le fichier de clé d'abord : sans lui, le moteur répond 403 et le reste est
  // du temps perdu. Autant l'apprendre ici plutôt que dans un code HTTP.
  const keyUrl = `${SITE_URL}/${KEY}.txt`;
  const check = await fetch(keyUrl).catch(() => null);
  const served = check?.ok ? (await check.text()).trim() : null;

  if (served !== KEY) {
    console.error(`✗ ${keyUrl} ne sert pas la clé attendue.`);
    console.error(
      served === null
        ? "  Le fichier est introuvable — le déploiement est-il à jour ?"
        : `  Il contient « ${served.slice(0, 40)} » au lieu de « ${KEY} ».`,
    );
    console.error("  Sans ce fichier, IndexNow refuse la soumission (403).");
    process.exit(1);
  }

  console.log(`Clé vérifiée sur ${keyUrl}`);
  console.log(`Soumission de ${urlList.length} URL pour ${host} :`);
  for (const u of urlList) console.log(`  ${u}`);

  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: KEY, keyLocation: keyUrl, urlList }),
  });

  /* 200 = pris en compte, 202 = accepté, validation de la clé en attente.
     Les deux sont des succès ; tout le reste mérite d'être lu. */
  if (res.status === 200 || res.status === 202) {
    console.log(`\n✓ Accepté (HTTP ${res.status}). L'exploration part de son côté.`);
    console.log("  Google n'est pas concerné : passer par la Search Console.");
    return;
  }

  const detail = await res.text().catch(() => "");
  console.error(`\n✗ Refusé (HTTP ${res.status}). ${detail.slice(0, 300)}`);
  console.error(
    {
      400: "  Requête mal formée.",
      403: "  Clé refusée — le fichier ne correspond pas.",
      422: "  URL hors du domaine déclaré, ou clé absente du fichier.",
      429: "  Trop de soumissions : réessayer plus tard.",
    }[res.status] ?? "  Réponse inattendue du service.",
  );
  process.exit(1);
}

main().catch((e) => {
  console.error("✗ Échec :", e instanceof Error ? e.message : e);
  process.exit(1);
});
