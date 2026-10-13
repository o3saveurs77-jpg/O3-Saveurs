import { describe, it, expect, vi, beforeEach } from "vitest";

/* `PUT /api/settings` — tout ce que la cliente peut changer seule.
 *
 * Ce qu'on protège ici, et pourquoi ça mérite des tests d'exécution plutôt
 * qu'une relecture : la table `Setting` alimente les mentions légales, les
 * factures, le balisage envoyé à Google et le jeton de la borne. Une valeur mal
 * formée n'échoue pas à l'écriture — elle s'affiche. Un SIRET à treize chiffres
 * part sur une facture, un `vat.rateBp` fantaisiste s'écrit dans les CGV, et un
 * jeton de borne mal recopié n'est découvert qu'au moment où la tablette refuse
 * de commander en pleine salle.
 *
 * Deux propriétés de fond, en plus de la validation clé par clé :
 *  · le lot est **indivisible** — une seule valeur invalide ne doit laisser
 *    passer aucune des autres, sinon l'écran d'administration enregistre à
 *    moitié et affiche une erreur ;
 *  · une clé inconnue est **ignorée**, pas écrite.
 *
 * ⚠️ `.env` pointe sur la base de production : Prisma est neutralisé.
 */

vi.mock("@/auth", async () => {
  const m = await import("./aide/adminSession");
  return { auth: m.authSimulee };
});

vi.mock("@/lib/prisma", async () => {
  const m = await import("./aide/adminPrisma");
  return { prisma: m.prismaDouble.client };
});

import { GET, PUT } from "@/app/api/settings/route";
import { SETTING_DEFAULTS } from "@/lib/settings";
import {
  commeAdmin,
  commeClient,
  commeLivreur,
  sansEmail,
  sansRole,
  sansSession,
} from "./aide/adminSession";
import { prismaDouble } from "./aide/adminPrisma";
import { appeler, requete, requeteCorpsCasse, lire } from "./aide/adminRequete";

const URL_SET = "http://localhost/api/settings";

/** PUT en tant qu'ADMIN, journal Prisma remis à zéro. */
async function put(corps: unknown) {
  prismaDouble.reinitialiser();
  commeAdmin();
  return appeler(PUT, requete("PUT", URL_SET, corps));
}

/** Valeurs réellement envoyées à `setting.upsert`, par clé. */
function ecrit(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of prismaDouble.ecritures()) {
    const arg = a.args[0] as { create?: { key: string; value: string } };
    if (arg.create) out[arg.create.key] = arg.create.value;
  }
  return out;
}

beforeEach(() => {
  prismaDouble.reinitialiser();
  sansSession();
});

// ─── Garde ─────────────────────────────────────────────

/* La route n'est protégée que par l'appel à `requireAdmin()` écrit en tête du
 * handler : le middleware ne couvre pas `/api/*`. */
describe("garde de PUT /api/settings", () => {
  it("refuse un appelant anonyme par 401, sans rien écrire", async () => {
    sansSession();
    const r = await appeler(PUT, requete("PUT", URL_SET, { "vat.rateBp": "1000" }));
    expect(r.status).toBe(401);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("refuse un CLIENT connecté par 403", async () => {
    commeClient();
    const r = await appeler(PUT, requete("PUT", URL_SET, { "vat.rateBp": "1000" }));
    expect(r.status).toBe(403);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("refuse un LIVREUR connecté par 403", async () => {
    commeLivreur();
    const r = await appeler(PUT, requete("PUT", URL_SET, { "vat.rateBp": "1000" }));
    expect(r.status).toBe(403);
  });

  /* Un compte dont le claim de rôle manque retombe sur « CLIENT » dans
   * `currentUser()`. C'est l'état réel d'un compte créé avant que l'Action
   * Post-Login d'Auth0 soit branchée : il ne doit surtout pas ouvrir la porte. */
  it("refuse une session sans rôle (repli CLIENT) par 403", async () => {
    sansRole();
    const r = await appeler(PUT, requete("PUT", URL_SET, { "vat.rateBp": "1000" }));
    expect(r.status).toBe(403);
  });

  // `currentUser()` exige un email : sans lui, la session n'identifie personne.
  it("refuse une session sans email, même estampillée ADMIN", async () => {
    sansEmail();
    const r = await appeler(PUT, requete("PUT", URL_SET, { "vat.rateBp": "1000" }));
    expect(r.status).toBe(401);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("accepte un ADMIN", async () => {
    const r = await put({ "vat.rateBp": "1000" });
    expect(r.status).toBe(200);
    expect(ecrit()).toEqual({ "vat.rateBp": "1000" });
  });
});

/* Le `GET` est cloisonné : la page légale a besoin du SIRET, mais rien ne
 * justifie de livrer l'intégralité de la configuration — dont le jeton de la
 * borne — à un appel anonyme. */
describe("cloisonnement de GET /api/settings", () => {
  it("un appel anonyme ne reçoit que les clés d'affichage", async () => {
    sansSession();
    const r = await appeler<{ settings: Record<string, string>; legalComplete?: boolean }>(
      GET,
      requete("GET", URL_SET),
    );
    expect(r.status).toBe(200);
    const clefs = Object.keys(r.corps.settings);
    expect(clefs).toContain("restaurant.name");
    expect(clefs).toContain("google.reviewLink");
    // Jeton de la borne, informations légales, seuils de commande : jamais.
    expect(clefs).not.toContain("borne.token");
    expect(clefs).not.toContain("legal.siret");
    expect(clefs).not.toContain("order.slotCapacity");
    expect(r.corps.legalComplete).toBeUndefined();
  });

  it("un CLIENT connecté n'en reçoit pas davantage qu'un anonyme", async () => {
    commeClient();
    const r = await appeler<{ settings: Record<string, string> }>(GET, requete("GET", URL_SET));
    expect(Object.keys(r.corps.settings)).not.toContain("borne.token");
  });

  it("un ADMIN reçoit tous les réglages et l'état de complétude légale", async () => {
    commeAdmin();
    const r = await appeler<{ settings: Record<string, string>; legalComplete: boolean }>(
      GET,
      requete("GET", URL_SET),
    );
    expect(Object.keys(r.corps.settings).sort()).toEqual(Object.keys(SETTING_DEFAULTS).sort());
    expect(typeof r.corps.legalComplete).toBe("boolean");
  });
});

// ─── Corps de requête ──────────────────────────────────

describe("corps de requête", () => {
  it("refuse un JSON malformé sans tomber en 500", async () => {
    prismaDouble.reinitialiser();
    commeAdmin();
    const r = await lire(await PUT(requeteCorpsCasse("PUT", URL_SET)));
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("refuse un tableau et un corps non objet", async () => {
    expect((await put([])).status).toBe(400);
    expect((await put("du texte")).status).toBe(400);
    expect((await put(42)).status).toBe(400);
    expect((await put(null)).status).toBe(400);
  });

  it("refuse un lot sans aucune clé connue", async () => {
    const r = await put({});
    expect(r.status).toBe(400);
    expect(r.corps.error).toBe("Aucun réglage à enregistrer");
  });
});

// ─── Validation clé par clé ────────────────────────────

/* SIRET et numéro de TVA figurent sur les factures émises par le restaurant :
 * une valeur mal formée n'est pas une faute d'affichage, c'est une facture non
 * conforme. Le vide reste permis — c'est l'état initial, signalé par un bandeau
 * dans l'administration. */
describe("informations légales", () => {
  it("accepte un SIRET à 14 chiffres et retire les espaces de saisie", async () => {
    const r = await put({ "legal.siret": "123 456 789 01234" });
    expect(r.status).toBe(200);
    expect(ecrit()["legal.siret"]).toBe("12345678901234");
  });

  it("refuse un SIRET trop court, trop long, ou contenant une lettre", async () => {
    for (const valeur of ["1234567890123", "123456789012345", "1234567890123A", "12-34"]) {
      const r = await put({ "legal.siret": valeur });
      expect(r.status, `SIRET « ${valeur} »`).toBe(400);
      expect(r.corps.error).toContain("14 chiffres");
      expect(prismaDouble.ecritures()).toHaveLength(0);
    }
  });

  it("accepte un SIRET vide — l'état avant renseignement", async () => {
    const r = await put({ "legal.siret": "" });
    expect(r.status).toBe(200);
    expect(ecrit()["legal.siret"]).toBe("");
  });

  it("normalise un numéro de TVA en majuscules et sans espaces", async () => {
    const r = await put({ "legal.vatNumber": "fr 123 456 789 01" });
    expect(r.status).toBe(200);
    expect(ecrit()["legal.vatNumber"]).toBe("FR12345678901");
  });

  it("refuse un numéro de TVA qui n'est pas au format FR + 11", async () => {
    for (const valeur of ["FR1234", "DE123456789012", "FR123456789012", "12345678901"]) {
      const r = await put({ "legal.vatNumber": valeur });
      expect(r.status, `TVA « ${valeur} »`).toBe(400);
    }
  });
});

/* Coordonnées : elles sont au pied de chaque page et dans le balisage. Un email
 * de contact invalide coupe la seule voie écrite vers le restaurant. */
describe("coordonnées du restaurant", () => {
  it("refuse un email de contact mal formé ou vide", async () => {
    expect((await put({ "restaurant.email": "laila(at)o3saveurs" })).status).toBe(400);
    expect((await put({ "restaurant.email": "laila@" })).status).toBe(400);
    expect((await put({ "restaurant.email": "" })).corps.error).toBe(
      "L'email de contact est requis",
    );
  });

  it("met l'email en minuscules", async () => {
    await put({ "restaurant.email": "Contact@O3Saveurs.FR" });
    expect(ecrit()["restaurant.email"]).toBe("contact@o3saveurs.fr");
  });

  it("refuse un code postal qui n'est pas 5 chiffres", async () => {
    for (const valeur of ["7734", "773400", "7734A", ""]) {
      expect((await put({ "restaurant.zip": valeur })).status, `CP « ${valeur} »`).toBe(400);
    }
  });

  it("refuse un téléphone trop court pour en être un", async () => {
    expect((await put({ "restaurant.phone": "0612" })).status).toBe(400);
    expect((await put({ "restaurant.phone": "09 54 83 12 75" })).status).toBe(200);
  });

  it("refuse un nom ou une adresse réduits à un caractère", async () => {
    expect((await put({ "restaurant.name": "Ô" })).status).toBe(400);
    expect((await put({ "restaurant.address": "x" })).status).toBe(400);
    expect((await put({ "restaurant.name": "Ô 3 Saveurs" })).status).toBe(200);
  });
});

/* Seuils de vente. Ils ne sont pas décoratifs : `order.leadTimeMinutes` décale
 * les créneaux proposés, `order.slotCapacity` décide des refus. */
describe("taux de TVA et seuils de commande", () => {
  it("refuse un taux de TVA hors bornes ou non entier", async () => {
    for (const valeur of ["2001", "-1", "10.5", "dix", "", "100000"]) {
      expect((await put({ "vat.rateBp": valeur })).status, `taux « ${valeur} »`).toBe(400);
    }
  });

  it("accepte les taux français exprimés en points de base", async () => {
    for (const valeur of ["550", "1000", "2000"]) {
      const r = await put({ "vat.rateBp": valeur });
      expect(r.status, `taux « ${valeur} »`).toBe(200);
      expect(ecrit()["vat.rateBp"]).toBe(valeur);
    }
  });

  /* Observation, pas de régression : le taux global est borné à [0, 2000] mais
   * pas restreint à la liste fermée {5,5 %, 10 %, 20 %} — contrairement au taux
   * par plat (`lib/dishValidation.ts`, « un taux inventé produirait une facture
   * fausse »). Un 12,34 % passe donc, et s'affiche dans les CGV
   * (`app/cgv/page.tsx` lit cette clé). Le défaut est consigné ici pour qu'une
   * décision soit prise plutôt que subie. */
  it("accepte aujourd'hui un taux de TVA qui n'existe pas en France", async () => {
    const r = await put({ "vat.rateBp": "1234" });
    expect(r.status).toBe(200);
    expect(ecrit()["vat.rateBp"]).toBe("1234");
  });

  it("borne le pas, la capacité et le délai des créneaux", async () => {
    expect((await put({ "order.slotStepMinutes": "4" })).status).toBe(400);
    expect((await put({ "order.slotStepMinutes": "121" })).status).toBe(400);
    expect((await put({ "order.slotStepMinutes": "30" })).status).toBe(200);

    expect((await put({ "order.slotCapacity": "0" })).status).toBe(400);
    expect((await put({ "order.slotCapacity": "201" })).status).toBe(400);

    expect((await put({ "order.leadTimeMinutes": "241" })).status).toBe(400);
    expect((await put({ "order.leadTimeMinutes": "0" })).status).toBe(200);
  });

  it("ramène tout booléen à « true » ou « false »", async () => {
    await put({ "order.acceptCash": "peut-être" });
    expect(ecrit()["order.acceptCash"]).toBe("false");
    await put({ "order.acceptCard": "true" });
    expect(ecrit()["order.acceptCard"]).toBe("true");
    await put({ "borne.enabled": true });
    expect(ecrit()["borne.enabled"]).toBe("true");
  });
});

/* Jeton de la borne. Il est recopié à la main sur la tablette en salle : d'où la
 * forme stricte (lettres et chiffres, sans signe ambigu). Le vide est un choix
 * — aucune tablette n'est alors autorisée à commander. */
describe("jeton de la borne", () => {
  it("accepte un jeton alphanumérique de 16 à 64 caractères, normalisé en majuscules", async () => {
    const r = await put({ "borne.token": "abcdefgh12345678" });
    expect(r.status).toBe(200);
    expect(ecrit()["borne.token"]).toBe("ABCDEFGH12345678");
  });

  it("refuse un jeton trop court, trop long, ou avec des séparateurs", async () => {
    for (const valeur of ["ABC123", "ABCD-EFGH-1234-5678", "A".repeat(65), "ABCDEFGH 1234 567!"]) {
      const r = await put({ "borne.token": valeur });
      expect(r.status, `jeton « ${valeur} »`).toBe(400);
    }
  });

  it("accepte un jeton vide — la borne sans tablette autorisée", async () => {
    const r = await put({ "borne.token": "" });
    expect(r.status).toBe(200);
    expect(ecrit()["borne.token"]).toBe("");
  });
});

/* Liens sortants. Ceux des réseaux sociaux et de la fiche Google partent dans
 * le balisage `sameAs`/`hasMap` de chaque page : y déclarer n'importe quoi
 * n'est pas une faute d'affichage mais une affirmation fausse envoyée à Google. */
describe("liens de réseaux sociaux", () => {
  it("refuse un lien sans schéma et un lien `javascript:`", async () => {
    expect((await put({ "social.facebook": "facebook.com/o3saveurs" })).status).toBe(400);
    const xss = await put({ "social.instagram": "javascript:alert(1)" });
    expect(xss.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("accepte un lien https et le vide", async () => {
    expect((await put({ "social.instagram": "https://instagram.com/o3saveurs" })).status).toBe(200);
    expect((await put({ "social.snapchat": "" })).status).toBe(200);
  });

  /* ── DÉFAUT ────────────────────────────────────────────────────
   * Le message d'erreur annonce « Le lien doit commencer par https:// », mais
   * la vérification est `/^https?:\/\//i` : un lien en clair passe. Il finit
   * dans `sameAs` et dans un `href` du pied de page — contenu non chiffré
   * annoncé par un site en HTTPS, donc averti par les navigateurs, et promesse
   * non tenue par le message lui-même.
   * ───────────────────────────────────────────────────────────── */
  it.fails("devrait refuser un lien http:// comme son message l'annonce", async () => {
    const r = await put({ "social.instagram": "http://instagram.com/o3saveurs" });
    expect(r.status).toBe(400);
  });
});

describe("liens de la fiche Google", () => {
  it("accepte les formes réellement produites par la fiche", async () => {
    for (const lien of [
      "https://g.page/o3saveurs",
      "https://maps.app.goo.gl/abcDEF123",
      "https://www.google.com/maps/place/O+3+Saveurs",
      "https://google.fr/maps/place/O+3+Saveurs",
      "https://search.google.com/local/writereview?placeid=X",
    ]) {
      const r = await put({ "google.businessProfile": lien });
      expect(r.status, lien).toBe(200);
    }
  });

  it("refuse un domaine étranger à la fiche", async () => {
    for (const lien of [
      "https://exemple.fr/avis",
      "https://google.exemple.fr/maps",
      "https://notgoogle.com/maps",
      "javascript:alert(1)",
      "maps.google.com/place",
    ]) {
      const r = await put({ "google.reviewLink": lien });
      expect(r.status, lien).toBe(400);
      expect(prismaDouble.ecritures()).toHaveLength(0);
    }
  });

  /* Observation : la liste blanche porte sur l'hôte, donc un sous-domaine de
   * contenu utilisateur de Google passe. `sites.google.com/view/…` est une page
   * que n'importe qui publie — le garde-fou « ce lien vient bien de la fiche »
   * ne l'arrête pas. Même remarque pour tout TLD de deux ou trois lettres sous
   * `google.`. Portée limitée (la route est réservée à l'administration), mais
   * la vérification ne tient pas la promesse de son commentaire. */
  it("laisse aujourd'hui passer une page Google de contenu utilisateur", async () => {
    expect((await put({ "google.reviewLink": "https://sites.google.com/view/faux" })).status).toBe(
      200,
    );
    expect((await put({ "google.businessProfile": "https://google.xyz/piege" })).status).toBe(200);
  });
});

// ─── Clés inconnues ────────────────────────────────────

/* La route annonce : « Seules les clés connues sont prises en compte ; les
 * autres sont ignorées silencieusement ». C'est ce qui permet au front
 * d'envoyer un formulaire entier sans trier. */
describe("clés inconnues", () => {
  it("ignore une clé qui n'existe pas et n'écrit rien pour elle", async () => {
    const r = await put({ "n.importe.quoi": "valeur" });
    expect(r.status).toBe(400); // plus rien à enregistrer après filtrage
    expect(r.corps.error).toBe("Aucun réglage à enregistrer");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("ignore la clé inconnue mais enregistre les clés connues du même lot", async () => {
    const r = await put({ "restaurant.city": "Pontault-Combault", "cle.bidon": "x" });
    expect(r.status).toBe(200);
    expect(ecrit()).toEqual({ "restaurant.city": "Pontault-Combault" });
  });

  /* ── DÉFAUT ────────────────────────────────────────────────────
   * Le filtre s'écrit `if (!(key in SETTING_DEFAULTS)) continue;`. L'opérateur
   * `in` remonte la chaîne de prototypes : `"toString" in SETTING_DEFAULTS`
   * vaut `true`. Une clé héritée d'`Object.prototype` traverse donc le filtre,
   * traverse `validate()` par sa branche par défaut, puis `setSettings()` —
   * qui refiltre avec le même `in` — et atterrit en base.
   *
   * Conséquences : des lignes parasites (`toString`, `valueOf`, `constructor`,
   * `hasOwnProperty`…) dans la table `Setting`, et surtout `getSettings()` qui
   * rend un objet dont `toString` est une chaîne : toute interpolation de cet
   * objet lève au lieu de rendre « [object Object] ». Le remède est
   * `Object.hasOwn(SETTING_DEFAULTS, key)`, ici et dans `setSettings()`.
   * ───────────────────────────────────────────────────────────── */
  it.fails("devrait ignorer une clé héritée du prototype au lieu de l'écrire", async () => {
    const r = await put({ toString: "coucou" });
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("écrit aujourd'hui en base les clés héritées d'Object.prototype", async () => {
    for (const clef of ["toString", "valueOf", "constructor", "hasOwnProperty"]) {
      const r = await put({ [clef]: "parasite" });
      expect(r.status, clef).toBe(200);
      expect(ecrit(), clef).toEqual({ [clef]: "parasite" });
    }
  });

  // `__proto__` est le seul cas qui retombe sur ses pieds, et par accident :
  // l'affectation `patch["__proto__"] = "…"` n'est pas une propriété propre,
  // donc `Object.keys(patch)` reste vide et la route répond 400.
  it("échappe par accident à l'écriture pour `__proto__`", async () => {
    const r = await put(JSON.parse('{"__proto__":"parasite"}'));
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });
});

// ─── Indivisibilité du lot ─────────────────────────────

/* L'écran Réglages envoie le formulaire entier d'un coup. Si une valeur
 * invalide laissait passer les précédentes, la cliente verrait un message
 * d'erreur tout en ayant à moitié enregistré — état impossible à comprendre et
 * impossible à rejouer. */
describe("indivisibilité du lot", () => {
  it("une seule valeur invalide fait échouer tout le lot, sans écriture partielle", async () => {
    const r = await put({
      "restaurant.name": "Ô 3 Saveurs",
      "restaurant.city": "Pontault-Combault",
      "legal.siret": "123", // invalide
      "vat.rateBp": "1000",
    });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("14 chiffres");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("échoue aussi quand l'invalide est la première clé du lot", async () => {
    const r = await put({
      "legal.siret": "123",
      "restaurant.name": "Ô 3 Saveurs",
    });
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("enregistre tout le lot quand tout est valide, en une seule transaction", async () => {
    const r = await put({
      "restaurant.name": "Ô 3 Saveurs",
      "restaurant.zip": "77340",
      "legal.siret": "12345678901234",
      "vat.rateBp": "1000",
    });
    expect(r.status).toBe(200);
    expect(ecrit()).toEqual({
      "restaurant.name": "Ô 3 Saveurs",
      "restaurant.zip": "77340",
      "legal.siret": "12345678901234",
      "vat.rateBp": "1000",
    });
    expect(prismaDouble.journal.some((a) => a.cible === "$transaction")).toBe(true);
  });

  it("renvoie l'état complet et l'état de complétude légale après enregistrement", async () => {
    prismaDouble.reinitialiser();
    commeAdmin();
    const r = await appeler<{ settings: Record<string, string>; legalComplete: boolean }>(
      PUT,
      requete("PUT", URL_SET, { "restaurant.city": "Pontault-Combault" }),
    );
    expect(r.status).toBe(200);
    expect(Object.keys(r.corps.settings).sort()).toEqual(Object.keys(SETTING_DEFAULTS).sort());
    expect(r.corps.legalComplete).toBe(false); // SIRET et société vides par défaut
  });
});
