/* Le projet lisait `process.env.X` à une douzaine d'endroits, sans jamais
 * vérifier que la variable existe ni qu'elle vaut autre chose que la valeur
 * d'exemple livrée dans `.env.example`. Conséquences concrètes :
 *
 *  - `AUTH_SECRET` resté sur sa valeur d'exemple signe les jetons de session
 *    avec une chaîne publique : n'importe qui peut se forger une session
 *    administrateur. Rien ne le signalait.
 *  - Une clé Stripe oubliée ne se manifestait qu'au moment du paiement, sur la
 *    commande d'un vrai client.
 *
 * Ce module regroupe la vérification. Il est importé par `lib/prisma.ts`, donc
 * évalué au premier accès à la base : en production, un démarrage avec une
 * configuration incomplète s'arrête ici, avec la liste de ce qui manque.
 */

/** Valeurs livrées dans `.env.example` — utilisables en local, jamais en ligne. */
const PLACEHOLDERS = [
  "dev-secret-a-remplacer-openssl-rand-base64-32",
  "sk_test_placeholder",
  "pk_test_placeholder",
  "whsec_placeholder",
  "vercel_blob_rw_placeholder",
  "re_placeholder",
];

interface Rule {
  /** Nom de la variable. */
  key: string;
  /** À quoi elle sert — repris tel quel dans le message d'erreur. */
  role: string;
  /** Longueur minimale attendue (secrets). */
  min?: number;
  /** Contrôle supplémentaire ; renvoie un message d'erreur ou `null`. */
  check?: (v: string) => string | null;
  /** Ne contrôler qu'en ligne — `localhost` est légitime en développement. */
  prodOnly?: boolean;
}

const REQUIRED: Rule[] = [
  { key: "DATABASE_URL", role: "connexion à la base", min: 20 },
  {
    key: "AUTH_SECRET",
    role: "signature des jetons de session",
    min: 32,
  },
  {
    key: "NEXTAUTH_URL",
    role: "URL publique du site (liens d'email, redirections de connexion)",
    prodOnly: true,
    check: (v) =>
      v.includes("localhost") || v.includes("127.0.0.1")
        ? "pointe encore sur localhost — les liens envoyés par email seront inutilisables"
        : null,
  },
];

/**
 * Vérifie la configuration. Lève en production, avertit en développement.
 *
 * Le développement n'est volontairement pas bloqué : on doit pouvoir lancer le
 * site sans compte Stripe ni Resend. Seule la mise en ligne exige le jeu
 * complet.
 */
export function assertEnv(): void {
  /* `next build` prérend les pages avec `NODE_ENV=production` : lever ici
   * ferait échouer la compilation sur une machine de build qui n'a pas
   * forcément les secrets d'exécution. On avertit dans ce cas, et on ne bloque
   * qu'au démarrage réel du serveur. */
  const build = process.env.NEXT_PHASE === "phase-production-build";
  const prod = process.env.NODE_ENV === "production" && !build;
  const problemes: string[] = [];

  for (const r of REQUIRED) {
    const v = process.env[r.key]?.trim() ?? "";

    if (!v) {
      problemes.push(`${r.key} est absente — ${r.role}.`);
      continue;
    }
    if (PLACEHOLDERS.includes(v)) {
      problemes.push(`${r.key} vaut encore la valeur d'exemple — ${r.role}.`);
      continue;
    }
    if (r.min && v.length < r.min) {
      problemes.push(`${r.key} fait ${v.length} caractères, ${r.min} minimum — ${r.role}.`);
      continue;
    }
    if (r.prodOnly && !prod) continue;
    const msg = r.check?.(v);
    if (msg) problemes.push(`${r.key} ${msg}.`);
  }

  if (problemes.length === 0) return;

  const texte =
    "Configuration incomplète :\n" +
    problemes.map((p) => `  · ${p}`).join("\n") +
    "\n\nRenseignez ces variables dans l'environnement de déploiement " +
    "(Vercel : Settings → Environment Variables).";

  if (prod) throw new Error(texte);
  console.warn(`\x1b[33m[env]\x1b[0m ${texte}\n`);
}
