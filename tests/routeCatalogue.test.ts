import { describe, it, expect, vi, beforeEach } from "vitest";

/* Catalogue : plats, formules, promotions, stock.
 *
 * Ce qu'on protège : tout ce qui décide du prix facturé et de ce qui est
 * vendable. Les routes de ce fichier étaient autrefois ouvertes — « un `PATCH`
 * anonyme suffisait à mettre tous les prix de la carte à 0,01 € », dit le
 * commentaire de `app/api/dishes/[id]/route.ts`. Les gardes sont désormais en
 * place ; ce qui reste à éprouver, c'est la **validation** : un prix non entier,
 * une formule à 0 € mise en vente, un code promotionnel sans borne d'usage ou un
 * mouvement de stock qui ferait passer la marmite sous zéro ne laissent aucune
 * trace d'erreur — ils produisent une carte fausse.
 *
 * Les blocs marqués DÉFAUT portent un `it.fails` : le test échoue aujourd'hui,
 * et c'est la démonstration du défaut, pas un test à corriger.
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

vi.mock("@/lib/email", async () => {
  const m = await import("./aide/adminPrisma");
  return m.doubleEmail();
});

import { POST as POST_PLAT } from "@/app/api/dishes/route";
import { PATCH as PATCH_PLAT, DELETE as DELETE_PLAT } from "@/app/api/dishes/[id]/route";
import { POST as POST_FORMULE } from "@/app/api/formules/route";
import { PUT as PUT_FORMULE } from "@/app/api/formules/[id]/route";
import { POST as POST_PROMO } from "@/app/api/promotions/route";
import { PATCH as PATCH_PROMO } from "@/app/api/promotions/[id]/route";
import { POST as POST_STOCK } from "@/app/api/stock/route";
import { commeAdmin, sansSession } from "./aide/adminSession";
import { prismaDouble, type AppelPrisma } from "./aide/adminPrisma";
import { appeler, contexte, requete, requeteCorpsCasse, lire } from "./aide/adminRequete";

/** Ligne `Dish` plausible, pour que `rowToDish()` ait de quoi répondre. */
function ligneDish(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "d1",
    cat: "africaine",
    name: "Mafé Bœuf",
    desc: "Bœuf mijoté, sauce arachide",
    priceCents: 1200,
    photo: null,
    badge: null,
    popular: false,
    available: true,
    spice: 0,
    tags: null,
    options: null,
    formules: null,
    allergens: null,
    stock: null,
    stockAlert: null,
    costCents: null,
    position: 0,
    leadTimeHours: 0,
    vatRateBp: 1000,
    ...over,
  };
}

/** Données réellement transmises à la première écriture du journal. */
function donneesEcrites(appel?: AppelPrisma): Record<string, unknown> {
  const arg = (appel ?? prismaDouble.ecritures()[0])?.args[0] as { data?: Record<string, unknown> };
  return arg?.data ?? {};
}

function neuf() {
  prismaDouble.reinitialiser();
  commeAdmin();
}

beforeEach(() => {
  prismaDouble.reinitialiser();
  sansSession();
});

// ════════════════════════════════════════════════════════
// PLATS
// ════════════════════════════════════════════════════════

/* Un plat sans nom ou sans catégorie n'est pas affichable : la carte est groupée
 * par catégorie et chaque fiche est titrée par son nom. */
describe("POST /api/dishes — création", () => {
  it("refuse un plat sans nom", async () => {
    neuf();
    const r = await appeler(
      POST_PLAT,
      requete("POST", "http://localhost/api/dishes", { cat: "africaine", priceCents: 1200 }),
    );
    expect(r.status).toBe(400);
    expect(r.corps.error).toBe("Le nom est requis");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("refuse un nom d'un seul caractère et un nom au-delà de 120", async () => {
    neuf();
    expect(
      (
        await appeler(
          POST_PLAT,
          requete("POST", "http://localhost/api/dishes", { cat: "africaine", name: "M", priceCents: 1 }),
        )
      ).status,
    ).toBe(400);
    neuf();
    expect(
      (
        await appeler(
          POST_PLAT,
          requete("POST", "http://localhost/api/dishes", {
            cat: "africaine",
            name: "x".repeat(121),
            priceCents: 1,
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("refuse une catégorie vide", async () => {
    neuf();
    const r = await appeler(
      POST_PLAT,
      requete("POST", "http://localhost/api/dishes", { cat: "", name: "Mafé Bœuf", priceCents: 1200 }),
    );
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("catégorie");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  /* Les montants circulent en **centimes** (`lib/money.ts`). Un prix négatif
   * ferait une ligne de commande qui rembourse, un prix décimal serait arrondi
   * silencieusement par Postgres : les deux se refusent. */
  it("refuse un prix négatif, décimal, ou au-delà de 1 000 €", async () => {
    for (const priceCents of [-100, 12.5, 100_001, "douze"]) {
      neuf();
      const r = await appeler(
        POST_PLAT,
        requete("POST", "http://localhost/api/dishes", {
          cat: "africaine",
          name: "Mafé Bœuf",
          priceCents,
        }),
      );
      expect(r.status, `prix ${String(priceCents)}`).toBe(400);
      expect(r.corps.error).toContain("prix");
      expect(prismaDouble.ecritures()).toHaveLength(0);
    }
  });

  it("refuse une description de plus de 500 caractères", async () => {
    neuf();
    const r = await appeler(
      POST_PLAT,
      requete("POST", "http://localhost/api/dishes", {
        cat: "africaine",
        name: "Mafé Bœuf",
        desc: "x".repeat(501),
        priceCents: 1200,
      }),
    );
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("description");
  });

  /* Taux de TVA et allergènes sont des listes fermées : un taux inventé produit
   * une facture fausse, un allergène inventé n'est affiché nulle part et donne
   * l'illusion d'une information réglementaire. */
  it("refuse un taux de TVA hors des trois taux français", async () => {
    neuf();
    const r = await appeler(
      POST_PLAT,
      requete("POST", "http://localhost/api/dishes", {
        cat: "africaine",
        name: "Mafé Bœuf",
        priceCents: 1200,
        vatRateBp: 1234,
      }),
    );
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("Taux de TVA non reconnu");
  });

  it("refuse un allergène hors de la liste réglementaire", async () => {
    neuf();
    const r = await appeler(
      POST_PLAT,
      requete("POST", "http://localhost/api/dishes", {
        cat: "africaine",
        name: "Mafé Bœuf",
        priceCents: 1200,
        allergens: ["arachide", "paprika"],
      }),
    );
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("Allergène inconnu");
  });

  it("crée le plat et le place en fin de sa catégorie", async () => {
    neuf();
    prismaDouble.quand("dish.count", 4);
    prismaDouble.quand("dish.create", ligneDish({ position: 4 }));
    const r = await appeler(
      POST_PLAT,
      requete("POST", "http://localhost/api/dishes", {
        cat: "africaine",
        name: "Mafé Bœuf",
        desc: "Bœuf mijoté",
        priceCents: 1200,
      }),
    );
    expect(r.status).toBe(201);
    expect(donneesEcrites()).toMatchObject({
      cat: "africaine",
      name: "Mafé Bœuf",
      priceCents: 1200,
      position: 4,
    });
  });

  it("refuse un JSON malformé sans tomber en 500", async () => {
    neuf();
    const r = await lire(await POST_PLAT(requeteCorpsCasse("POST", "http://localhost/api/dishes")));
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });
});

/* ── DÉFAUT (signalé par l'audit du back-office) ────────────────
 * `PATCH /api/dishes/[id]` ne valide **que** les champs numériques, les tags et
 * les allergènes, via `validateDishFields()`. `cat`, `name` et `desc` ne
 * traversent aucune validation : ils passent de `body` à `dishToRow()` puis à
 * `prisma.dish.update()` tels quels.
 *
 * Le `POST` de la même ressource, lui, impose `name` de 2 à 120 caractères,
 * `cat` requis et `desc` de 500 au plus. Deux contrats pour une même donnée :
 * ce que la création refuse, la modification l'accepte.
 *
 * Effets concrets, démontrés ci-dessous : un plat peut être renommé en chaîne
 * vide (la carte affiche une fiche sans titre), rangé dans une catégorie vide
 * (il disparaît de la carte groupée par catégorie), et recevoir une description
 * de plusieurs milliers de caractères.
 *
 * Le remède tient en quatre lignes : reprendre dans le `PATCH` le même
 * `collect({ cat, name, desc })` que le `POST`, en `required: false` pour ne
 * valider que les champs réellement envoyés.
 * ───────────────────────────────────────────────────────────── */
describe("DÉFAUT — PATCH /api/dishes/[id] ne valide ni cat, ni name, ni desc", () => {
  async function patch(corps: unknown) {
    neuf();
    prismaDouble.quand("dish.update", ligneDish());
    return appeler(PATCH_PLAT, requete("PATCH", "http://localhost/api/dishes/d1", corps), contexte({ id: "d1" }));
  }

  it.fails("devrait refuser un nom vide, comme le fait le POST", async () => {
    const r = await patch({ name: "" });
    expect(r.status).toBe(400);
  });

  it.fails("devrait refuser une catégorie vide, comme le fait le POST", async () => {
    const r = await patch({ cat: "" });
    expect(r.status).toBe(400);
  });

  it.fails("devrait refuser une description au-delà de 500 caractères", async () => {
    const r = await patch({ desc: "x".repeat(4000) });
    expect(r.status).toBe(400);
  });

  it("écrit aujourd'hui ces valeurs en base sans broncher", async () => {
    const r = await patch({ name: "", cat: "", desc: "x".repeat(4000) });
    expect(r.status).toBe(200);
    expect(donneesEcrites()).toMatchObject({ name: "", cat: "" });
    expect(String(donneesEcrites().desc)).toHaveLength(4000);
  });

  /* Même trou, autre champ : `photo`, `badge` et `options` sont recopiés tels
   * quels par `validateDishFields()` (`out.photo = body.photo`), sans aucun
   * contrôle — y compris au `POST`. Le dépôt sait pourtant le faire : les
   * encarts passent par `validateBannerImage()`, précisément parce que
   * `next/image` refuse tout hôte absent de `next.config.mjs` et fait tomber la
   * page publique. Un `photo` arbitraire casse donc la carte, et `options`
   * accepte un objet là où le front attend une liste. */
  it.fails("devrait refuser une photo qui n'est ni un fichier du site ni un envoi", async () => {
    const r = await patch({ photo: "javascript:alert(1)" });
    expect(r.status).toBe(400);
  });

  it.fails("devrait refuser `options` qui n'est pas une liste", async () => {
    const r = await patch({ options: { pas: "une liste" } });
    expect(r.status).toBe(400);
  });

  it("écrit aujourd'hui photo, badge et options sans contrôle", async () => {
    const r = await patch({
      photo: "https://exemple-inconnu.test/photo.jpg",
      badge: "<script>alert(1)</script>",
      options: { pas: "une liste" },
    });
    expect(r.status).toBe(200);
    expect(donneesEcrites()).toMatchObject({
      photo: "https://exemple-inconnu.test/photo.jpg",
      badge: "<script>alert(1)</script>",
      options: '{"pas":"une liste"}',
    });
  });

  /* Ce que le PATCH valide bien, pour montrer que le trou est circonscrit aux
   * trois champs texte et aux champs recopiés. */
  it("valide en revanche correctement les montants et les bornes", async () => {
    expect((await patch({ priceCents: -1 })).status).toBe(400);
    expect((await patch({ priceCents: 12.5 })).status).toBe(400);
    expect((await patch({ stock: -5 })).status).toBe(400);
    expect((await patch({ spice: 9 })).status).toBe(400);
    expect((await patch({ vatRateBp: 1234 })).status).toBe(400);
    expect((await patch({ leadTimeHours: 24 * 31 })).status).toBe(400);
  });
});

/* Un plat déjà vendu n'est pas supprimé mais retiré de la vente : les
 * statistiques et l'historique comptable s'appuient sur `dishId`. */
describe("DELETE /api/dishes/[id] — suppression ou archivage", () => {
  /** Second argument des routes dynamiques, nommé pour pouvoir typer la réponse. */
  type Ctx = { params: Promise<{ id: string }> };

  it("archive un plat déjà commandé au lieu de le supprimer", async () => {
    neuf();
    prismaDouble.quand("dish.findUnique", { id: "d1", name: "Mafé Bœuf" });
    prismaDouble.quand("stockMovement.count", 7);
    const r = await appeler<{ archived: boolean }, Ctx>(
      DELETE_PLAT,
      requete("DELETE", "http://localhost/api/dishes/d1"),
      contexte({ id: "d1" }),
    );
    expect(r.status).toBe(200);
    expect(r.corps.archived).toBe(true);
    const ecritures = prismaDouble.ecritures();
    expect(ecritures.map((e) => e.cible)).toEqual(["dish.update"]);
    expect(donneesEcrites()).toEqual({ available: false, popular: false });
  });

  it("supprime un plat jamais commandé", async () => {
    neuf();
    prismaDouble.quand("dish.findUnique", { id: "d1", name: "Mafé Bœuf" });
    prismaDouble.quand("stockMovement.count", 0);
    const r = await appeler<{ archived: boolean }, Ctx>(
      DELETE_PLAT,
      requete("DELETE", "http://localhost/api/dishes/d1"),
      contexte({ id: "d1" }),
    );
    expect(r.corps.archived).toBe(false);
    expect(prismaDouble.ecritures().map((e) => e.cible)).toEqual(["dish.delete"]);
  });

  it("répond 404 sur un plat inexistant, sans rien écrire", async () => {
    neuf();
    const r = await appeler(
      DELETE_PLAT,
      requete("DELETE", "http://localhost/api/dishes/inconnu"),
      contexte({ id: "inconnu" }),
    );
    expect(r.status).toBe(404);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════
// FORMULES
// ════════════════════════════════════════════════════════

/* Une formule **mise en vente** ne peut pas coûter zéro : c'est le défaut que
 * l'écran laissait passer et que le serveur acceptait. Zéro reste permis sur une
 * formule masquée — un tarif pas encore arbitré, qu'on prépare sans l'exposer.
 * Les deux routes doivent tenir la règle : l'écran n'est pas une défense, il
 * suffit d'un appel direct pour le contourner. */
describe("formules — une formule en vente ne peut pas être à 0 €", () => {
  const URL_F = "http://localhost/api/formules";

  it("POST refuse une formule active à 0 €", async () => {
    neuf();
    const r = await appeler(
      POST_FORMULE,
      requete("POST", URL_F, { code: "GOURM", name: "Formule Gourmande", priceCents: 0 }),
    );
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  // `active` absent vaut « active » : le défaut de l'écran était précisément là.
  it("POST refuse une formule à 0 € dont `active` n'est pas précisé", async () => {
    neuf();
    const r = await appeler(
      POST_FORMULE,
      requete("POST", URL_F, { code: "GOURM", name: "Formule Gourmande" }),
    );
    expect(r.status).toBe(400);
  });

  it("POST accepte une formule masquée à 0 €", async () => {
    neuf();
    prismaDouble.quand("formula.create", {
      id: "f1",
      code: "GOURM",
      name: "Formule Gourmande",
      desc: "",
      extra: "",
      priceCents: 0,
      active: false,
      position: 0,
      slots: [],
    });
    const r = await appeler(
      POST_FORMULE,
      requete("POST", URL_F, {
        code: "GOURM",
        name: "Formule Gourmande",
        priceCents: 0,
        active: false,
      }),
    );
    expect(r.status).toBe(201);
    expect(donneesEcrites()).toMatchObject({ priceCents: 0, active: false });
  });

  /* Le contrôle du `PUT` dépend de l'état **en base** : le corps peut très bien
   * ne pas renvoyer `active`, auquel cas c'est la valeur enregistrée qui
   * tranche. Trois combinaisons, trois résultats attendus. */
  it("PUT refuse 0 € quand la formule est active en base et que le corps se taît", async () => {
    neuf();
    prismaDouble.quand("formula.findUnique", { id: "f1", active: true, position: 0, slots: [] });
    const r = await appeler(
      PUT_FORMULE,
      requete("PUT", `${URL_F}/f1`, { code: "GOURM", name: "Formule Gourmande", priceCents: 0 }),
      contexte({ id: "f1" }),
    );
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("0,00 €");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("PUT refuse 0 € quand le corps demande explicitement la mise en vente", async () => {
    neuf();
    prismaDouble.quand("formula.findUnique", { id: "f1", active: false, position: 0, slots: [] });
    const r = await appeler(
      PUT_FORMULE,
      requete("PUT", `${URL_F}/f1`, {
        code: "GOURM",
        name: "Formule Gourmande",
        priceCents: 0,
        active: true,
      }),
      contexte({ id: "f1" }),
    );
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("PUT accepte 0 € sur une formule masquée", async () => {
    neuf();
    prismaDouble.quand("formula.findUnique", {
      id: "f1",
      active: false,
      position: 0,
      slots: [],
      code: "GOURM",
      name: "Formule Gourmande",
      desc: "",
      extra: "",
      priceCents: 0,
    });
    const r = await appeler(
      PUT_FORMULE,
      requete("PUT", `${URL_F}/f1`, { code: "GOURM", name: "Formule Gourmande", priceCents: 0 }),
      contexte({ id: "f1" }),
    );
    expect(r.status).toBe(200);
    expect(donneesEcrites()).toMatchObject({ priceCents: 0, active: false });
  });

  it("PUT répond 404 sur une formule inexistante, sans rien écrire", async () => {
    neuf();
    const r = await appeler(
      PUT_FORMULE,
      requete("PUT", `${URL_F}/inconnue`, { code: "X", name: "Essai", priceCents: 500 }),
      contexte({ id: "inconnue" }),
    );
    expect(r.status).toBe(404);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("PUT refuse un créneau qui cite un plat inexistant", async () => {
    neuf();
    prismaDouble.quand("formula.findUnique", { id: "f1", active: true, position: 0, slots: [] });
    prismaDouble.quand("dish.count", 0); // aucun des plats cités n'existe
    const r = await appeler(
      PUT_FORMULE,
      requete("PUT", `${URL_F}/f1`, {
        code: "GOURM",
        name: "Formule Gourmande",
        priceCents: 1500,
        slots: [{ label: "Plat", choices: [{ dishId: "inexistant" }] }],
      }),
      contexte({ id: "f1" }),
    );
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("n'existe plus");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("PUT borne le nombre de créneaux et exige un libellé", async () => {
    neuf();
    prismaDouble.quand("formula.findUnique", { id: "f1", active: true, position: 0, slots: [] });
    const trop = Array.from({ length: 9 }, (_, i) => ({ label: `Créneau ${i}` }));
    const r = await appeler(
      PUT_FORMULE,
      requete("PUT", `${URL_F}/f1`, {
        code: "GOURM",
        name: "Formule Gourmande",
        priceCents: 1500,
        slots: trop,
      }),
      contexte({ id: "f1" }),
    );
    expect(r.status).toBe(400);

    neuf();
    prismaDouble.quand("formula.findUnique", { id: "f1", active: true, position: 0, slots: [] });
    const sansLibelle = await appeler(
      PUT_FORMULE,
      requete("PUT", `${URL_F}/f1`, {
        code: "GOURM",
        name: "Formule Gourmande",
        priceCents: 1500,
        slots: [{ choices: [] }],
      }),
      contexte({ id: "f1" }),
    );
    expect(sansLibelle.status).toBe(400);
  });

  /* ── DÉFAUT ────────────────────────────────────────────────────
   * `PUT /api/formules/[id]` valide `position` puis jette le résultat :
   *   const position = int(body.position ?? existing.position, …);
   *   … position: position.ok ? position.value : existing.position
   * Une position hors bornes est donc **silencieusement ignorée** et répond 200,
   * alors que partout ailleurs dans le dépôt une valeur hors bornes répond 400.
   * L'écran d'administration croit avoir déplacé la formule ; elle n'a pas
   * bougé, et rien ne le dit.
   * ───────────────────────────────────────────────────────────── */
  it.fails("devrait refuser une position hors bornes au lieu de l'ignorer", async () => {
    neuf();
    prismaDouble.quand("formula.findUnique", { id: "f1", active: true, position: 3, slots: [] });
    const r = await appeler(
      PUT_FORMULE,
      requete("PUT", `${URL_F}/f1`, {
        code: "GOURM",
        name: "Formule Gourmande",
        priceCents: 1500,
        position: -7,
      }),
      contexte({ id: "f1" }),
    );
    expect(r.status).toBe(400);
  });

  it("répond aujourd'hui 200 et conserve l'ancienne position", async () => {
    neuf();
    prismaDouble.quand("formula.findUnique", { id: "f1", active: true, position: 3, slots: [] });
    const r = await appeler(
      PUT_FORMULE,
      requete("PUT", `${URL_F}/f1`, {
        code: "GOURM",
        name: "Formule Gourmande",
        priceCents: 1500,
        position: -7,
      }),
      contexte({ id: "f1" }),
    );
    expect(r.status).toBe(200);
    expect(donneesEcrites()).toMatchObject({ position: 3 });
  });
});

// ════════════════════════════════════════════════════════
// PROMOTIONS
// ════════════════════════════════════════════════════════

/* Une promotion mal bornée coûte de l'argent réel : `maxUses` est la seule chose
 * qui empêche un code partagé publiquement d'être utilisé mille fois, et une
 * fenêtre de diffusion inversée produit une promotion invisible — ou éternelle. */
describe("POST /api/promotions — bornes d'une remise", () => {
  const URL_P = "http://localhost/api/promotions";
  const base = { label: "Remise de lancement", kind: "percent", value: 10, code: "LANCEMENT" };

  async function post(patch: Record<string, unknown>) {
    neuf();
    return appeler(POST_PROMO, requete("POST", URL_P, { ...base, ...patch }));
  }

  it("refuse un nombre maximum d'utilisations non entier", async () => {
    const r = await post({ maxUses: 2.5 });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("entier");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("refuse un nombre maximum d'utilisations hors bornes", async () => {
    expect((await post({ maxUses: 0 })).status).toBe(400);
    expect((await post({ maxUses: -3 })).status).toBe(400);
    expect((await post({ maxUses: 100_001 })).status).toBe(400);
  });

  it("accepte l'absence de borne d'usage — promotion sans plafond assumée", async () => {
    for (const maxUses of [null, "", undefined]) {
      const r = await post({ maxUses });
      expect(r.status, `maxUses ${String(maxUses)}`).toBe(201);
      expect(donneesEcrites()).toMatchObject({ maxUses: null });
    }
  });

  it("refuse un pourcentage hors de [1, 100]", async () => {
    expect((await post({ value: 0 })).status).toBe(400);
    expect((await post({ value: 101 })).status).toBe(400);
    expect((await post({ value: -10 })).status).toBe(400);
    expect((await post({ value: 10.5 })).status).toBe(400);
  });

  it("refuse une remise fixe au-delà de 500 €", async () => {
    const r = await post({ kind: "amount", value: 50_001, minSubtotalCents: 60_000 });
    expect(r.status).toBe(400);
  });

  /* Une remise fixe supérieure au minimum de commande fait tomber le panier à
   * 0 € : `promotionDiscount` borne la remise au sous-total, donc rien ne
   * devient négatif — la commande devient simplement gratuite. */
  it("refuse une remise fixe supérieure au minimum de commande", async () => {
    const r = await post({ kind: "amount", value: 2000, minSubtotalCents: 1000 });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("minimum de commande");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("refuse une date illisible et une fenêtre inversée", async () => {
    expect((await post({ startsAt: "pas-une-date" })).status).toBe(400);
    expect((await post({ endsAt: "32/13/2026" })).status).toBe(400);
    const inversee = await post({ startsAt: "2026-10-10", endsAt: "2026-10-01" });
    expect(inversee.status).toBe(400);
    expect(inversee.corps.error).toContain("postérieure");
  });

  it("refuse une fenêtre dont les deux bornes sont identiques", async () => {
    const r = await post({ startsAt: "2026-10-10T12:00:00Z", endsAt: "2026-10-10T12:00:00Z" });
    expect(r.status).toBe(400);
  });

  it("refuse un type de promotion inconnu et un libellé trop court", async () => {
    expect((await post({ kind: "cadeau" })).status).toBe(400);
    expect((await post({ label: "ab" })).status).toBe(400);
  });

  it("refuse un code accentué ou trop court, et normalise un code valide", async () => {
    expect((await post({ code: "Été10" })).status).toBe(400);
    expect((await post({ code: "AB" })).status).toBe(400);
    expect((await post({ code: "PROMO 10" })).status).toBe(400);
    const r = await post({ code: " lancement " });
    expect(r.status).toBe(201);
    expect(donneesEcrites()).toMatchObject({ code: "LANCEMENT" });
  });

  /* `computeOrder()` cherche les promotions automatiques par `auto` et les codes
   * par `code` : une ligne incohérente serait simplement inapplicable, donc
   * invisible pour la cliente qui l'a créée. */
  it("refuse une promotion sans code et non automatique, et l'inverse", async () => {
    expect((await post({ code: null, auto: false })).status).toBe(400);
    expect((await post({ code: "LANCEMENT", auto: true })).status).toBe(400);
  });

  it("refuse un code déjà utilisé par une autre promotion", async () => {
    neuf();
    prismaDouble.quand("promotion.findUnique", { id: "autre" });
    const r = await appeler(POST_PROMO, requete("POST", URL_P, base));
    expect(r.status).toBe(409);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });
});

/* Le `PATCH` fusionne la ligne existante avec le corps reçu **avant** de
 * valider : on valide toujours l'état final complet, jamais un fragment. Sans
 * cela, passer `kind` à `percent` sans renvoyer `value` laisserait un montant en
 * centimes interprété comme un pourcentage de 1 500 %. */
describe("PATCH /api/promotions/[id] — validation de l'état final", () => {
  it("refuse un changement de type qui rendrait la valeur absurde", async () => {
    neuf();
    prismaDouble.quand("promotion.findUnique", {
      id: "p1",
      code: "LANCEMENT",
      label: "Remise de lancement",
      kind: "amount",
      value: 1500,
      minSubtotalCents: 3000,
      startsAt: null,
      endsAt: null,
      maxUses: null,
      oncePerCustomer: false,
      weekday: null,
      auto: false,
      active: true,
    });
    const r = await appeler(
      PATCH_PROMO,
      requete("PATCH", "http://localhost/api/promotions/p1", { kind: "percent" }),
      contexte({ id: "p1" }),
    );
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("pourcentage");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("répond 404 sur une promotion inexistante, sans rien écrire", async () => {
    neuf();
    const r = await appeler(
      PATCH_PROMO,
      requete("PATCH", "http://localhost/api/promotions/inconnue", { active: false }),
      contexte({ id: "inconnue" }),
    );
    expect(r.status).toBe(404);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════
// STOCK
// ════════════════════════════════════════════════════════

/* Le journal des mouvements existe pour répondre à « où sont passées les 12
 * parts de mafé ? ». Il ne vaut que s'il est exact : une note obligatoire sur
 * les sorties, une quantité jamais nulle, un motif pris dans une liste fermée. */
describe("POST /api/stock — mouvements", () => {
  const URL_S = "http://localhost/api/stock";

  async function mouvement(corps: Record<string, unknown>, stock: number | null = 3) {
    neuf();
    prismaDouble.quand("dish.findUnique", {
      id: "d1",
      name: "Mafé Bœuf",
      stock,
      stockAlert: 2,
      available: true,
    });
    return appeler(POST_STOCK, requete("POST", URL_S, corps));
  }

  it("exige une explication pour une sortie ou une perte", async () => {
    const sortie = await mouvement({ dishId: "d1", delta: -5, reason: "correction" });
    expect(sortie.status).toBe(400);
    expect(sortie.corps.error).toContain("explication");
    expect(prismaDouble.ecritures()).toHaveLength(0);

    const perte = await mouvement({ dishId: "d1", delta: 2, reason: "perte" });
    expect(perte.status).toBe(400);
  });

  it("refuse une quantité nulle hors inventaire", async () => {
    const r = await mouvement({ dishId: "d1", delta: 0, reason: "reappro" });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("nulle");
  });

  it("refuse une quantité non entière ou hors bornes", async () => {
    expect((await mouvement({ dishId: "d1", delta: 2.5, reason: "reappro" })).status).toBe(400);
    expect((await mouvement({ dishId: "d1", delta: 50_000, reason: "reappro" })).status).toBe(400);
  });

  it("refuse un motif hors de la liste fermée", async () => {
    const r = await mouvement({ dishId: "d1", delta: 5, reason: "n-importe-quoi" });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("motif");
  });

  it("refuse un inventaire sans stock constaté, et un stock constaté négatif", async () => {
    const sans = await mouvement({ dishId: "d1", reason: "inventaire" });
    expect(sans.status).toBe(400);
    expect(sans.corps.error).toContain("stock constaté");

    const negatif = await mouvement({ dishId: "d1", reason: "inventaire", absolute: -1 });
    expect(negatif.status).toBe(400);
  });

  it("répond 404 sur un plat inexistant, sans rien écrire", async () => {
    neuf();
    const r = await appeler(
      POST_STOCK,
      requete("POST", URL_S, { dishId: "inconnu", delta: 5, reason: "reappro" }),
    );
    expect(r.status).toBe(404);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("enregistre un réapprovisionnement et remet le plat en vente", async () => {
    const r = await mouvement({ dishId: "d1", delta: 10, reason: "reappro" }, 0);
    expect(r.status).toBe(201);
    const [maj, trace] = prismaDouble.ecritures();
    expect(maj.cible).toBe("dish.update");
    expect(donneesEcrites(maj)).toEqual({ stock: 10, available: true });
    expect(donneesEcrites(trace)).toMatchObject({ delta: 10, reason: "reappro" });
  });

  it("retire le plat de la vente quand l'inventaire le trouve à zéro", async () => {
    const r = await mouvement({ dishId: "d1", reason: "inventaire", absolute: 0 }, 5);
    expect(r.status).toBe(201);
    const [maj, trace] = prismaDouble.ecritures();
    expect(donneesEcrites(maj)).toEqual({ stock: 0, available: false });
    // L'écart journalisé se déduit du constat : 0 constaté pour 5 en base.
    expect(donneesEcrites(trace)).toMatchObject({ delta: -5 });
  });

  /* ── DÉFAUT ────────────────────────────────────────────────────
   * Un mouvement qui ferait passer le stock sous zéro n'est pas refusé : il est
   * **écrasé**. `stockApresMouvement()` fait `Math.max(0, stockActuel + delta)`,
   * puis `applyMovement()` journalise le `delta` **demandé**, pas celui qui a
   * réellement été appliqué.
   *
   * Sur 3 parts en stock, une perte de 10 écrit donc `stock: 0` et une ligne de
   * journal à `-10`. La somme des mouvements ne vaut plus le stock : le journal
   * ne peut plus répondre à la question pour laquelle il a été créé, et un
   * inventaire de contrôle fera apparaître un écart de 7 parts sorti de nulle
   * part.
   *
   * Le chemin de vente, lui, refuse correctement : `reserveStock()` décrémente
   * sous condition `stock >= qty` et lève un `ShortageError`. Les deux chemins
   * devraient se comporter pareil — soit refuser avec le manque, soit
   * journaliser l'écart réellement appliqué.
   * ───────────────────────────────────────────────────────────── */
  it.fails("devrait refuser un mouvement qui ferait passer le stock sous zéro", async () => {
    const r = await mouvement(
      { dishId: "d1", delta: -10, reason: "perte", note: "marmite renversée" },
      3,
    );
    expect(r.status).toBe(400);
  });

  it.fails("devrait, à défaut, journaliser l'écart réellement appliqué", async () => {
    await mouvement({ dishId: "d1", delta: -10, reason: "perte", note: "marmite renversée" }, 3);
    const [maj, trace] = prismaDouble.ecritures();
    expect(donneesEcrites(maj)).toMatchObject({ stock: 0 });
    // 3 parts en stock, 3 parts perdues : le journal devrait dire -3.
    expect(donneesEcrites(trace)).toMatchObject({ delta: -3 });
  });

  it("écrase aujourd'hui le dépassement et journalise un écart faux", async () => {
    const r = await mouvement(
      { dishId: "d1", delta: -10, reason: "perte", note: "marmite renversée" },
      3,
    );
    expect(r.status).toBe(201);
    const [maj, trace] = prismaDouble.ecritures();
    expect(donneesEcrites(maj)).toEqual({ stock: 0, available: false });
    expect(donneesEcrites(trace)).toMatchObject({ delta: -10 });
  });

  /* Les plats à stock illimité (`stock: null`) sont les boissons et les plats
   * préparés à la demande. Un mouvement manuel les fait basculer en stock
   * compté, ce qui est l'intention — mais `null` est traité comme 0, donc une
   * sortie sur un plat illimité le met aussitôt en rupture. */
  it("traite un stock illimité comme zéro lors d'un mouvement manuel", async () => {
    const r = await mouvement(
      { dishId: "d1", delta: -2, reason: "perte", note: "casse" },
      null,
    );
    expect(r.status).toBe(201);
    expect(donneesEcrites(prismaDouble.ecritures()[0])).toEqual({ stock: 0, available: false });
  });
});
