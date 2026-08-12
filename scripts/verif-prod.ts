/**
 * Vérificateur de configuration avant mise en ligne — `npm run verif:prod`.
 *
 * Cette session a passé plusieurs heures sur trois pannes qui n'étaient pas des
 * bugs mais des variables absentes : un stockage jamais créé, des identifiants
 * Auth0 oubliés, un jeton resté à sa valeur d'exemple. Chaque fois, le symptôme
 * était muet ou trompeur. Ce script pose les questions à la place de
 * l'exploitation, avant que le client ne les découvre.
 *
 * Lecture seule : il n'écrit rien, ni en base, ni chez un fournisseur.
 */

try {
  process.loadEnvFile();
} catch {
  /* variables déjà présentes dans l'environnement */
}

type Gravite = "bloquant" | "important" | "info";

interface Constat {
  gravite: Gravite;
  quoi: string;
  /** Ce qui casse concrètement si on part en ligne comme ça. */
  consequence: string;
}

const constats: Constat[] = [];
const ok: string[] = [];

const vide = (v?: string) => !v || !v.trim();
const exemple = (v?: string) =>
  !!v && /placeholder|remplacer|xxx|a-remplacer|exemple/i.test(v);

function exige(cle: string, quoi: string, consequence: string, gravite: Gravite = "bloquant") {
  const v = process.env[cle];
  if (vide(v)) constats.push({ gravite, quoi: `${cle} absente — ${quoi}`, consequence });
  else if (exemple(v)) {
    constats.push({ gravite, quoi: `${cle} vaut encore sa valeur d'exemple`, consequence });
  } else ok.push(cle);
}

// ── Base et session ──
exige("DATABASE_URL", "connexion à la base", "Le site ne démarre pas.");
exige("DIRECT_URL", "migrations Prisma", "`prisma migrate deploy` échouera au déploiement.");
exige(
  "AUTH_SECRET",
  "signature des sessions",
  "Sur une valeur d'exemple, n'importe qui peut se forger une session administrateur.",
);
exige(
  "NEXTAUTH_URL",
  "adresse publique du site",
  "Les liens des emails et le retour de connexion Auth0 pointeront au mauvais endroit.",
);

// ── Auth0 ──
exige("AUTH0_CLIENT_ID", "connexion Auth0", "Personne ne peut se connecter.");
exige("AUTH0_CLIENT_SECRET", "connexion Auth0", "Personne ne peut se connecter.");
exige("AUTH0_ISSUER", "domaine du tenant Auth0", "Personne ne peut se connecter.");
exige(
  "AUTH0_M2M_CLIENT_ID",
  "relecture des rôles",
  "L'écran « Accès & rôles » échoue, et un rôle retiré reste actif jusqu'à la reconnexion.",
  "important",
);
exige(
  "AUTH0_M2M_CLIENT_SECRET",
  "relecture des rôles",
  "Idem : les rôles ne sont plus relus en cours de session.",
  "important",
);

// ── Paiement ──
exige("STRIPE_SECRET_KEY", "encaissement", "Aucun paiement par carte n'aboutit.");
exige(
  "STRIPE_WEBHOOK_SECRET",
  "confirmation de paiement",
  "Les paiements aboutissent chez Stripe mais la commande reste « en attente » : ni facture, ni passage en cuisine.",
);

// ── Emails ──
exige(
  "RESEND_API_KEY",
  "envoi des emails",
  "Les 18 emails sont journalisés mais aucun ne part : ni confirmation, ni facture, ni alerte de commande.",
);
exige("RESEND_FROM_EMAIL", "expéditeur des emails", "Resend refusera les envois.");
exige(
  "RESTAURANT_NOTIFY_EMAIL",
  "alertes du restaurant",
  "Vous ne recevez ni les nouvelles commandes, ni les demandes d'annulation, ni les incidents de livraison.",
);

// ── Stockage des photos ──
exige(
  "CELLAR_ADDON_HOST",
  "stockage des photos",
  "Aucun téléversement de photo n'est possible.",
  "important",
);
exige("CELLAR_ADDON_KEY_ID", "stockage des photos", "Idem.", "important");
exige("CELLAR_ADDON_KEY_SECRET", "stockage des photos", "Idem.", "important");
exige(
  "CELLAR_BUCKET",
  "nom du bucket de photos",
  "L'addon Cellar ne fournit pas le nom du bucket : il faut le déclarer.",
  "important",
);

// ── Tâches planifiées ──
exige(
  "CRON_SECRET",
  "protection des tâches planifiées",
  "Sans elle les routes cron sont refusées : ni anonymisation RGPD, ni relance des paniers.",
  "important",
);

// ── Cohérence entre variables ──
const hoteServeur = (process.env.CELLAR_ADDON_HOST ?? "").trim().replace(/^https?:\/\//, "");
const hotePublic = (process.env.NEXT_PUBLIC_STORAGE_HOST ?? "").trim().replace(/^https?:\/\//, "");

if (hoteServeur && hotePublic && hoteServeur !== hotePublic) {
  constats.push({
    gravite: "bloquant",
    quoi: "CELLAR_ADDON_HOST et NEXT_PUBLIC_STORAGE_HOST diffèrent",
    consequence:
      "Les photos seront déposées à un endroit que le navigateur refusera d'afficher : vignettes vides, sans erreur.",
  });
} else if (hoteServeur && !hotePublic) {
  constats.push({
    gravite: "bloquant",
    quoi: "NEXT_PUBLIC_STORAGE_HOST absente alors que le stockage est configuré",
    consequence:
      "Le téléversement fonctionnera, mais l'adresse produite sera rejetée à l'enregistrement.",
  });
} else if (hoteServeur) ok.push("cohérence des hôtes de stockage");

const url = (process.env.NEXTAUTH_URL ?? "").trim();
if (url.includes("localhost") || url.includes("127.0.0.1")) {
  constats.push({
    gravite: "bloquant",
    quoi: "NEXTAUTH_URL pointe sur localhost",
    consequence: "Les liens des emails seront inutilisables et la connexion Auth0 échouera.",
  });
}
if (url && !url.startsWith("https://")) {
  constats.push({
    gravite: "bloquant",
    quoi: "NEXTAUTH_URL n'est pas en HTTPS",
    consequence: "Les cookies de session sécurisés ne seront pas acceptés par le navigateur.",
  });
}

// ── Rapport ──
const par = (g: Gravite) => constats.filter((c) => c.gravite === g);
const LABEL: Record<Gravite, string> = {
  bloquant: "BLOQUANT",
  important: "IMPORTANT",
  info: "info",
};

/* Rappel de la cible lue : lancé sur un poste de développement, ce script
 * signalera forcément `localhost` et des variables d'hébergeur absentes. Il
 * n'a de sens qu'exécuté avec l'environnement réel de production — sur Clever
 * Cloud, `clever ssh` puis `npm run verif:prod`. */
console.log(`\nEnvironnement lu : ${url || "(NEXTAUTH_URL absente)"}`);
console.log(`${ok.length} vérification(s) au vert.\n`);

for (const g of ["bloquant", "important", "info"] as Gravite[]) {
  const liste = par(g);
  if (!liste.length) continue;
  console.log(`── ${LABEL[g]} (${liste.length}) ──`);
  for (const c of liste) {
    console.log(`  · ${c.quoi}`);
    console.log(`    → ${c.consequence}`);
  }
  console.log("");
}

if (par("bloquant").length) {
  console.log("❌ Ne pas mettre en ligne en l'état.\n");
  process.exit(1);
}
if (par("important").length) {
  console.log("⚠ Le site fonctionnera, mais avec les manques ci-dessus.\n");
  process.exit(0);
}
console.log("✅ Configuration complète.\n");
