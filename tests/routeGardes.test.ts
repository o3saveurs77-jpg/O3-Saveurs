import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* Balayage d'autorisation sur l'ensemble des routes API.
 *
 * Ce qu'on protège : le fait qu'aucune route d'écriture ne soit accessible sans
 * y avoir droit. `lib/guard.ts` le dit en une phrase — « le middleware ne
 * protège que les *pages* `/admin`, il ne couvre aucune route `/api/*` » — et
 * c'est exactement ce qui rend ce balayage nécessaire : la seule défense d'un
 * `DELETE /api/dishes/[id]` est l'appel à `requireAdmin()` écrit en tête du
 * handler. Une route ajoutée sans cet appel n'échouerait nulle part ailleurs.
 *
 * Pourquoi un balayage et non une liste : une liste écrite à la main vieillit
 * mal. Elle ne dit rien d'une route créée demain, et c'est précisément celle-là
 * qui risque d'oublier sa garde. On énumère donc `app/api/**\/route.ts` depuis le
 * disque, on importe chaque module, et on exige de chaque verbe d'écriture
 * (`POST`, `PUT`, `PATCH`, `DELETE`) un refus — 401 sans session, 403 avec une
 * session CLIENT — **et aucune écriture en base**.
 *
 * Les dérogations sont déclarées une par une plus bas, avec leur raison. Une
 * dérogation non motivée est une faille déguisée en exception.
 */

vi.mock("@/auth", async () => {
  const m = await import("./aide/adminSession");
  return { auth: m.authSimulee };
});

vi.mock("@/lib/prisma", async () => {
  const m = await import("./aide/adminPrisma");
  return { prisma: m.prismaDouble.client };
});

/* La clé Resend du dépôt est active : aucune route ne doit pouvoir envoyer un
 * vrai email depuis une suite de tests. */
vi.mock("@/lib/email", async () => {
  const m = await import("./aide/adminPrisma");
  return m.doubleEmail();
});

import { commeClient, commeLivreur, sansSession } from "./aide/adminSession";
import { prismaDouble } from "./aide/adminPrisma";
import { appeler, contexte, lire, requete, type Methode } from "./aide/adminRequete";

/* `import.meta.glob` est résolu par Vite à la compilation : c'est ce qui permet
 * d'importer 70 modules sans les nommer un par un. Le type n'est pas fourni
 * (`vite/client` n'est pas dans `tsconfig`), on le déclare ici. */
declare global {
  interface ImportMeta {
    glob: (motif: string) => Record<string, () => Promise<Record<string, unknown>>>;
  }
}

const modules = import.meta.glob("../app/api/**/route.ts");

const VERBES: Methode[] = ["POST", "PUT", "PATCH", "DELETE"];

/** `"../app/api/dishes/[id]/route.ts"` → `"/api/dishes/[id]"`. */
function cheminRoute(cle: string): string {
  return cle.replace(/^\.\.\/app/, "").replace(/\/route\.ts$/, "");
}

/**
 * Routes entièrement hors balayage.
 *
 * `/api/auth/[...nextauth]` **est** le point d'entrée d'authentification : il
 * réexporte les handlers de NextAuth. Exiger qu'il refuse un appel anonyme
 * n'aurait aucun sens — c'est par là qu'on se connecte.
 */
const HORS_BALAYAGE = new Set<string>(["/api/auth/[...nextauth]"]);

/**
 * Dérogations, verbe par verbe, avec leur justification métier.
 *
 * Le format `"/api/contact POST"` est volontairement verbeux : ajouter une
 * dérogation demande d'écrire noir sur blanc pourquoi la route s'ouvre.
 */
const DEROGATIONS: Record<string, string> = {
  // ── Appelants qui ne sont pas des personnes ──────────────────
  "/api/webhooks/stripe POST":
    "Appelé par Stripe, authentifié par la signature `stripe-signature` et non par une session.",
  "/api/tournee/[token] POST":
    "Lien privé envoyé par SMS au livreur : le jeton de l'URL est l'autorisation (voir lib/deliveryAccess).",

  // ── Actions que le public doit pouvoir faire ─────────────────
  "/api/checkout POST": "Tunnel de commande : la commande en invité est le cas d'usage principal.",
  "/api/contact POST": "Formulaire de contact du site, ouvert par nature.",
  "/api/newsletter POST": "Inscription à la newsletter depuis le pied de page.",
  "/api/tickets POST": "Réclamation déposée par un client, y compris sans compte, sur sa commande.",
  "/api/traiteur POST": "Demande de devis traiteur depuis la page publique.",
  "/api/promotions/verify POST":
    "Vérification d'un code saisi dans le panier : lecture seule, aucune écriture.",
  "/api/delivery-quote POST":
    "Devis de livraison affiché avant de commander : calcul en lecture seule, aucune écriture.",
  "/api/banners/[id]/click POST":
    "Compteur de clic d'un encart : incrément atomique, 204 sans corps, appelé en `keepalive`.",
  "/api/orders/[id]/cancel POST":
    "Annulation par le client de sa propre commande ; l'appartenance est vérifiée par `canAccess` (voir plus bas).",

  // ── Défaut constaté, démontré plus bas ───────────────────────
  "/api/admin/roles POST":
    "DÉFAUT : répond 500 sans aucune garde au lieu de refuser l'appelant. Voir le test `it.fails` en fin de fichier.",
};

/**
 * Routes légitimement ouvertes à **tout compte connecté**, quel que soit le
 * rôle : elles ne touchent que les données de l'appelant lui-même.
 */
const OUVERTES_AUX_CONNECTES: Record<string, string> = {
  "/api/auth/me PATCH": "Chacun modifie son propre profil (nom, téléphone, adresses).",
  "/api/tickets/[id]/messages POST":
    "Un client répond dans le fil de sa réclamation ; celle d'un tiers répond 404.",
};

/** Contexte générique : couvre `[id]`, `[token]` et `[dishId]`. */
const CTX = () => contexte({ id: "x", token: "jeton-inconnu", dishId: "d1" });

interface Cible {
  chemin: string;
  verbe: Methode;
  handler: (req: Request, ctx?: unknown) => Promise<Response>;
}

/* Les soixante-dix modules ne sont chargés qu'une fois : l'import est le poste
 * de coût du balayage, et chaque test en a besoin en entier. */
let cache: Promise<Cible[]> | null = null;

/** Charge tous les modules et liste les couples (route, verbe d'écriture). */
function ciblesDEcriture(): Promise<Cible[]> {
  cache ??= (async () => {
    const out: Cible[] = [];
    for (const [cle, charger] of Object.entries(modules).sort()) {
      const chemin = cheminRoute(cle);
      if (HORS_BALAYAGE.has(chemin)) continue;
      const mod = await charger();
      for (const verbe of VERBES) {
        if (typeof mod[verbe] !== "function") continue;
        out.push({
          chemin,
          verbe,
          handler: mod[verbe] as (req: Request, ctx?: unknown) => Promise<Response>,
        });
      }
    }
    return out;
  })();
  return cache;
}

/** Marge large : le premier appel importe l'intégralité de `app/api`. */
const DELAI_BALAYAGE = 120_000;

beforeEach(() => {
  prismaDouble.reinitialiser();
  sansSession();
});

/* Le balayage ne vaut que s'il voit vraiment toutes les routes. Si `glob` et le
 * disque divergent, c'est le balayage qui est faux, pas le dépôt. */
describe("inventaire des routes", () => {
  it("le balayage couvre tous les fichiers `route.ts` du disque", () => {
    const racine = path.resolve(__dirname, "..");
    const surDisque: string[] = [];
    const descendre = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) descendre(p);
        else if (e.name === "route.ts") {
          surDisque.push("/" + path.relative(path.join(racine, "app"), p).split(path.sep).join("/"));
        }
      }
    };
    descendre(path.join(racine, "app", "api"));

    const balayees = Object.keys(modules).map((k) => k.replace(/^\.\.\/app/, ""));
    expect(balayees.sort()).toEqual(surDisque.sort());
  });

  it("chaque dérogation désigne une route et un verbe qui existent", async () => {
    const existantes = new Set((await ciblesDEcriture()).map((c) => `${c.chemin} ${c.verbe}`));
    const fantomes = [...Object.keys(DEROGATIONS), ...Object.keys(OUVERTES_AUX_CONNECTES)].filter(
      (cle) => !existantes.has(cle),
    );
    // Une dérogation qui ne correspond plus à rien laisse croire qu'un trou est
    // couvert alors que la route a été renommée.
    expect(fantomes).toEqual([]);
  }, DELAI_BALAYAGE);

  it("chaque dérogation est motivée", () => {
    const muettes = Object.entries({ ...DEROGATIONS, ...OUVERTES_AUX_CONNECTES })
      .filter(([, raison]) => raison.trim().length < 20)
      .map(([cle]) => cle);
    expect(muettes).toEqual([]);
  });
});

/* Le cœur du balayage. Un échec ici nomme la route et le verbe : c'est une
 * faille d'autorisation, pas un test à ajuster. */
describe("refus d'un appelant non authentifié", () => {
  it("toute route d'écriture répond 401 ou 403 sans session", async () => {
    const fautes: string[] = [];

    for (const { chemin, verbe, handler } of await ciblesDEcriture()) {
      const cle = `${chemin} ${verbe}`;
      if (cle in DEROGATIONS) continue;

      prismaDouble.reinitialiser();
      sansSession();

      let statut: number | string;
      try {
        statut = (await appeler(handler, requete(verbe, `http://localhost${chemin}`, {}), CTX()))
          .status;
      } catch (error) {
        statut = `a levé ${String(error).slice(0, 80)}`;
      }

      if (statut !== 401 && statut !== 403) fautes.push(`${cle} → ${statut}`);
      const ecritures = prismaDouble.ecritures();
      if (ecritures.length > 0) {
        fautes.push(`${cle} a écrit en base sans session : ${ecritures.map((e) => e.cible)}`);
      }
    }

    expect(fautes).toEqual([]);
  }, DELAI_BALAYAGE);

  it("le balayage porte sur un nombre de routes crédible", async () => {
    const cibles = await ciblesDEcriture();
    // Garde-fou contre un balayage qui se viderait sans qu'on le remarque (un
    // `glob` cassé rendrait tous les tests ci-dessus verts et vides).
    expect(cibles.length).toBeGreaterThan(60);
    expect(new Set(cibles.map((c) => c.chemin)).size).toBeGreaterThan(40);
  }, DELAI_BALAYAGE);
});

describe("refus d'un appelant CLIENT", () => {
  it("toute route d'écriture réservée à l'administration répond 403 pour un CLIENT", async () => {
    const fautes: string[] = [];

    for (const { chemin, verbe, handler } of await ciblesDEcriture()) {
      const cle = `${chemin} ${verbe}`;
      if (cle in DEROGATIONS || cle in OUVERTES_AUX_CONNECTES) continue;

      prismaDouble.reinitialiser();
      commeClient();

      let statut: number | string;
      try {
        statut = (await appeler(handler, requete(verbe, `http://localhost${chemin}`, {}), CTX()))
          .status;
      } catch (error) {
        statut = `a levé ${String(error).slice(0, 80)}`;
      }

      if (statut !== 401 && statut !== 403) fautes.push(`${cle} → ${statut}`);
      const ecritures = prismaDouble.ecritures();
      if (ecritures.length > 0) {
        fautes.push(`${cle} a écrit en base pour un CLIENT : ${ecritures.map((e) => e.cible)}`);
      }
    }

    expect(fautes).toEqual([]);
  }, DELAI_BALAYAGE);

  /* Le rôle LIVREUR est le piège classique : il ouvre `/api/livreur/*` et rien
   * d'autre. Confondre « connecté » et « habilité » lui donnerait la carte, les
   * tarifs et les réglages. */
  it("un LIVREUR n'a pas davantage accès à l'administration qu'un CLIENT", async () => {
    const fautes: string[] = [];

    for (const { chemin, verbe, handler } of await ciblesDEcriture()) {
      const cle = `${chemin} ${verbe}`;
      if (cle in DEROGATIONS || cle in OUVERTES_AUX_CONNECTES) continue;
      if (chemin.startsWith("/api/livreur")) continue; // sa porte légitime

      prismaDouble.reinitialiser();
      commeLivreur();

      let statut: number | string;
      try {
        statut = (await appeler(handler, requete(verbe, `http://localhost${chemin}`, {}), CTX()))
          .status;
      } catch (error) {
        statut = `a levé ${String(error).slice(0, 80)}`;
      }
      if (statut !== 401 && statut !== 403) fautes.push(`${cle} → ${statut}`);
    }

    expect(fautes).toEqual([]);
  }, DELAI_BALAYAGE);
});

/* Les dérogations ne sont pas des angles morts : chacune est éprouvée ici pour
 * ce qu'elle garde réellement à la place d'une session. */
describe("dérogations — ce qui tient lieu de session", () => {
  it("le webhook Stripe refuse un appel sans signature", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const r = await appeler(POST, requete("POST", "http://localhost/api/webhooks/stripe", {}));
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("la tournée par lien refuse un jeton inconnu", async () => {
    const { POST } = await import("@/app/api/tournee/[token]/route");
    // Aucune tournée ne porte ce jeton : `deliveryRun.findUnique` rend `null`.
    const r = await appeler(
      POST,
      requete("POST", "http://localhost/api/tournee/x", { action: "livree" }),
      contexte({ token: "jeton-inconnu" }),
    );
    expect(r.status).toBe(404);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("l'annulation d'une commande refuse quelqu'un qui n'en est pas le client", async () => {
    const { POST } = await import("@/app/api/orders/[id]/cancel/route");
    prismaDouble.quand("order.findUnique", {
      id: "c1",
      customerEmail: "vraie.cliente@exemple.fr",
      status: "confirmee",
      cancelRequestedAt: null,
      lines: "[]",
    });

    // Anonyme : connaître l'identifiant ne suffit pas.
    const anonyme = await appeler(
      POST,
      requete("POST", "http://localhost/api/orders/c1/cancel", {}),
      contexte({ id: "c1" }),
    );
    expect(anonyme.status).toBe(403);

    // Connecté, mais ce n'est pas sa commande.
    commeClient("quelqu.un.dautre@exemple.fr");
    const tiers = await appeler(
      POST,
      requete("POST", "http://localhost/api/orders/c1/cancel", {}),
      contexte({ id: "c1" }),
    );
    expect(tiers.status).toBe(403);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("le devis de livraison et la vérification de code n'écrivent rien", async () => {
    const devis = await import("@/app/api/delivery-quote/route");
    await appeler(devis.POST, requete("POST", "http://localhost/api/delivery-quote", {}));
    expect(prismaDouble.ecritures()).toHaveLength(0);

    prismaDouble.reinitialiser();
    const verif = await import("@/app/api/promotions/verify/route");
    await appeler(verif.POST, requete("POST", "http://localhost/api/promotions/verify", {}));
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("le compteur de clic d'un encart ne touche que son compteur", async () => {
    const { POST } = await import("@/app/api/banners/[id]/click/route");
    const res = await POST(
      requete("POST", "http://localhost/api/banners/b1/click"),
      contexte({ id: "b1" }),
    );
    expect(res.status).toBe(204);
    const ecritures = prismaDouble.ecritures();
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0].cible).toBe("banner.update");
    expect(ecritures[0].args[0]).toEqual({ where: { id: "b1" }, data: { clicks: { increment: 1 } } });
  });

  it("une réclamation déposée publiquement reste soumise à validation", async () => {
    const { POST } = await import("@/app/api/tickets/route");
    const r = await appeler(POST, requete("POST", "http://localhost/api/tickets", {}));
    // Ouverte, mais pas sans contenu : un corps vide est refusé, pas enregistré.
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });
});

/* Les tâches planifiées n'ont pas de session : leur seule porte est le secret
 * partagé `CRON_SECRET`. Une purge RGPD déclenchable par un inconnu
 * anonymiserait les commandes du restaurant à la demande. */
describe("tâches planifiées — jeton partagé", () => {
  const CRONS = ["@/app/api/cron/retention/route", "@/app/api/cron/abandoned-carts/route"];

  it("refusent un appel sans en-tête d'autorisation", async () => {
    vi.stubEnv("CRON_SECRET", "secret-de-test-123456");
    for (const mod of CRONS) {
      const { GET } = (await import(mod)) as { GET: (r: Request) => Promise<Response> };
      const r = await lire(await GET(requete("GET", "http://localhost/api/cron")));
      expect(r.status).toBe(401);
    }
    expect(prismaDouble.ecritures()).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it("refusent un jeton erroné", async () => {
    vi.stubEnv("CRON_SECRET", "secret-de-test-123456");
    for (const mod of CRONS) {
      const { GET } = (await import(mod)) as { GET: (r: Request) => Promise<Response> };
      const r = await lire(
        await GET(
          requete("GET", "http://localhost/api/cron", undefined, {
            authorization: "Bearer mauvais-secret",
          }),
        ),
      );
      expect(r.status).toBe(401);
    }
    expect(prismaDouble.ecritures()).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it("refusent tout le monde si le secret n'est pas configuré", async () => {
    // Sans secret côté serveur, la seule réponse sûre est le refus : accepter
    // reviendrait à publier la purge RGPD.
    vi.stubEnv("CRON_SECRET", "");
    for (const mod of CRONS) {
      const { GET } = (await import(mod)) as { GET: (r: Request) => Promise<Response> };
      const r = await lire(
        await GET(
          requete("GET", "http://localhost/api/cron", undefined, { authorization: "Bearer " }),
        ),
      );
      expect(r.status).toBe(401);
    }
    vi.unstubAllEnvs();
  });

  it("laissent passer le bon jeton", async () => {
    // Sans ce contre-test, les trois précédents passeraient au vert même si la
    // route refusait tout le monde en permanence.
    vi.stubEnv("CRON_SECRET", "secret-de-test-123456");
    const { GET } = await import("@/app/api/cron/retention/route");
    const r = await lire(
      await GET(
        requete("GET", "http://localhost/api/cron/retention", undefined, {
          authorization: "Bearer secret-de-test-123456",
        }),
      ),
    );
    expect(r.status).not.toBe(401);
    vi.unstubAllEnvs();
  });
});

/* ───────────────────────────────────────────────────────────────
 * Défaut constaté — `POST /api/admin/roles`
 *
 * La route gère les rôles Auth0 : son `PATCH` est derrière `requireAdmin()` et
 * refuse correctement. Son `POST` est un bouchon censé dire « utilisez PATCH »,
 * mais il le dit à tout le monde, **sans garde**, et avec un statut 500 : un
 * appelant anonyme obtient une erreur serveur sur une route d'administration là
 * où il devrait obtenir 401. Une méthode non gérée se refuse par 405, et le
 * contrôle d'accès ne se décide pas méthode par méthode.
 *
 * Rien n'est écrit : ce n'est pas une élévation de privilège, c'est un trou dans
 * la cohérence des gardes — et le seul endroit du dépôt où une route
 * d'administration répond autre chose qu'un refus à un inconnu.
 * ─────────────────────────────────────────────────────────────── */
describe("défaut : POST /api/admin/roles", () => {
  it.fails("devrait refuser un appelant anonyme (401/403) ou annoncer 405", async () => {
    const { POST } = await import("@/app/api/admin/roles/route");
    const res = await POST();
    expect([401, 403, 405]).toContain(res.status);
  });

  it("répond aujourd'hui 500 à n'importe qui, sans rien écrire", async () => {
    const { POST } = await import("@/app/api/admin/roles/route");
    const anonyme = await lire(POST());
    expect(anonyme.status).toBe(500);

    commeClient();
    const client = await lire(POST());
    expect(client.status).toBe(500);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });
});
