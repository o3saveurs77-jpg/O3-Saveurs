/**
 * Déclare le point de terminaison Stripe du site — `npm run stripe:webhook`.
 *
 * C'est la panne la plus coûteuse de la mise en ligne, et la plus silencieuse :
 * sans ce webhook, le client paie, Stripe encaisse, et la commande reste « en
 * attente de paiement ». Ni facture, ni passage en cuisine, et aucune erreur
 * nulle part — le site a l'air de marcher.
 *
 * Le secret de signature n'est renvoyé qu'**à la création**. Stripe ne le
 * redonne jamais ensuite : si on le perd, il faut supprimer le point de
 * terminaison et le recréer. D'où le soin mis ici à l'afficher une fois, en
 * clair, avec la variable où le coller.
 *
 * Prudent par défaut : sans `--appliquer`, il n'écrit rien chez Stripe.
 *
 * Usage :
 *   npm run stripe:webhook                       # état actuel
 *   npm run stripe:webhook -- --appliquer        # crée le point de terminaison
 *   npm run stripe:webhook -- --url=https://autre.fr --appliquer
 */

import Stripe from "stripe";

try {
  process.loadEnvFile();
} catch {
  /* variables déjà présentes dans l'environnement */
}

const args = process.argv.slice(2);
const appliquer = args.includes("--appliquer");
const urlArg = args.find((a) => a.startsWith("--url="))?.slice("--url=".length);

/** Les cinq événements traités par `app/api/webhooks/stripe/route.ts`. */
const EVENEMENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
];

const cle = (process.env.STRIPE_SECRET_KEY ?? "").trim();
const origine = (urlArg ?? process.env.NEXTAUTH_URL ?? "").trim().replace(/\/+$/, "");

if (!cle) {
  console.error("❌ STRIPE_SECRET_KEY absente.");
  process.exit(1);
}
if (!origine.startsWith("https://")) {
  console.error(`❌ ${origine || "(NEXTAUTH_URL absente)"} — Stripe exige une adresse HTTPS.`);
  process.exit(1);
}

const url = `${origine}/api/webhooks/stripe`;
const modeTest = cle.startsWith("sk_test_");

const stripe = new Stripe(cle);

function manquants(actuels: string[]): string[] {
  return EVENEMENTS.filter((e) => !actuels.includes(e) && !actuels.includes("*"));
}

async function main() {
  console.log(`Mode      : ${modeTest ? "TEST — aucune carte réelle n'est débitée" : "LIVE"}`);
  console.log(`Adresse   : ${url}\n`);

  const { data } = await stripe.webhookEndpoints.list({ limit: 100 });
  const existant = data.find((e) => e.url === url);

  if (existant) {
    console.log(`Point de terminaison déjà déclaré : ${existant.id} (${existant.status})`);
    const absents = manquants(existant.enabled_events);
    if (!absents.length) {
      console.log("Événements : complets ✅");
    } else {
      console.log("Événements ABSENTS :");
      for (const e of absents) console.log(`  · ${e}`);
      if (appliquer) {
        await stripe.webhookEndpoints.update(existant.id, { enabled_events: EVENEMENTS });
        console.log("→ complétés ✅");
      } else {
        console.log("→ relancer avec --appliquer pour les ajouter.");
      }
    }
    console.log(
      "\n⚠ Le secret de signature n'est pas relisible : Stripe ne le renvoie qu'à la création.\n" +
        "  S'il a été perdu, supprimer ce point de terminaison dans le dashboard puis relancer ce script.",
    );
    return;
  }

  console.log("Aucun point de terminaison sur cette adresse.");
  console.log("Événements à déclarer :");
  for (const e of EVENEMENTS) console.log(`  · ${e}`);

  if (!appliquer) {
    console.log("\nRien n'a été créé. Relancer avec --appliquer.");
    return;
  }

  const cree = await stripe.webhookEndpoints.create({
    url,
    enabled_events: EVENEMENTS,
    description: "Ô 3 Saveurs — commandes et remboursements",
  });

  console.log(`\n✅ Créé : ${cree.id}`);
  console.log("\nÀ reporter dans l'environnement de déploiement :\n");
  console.log(`  STRIPE_WEBHOOK_SECRET="${cree.secret}"`);
  console.log("\nCe secret ne sera plus jamais affiché.");
}

main().catch((e) => {
  console.error("\n❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
