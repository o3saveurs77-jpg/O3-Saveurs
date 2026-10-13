import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/borne/commande — la tablette en salle.
 *
 * Trois choses distinguent cette route du tunnel web et expliquent ce qui est
 * éprouvé ici :
 *
 *  · l'appelant est un **appareil**. La page `/borne` est publique : sans le
 *    jeton des Réglages, n'importe quel navigateur créerait des commandes que
 *    la cuisine préparerait pour personne. Le refus doit arriver avant tout le
 *    reste, y compris avant de dire si la borne est allumée ;
 *  · la borne ne sait faire qu'une chose, **maintenant, sur place**. Livraison,
 *    plat sur commande, créneau : autant de portes qui doivent rester fermées,
 *    parce qu'aucune d'elles n'a de date, d'adresse ni de paiement en ligne ;
 *  · la TVA change de régime en salle. Une canette consommée sur place relève
 *    de 10 % (art. 279 m CGI) et non des 5,5 % de la vente en contenant fermé
 *    (art. 278-0 bis A) : le taux porté par le plat ne peut pas être recopié
 *    tel quel, et personne ne s'en apercevrait avant un contrôle.
 *
 * Comme pour le checkout, le corps ne porte **aucun montant** : ce que la
 * tablette annonce comme prix est ignoré, le serveur relit la base.
 */

vi.mock("@/auth", async () => (await import("./aide/session")).moduleAuth());

/** Sous-ensemble des arguments Prisma réellement lus par les doubles. */
interface ArgsPrisma {
  where?: {
    id?: string | { in?: string[] };
    key?: string;
    code?: string;
  };
  data?: Record<string, unknown>;
  create?: Record<string, unknown>;
}

/* ⚠️ `.env` pointe sur la base de production du restaurant : aucun test ne doit
 * ouvrir de connexion. Le double ne lit que l'état préparé par le test. */
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dish: {
      findMany: async (args: ArgsPrisma) => {
        const filtre = args.where?.id;
        const ids = typeof filtre === "object" && filtre ? (filtre.in ?? []) : [];
        return etat.plats.filter((p) => ids.includes(p.id));
      },
    },
    zone: { findMany: async () => [] },
    formula: { findMany: async () => [] },
    promotion: { findMany: async () => [], findUnique: async () => null },
    setting: {
      findMany: async () => Object.entries(etat.reglages).map(([key, value]) => ({ key, value })),
      findUnique: async (args: ArgsPrisma) => {
        const cle = args.where?.key ?? "";
        return cle in etat.reglages ? { key: cle, value: etat.reglages[cle] } : null;
      },
    },
    openingHours: { findMany: async () => [] },
    counter: {
      upsert: async () => {
        etat.compteurTickets += 1;
        return { key: "ticket", value: etat.compteurTickets };
      },
    },
    order: {
      create: async (args: ArgsPrisma) => {
        if (etat.collisionCreation) {
          const erreur: Error & { code?: string } = new Error("Unique constraint failed");
          erreur.code = "P2002";
          throw erreur;
        }
        const row = {
          ...(args.data ?? {}),
          id: `cmd-${etat.commandes.length + 1}`,
          createdAt: new Date(),
        };
        etat.commandes.push(row);
        return row;
      },
      delete: async (args: ArgsPrisma) => {
        etat.supprimees.push(String(args.where?.id ?? ""));
        return {};
      },
    },
  },
}));

const reserveStock = vi.fn();
vi.mock("@/lib/stock", () => ({
  reserveStock: (...args: unknown[]) => reserveStock(...args),
  releaseStock: async () => undefined,
}));

import { POST } from "@/app/api/borne/commande/route";
import { BORNE_DEFAULT_NAME, BORNE_TOKEN_HEADER } from "@/lib/borne";
import { PAYMENT_AT_COUNTER } from "@/lib/types";
import { appeler, type CorpsErreur } from "./aide/requete";

// ─── État de la base simulée ───────────────────────────────────

/** Ligne `Dish` telle que `rowToDish()` la lit. */
interface LignePlat {
  id: string;
  cat: string;
  name: string;
  desc: string;
  priceCents: number | null;
  photo: string | null;
  badge: string | null;
  popular: boolean;
  available: boolean;
  spice: number;
  tags: string;
  options: string;
  formules: string | null;
  allergens: string;
  stock: number | null;
  stockAlert: number | null;
  costCents: number | null;
  position: number;
  leadTimeHours: number;
  vatRateBp: number;
}

function plat(over: Partial<LignePlat> = {}): LignePlat {
  return {
    id: "plat-mafe",
    cat: "africaine",
    name: "Mafé Bœuf",
    desc: "Bœuf mijoté, sauce arachide",
    priceCents: 1200,
    photo: null,
    badge: null,
    popular: false,
    available: true,
    spice: 0,
    tags: "[]",
    options: "[]",
    formules: null,
    allergens: "[]",
    stock: null,
    stockAlert: null,
    costCents: null,
    position: 0,
    leadTimeHours: 0,
    vatRateBp: 1000,
    ...over,
  };
}

const MAFE = plat();
const CANETTE = plat({ id: "boisson-coca", name: "Coca-Cola 33 cl", priceCents: 250, vatRateBp: 550 });
const GIGOT = plat({ id: "plat-gigot", name: "Gigot d'agneau", priceCents: 6500, leadTimeHours: 48 });

const JETON = "BORNEJETON234567";

const etat = {
  plats: [] as LignePlat[],
  reglages: {} as Record<string, string>,
  compteurTickets: 0,
  commandes: [] as Record<string, unknown>[],
  supprimees: [] as string[],
  collisionCreation: false,
};

/** Mercredi 14 octobre 2026, 19 h à Paris : plein service du soir. */
const EN_SERVICE = new Date("2026-10-14T17:00:00.000Z");
/** Même jour, 16 h : entre les deux services, le restaurant est fermé. */
const HORS_SERVICE = new Date("2026-10-14T14:00:00.000Z");

/** Appel nominal : jeton valide, panier d'un mafé, sur place. */
function commander(options: {
  corps?: unknown;
  jeton?: string | null;
  entetes?: Record<string, string>;
} = {}) {
  const entetes: Record<string, string> = { ...options.entetes };
  if (options.jeton !== null) entetes[BORNE_TOKEN_HEADER] = options.jeton ?? JETON;
  return appeler<Record<string, unknown> & CorpsErreur>(POST, {
    chemin: "/api/borne/commande",
    corps: options.corps ?? { mode: "sur_place", lines: [{ dishId: MAFE.id, qty: 1 }] },
    entetes,
  });
}

/** Dernière commande écrite en base. */
function derniereCommande(): Record<string, unknown> {
  const row = etat.commandes.at(-1);
  if (!row) throw new Error("aucune commande créée");
  return row;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EN_SERVICE);
  etat.plats = [MAFE, CANETTE, GIGOT];
  etat.reglages = { "borne.enabled": "true", "borne.token": JETON, "borne.emporter": "true" };
  etat.compteurTickets = 0;
  etat.commandes = [];
  etat.supprimees = [];
  etat.collisionCreation = false;
  reserveStock.mockReset();
  reserveStock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Jeton de l'appareil ───────────────────────────────────────

/* Le jeton est la seule chose qui distingue la tablette de la salle d'un
 * navigateur quelconque pointé sur `/borne`. Chaque trou ici est une commande
 * fantôme que la cuisine prépare pour personne. */
describe("jeton de la tablette", () => {
  it("refuse une requête sans en-tête de jeton", async () => {
    const r = await commander({ jeton: null });
    expect(r.statut).toBe(401);
    expect(r.corps.error).toMatch(/Réglages/);
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse un jeton faux de même longueur", async () => {
    const faux = "BORNEJETON234568";
    expect(faux).toHaveLength(JETON.length);
    const r = await commander({ jeton: faux });
    expect(r.statut).toBe(401);
  });

  /* `timingSafeEqual` **lève** sur deux tampons de longueurs différentes : sans
   * le contrôle de longueur en amont, un jeton tronqué rendait une 500 — donc
   * une trace d'erreur serveur à chaque faute de frappe, et un oracle de
   * longueur plus bavard qu'un simple refus. */
  it("refuse un jeton trop court sans tomber en erreur serveur", async () => {
    const r = await commander({ jeton: "BORNE" });
    expect(r.statut).toBe(401);
  });

  it("refuse un jeton trop long sans tomber en erreur serveur", async () => {
    const r = await commander({ jeton: `${JETON}XYZ` });
    expect(r.statut).toBe(401);
  });

  it("refuse tout le monde quand aucun jeton n'est posé dans les Réglages", async () => {
    etat.reglages["borne.token"] = "";
    expect((await commander({ jeton: "" })).statut).toBe(401);
    expect((await commander({ jeton: null })).statut).toBe(401);
    expect((await commander({ jeton: JETON })).statut).toBe(401);
  });

  it("accepte le jeton saisi en minuscules et entouré d'espaces sur un clavier de tablette", async () => {
    const r = await commander({ jeton: `  ${JETON.toLowerCase()} ` });
    expect(r.statut).toBe(201);
  });

  /* Une tablette inconnue n'apprend rien : ni que la borne est éteinte, ni que
   * le restaurant est fermé, ni ce que vaut son panier. */
  it("ne révèle ni l'état de la borne ni les horaires à une tablette inconnue", async () => {
    etat.reglages["borne.enabled"] = "false";
    vi.setSystemTime(HORS_SERVICE);
    const r = await commander({ jeton: "AUTRECHOSE12345", corps: { mode: "livraison", lines: [] } });
    expect(r.statut).toBe(401);
  });
});

// ─── Ce que la borne ne sait pas faire ─────────────────────────

/* La borne est un entonnoir volontairement étroit : tout ce qui demande une
 * date, une adresse ou un paiement en ligne doit repartir vers le site ou le
 * comptoir, avec un message qui le dit au client debout devant l'écran. */
describe("portes fermées", () => {
  it("se coupe sans se débrancher quand les Réglages l'éteignent", async () => {
    etat.reglages["borne.enabled"] = "false";
    const r = await commander();
    expect(r.statut).toBe(503);
    expect(r.corps.error).toMatch(/fermée/i);
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse la livraison : la borne ne livre pas", async () => {
    const r = await commander({ corps: { mode: "livraison", lines: [{ dishId: MAFE.id, qty: 1 }] } });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toMatch(/mode/i);
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse un mode inventé", async () => {
    const r = await commander({ corps: { mode: "sur-place", lines: [{ dishId: MAFE.id, qty: 1 }] } });
    expect(r.statut).toBe(400);
  });

  it("refuse « à emporter » quand les Réglages ne le proposent pas", async () => {
    etat.reglages["borne.emporter"] = "false";
    const r = await commander({ corps: { mode: "emporter", lines: [{ dishId: MAFE.id, qty: 1 }] } });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toMatch(/emporter/i);
  });

  it("refuse un plat sur commande et renvoie vers le site ou le comptoir", async () => {
    const r = await commander({
      corps: { mode: "sur_place", lines: [{ dishId: GIGOT.id, qty: 1 }] },
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/site ou au comptoir/);
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse hors service en disant quand le restaurant rouvre", async () => {
    vi.setSystemTime(HORS_SERVICE);
    const r = await commander();
    expect(r.statut).toBe(409);
    expect(r.corps.error).toContain("Mercredi");
    expect(r.corps.error).toContain("18:00");
  });
});

// ─── Panier ────────────────────────────────────────────────────

/* Le panier arrive d'un écran tactile public : tout y est falsifiable, des
 * quantités aux identifiants de plats. Aucune de ces lignes ne doit produire
 * une commande, et aucune ne doit produire une 500. */
describe("panier refusé", () => {
  it("refuse un panier vide", async () => {
    const r = await commander({ corps: { mode: "sur_place", lines: [] } });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toMatch(/vide/i);
  });

  it("refuse un corps qui n'est pas du JSON", async () => {
    const r = await appeler<CorpsErreur>(POST, {
      chemin: "/api/borne/commande",
      corpsBrut: "{ceci n'est pas du json",
      entetes: { [BORNE_TOKEN_HEADER]: JETON },
    });
    expect(r.statut).toBe(400);
  });

  it("refuse un plat qui n'existe pas", async () => {
    const r = await commander({
      corps: { mode: "sur_place", lines: [{ dishId: "plat-inexistant", qty: 1 }] },
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/n'existe plus/);
  });

  it("refuse un plat retiré de la carte", async () => {
    etat.plats = [plat({ available: false })];
    const r = await commander();
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/plus disponible/);
  });

  it("refuse les quantités absurdes", async () => {
    for (const qty of [0, -3, 1.5, 51, Number.NaN]) {
      const r = await commander({ corps: { mode: "sur_place", lines: [{ dishId: MAFE.id, qty }] } });
      expect(r.statut, `qty=${qty}`).toBe(409);
      expect(r.corps.error, `qty=${qty}`).toMatch(/Quantité invalide/);
    }
    expect(etat.commandes).toHaveLength(0);
  });

  it("compte le stock sur le cumul du panier, pas ligne par ligne", async () => {
    etat.plats = [plat({ stock: 3 })];
    const r = await commander({
      corps: {
        mode: "sur_place",
        lines: [
          { dishId: MAFE.id, qty: 2, opts: {} },
          { dishId: MAFE.id, qty: 2, note: "sans piment" },
        ],
      },
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/Il ne reste que 3/);
  });

  it("refuse un panier plus long que la carte", async () => {
    const lines = Array.from({ length: 61 }, () => ({ dishId: MAFE.id, qty: 1 }));
    const r = await commander({ corps: { mode: "sur_place", lines } });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/Trop d'articles/);
  });

  it("refuse une formule qui n'est plus proposée", async () => {
    const r = await commander({
      corps: {
        mode: "sur_place",
        lines: [{ formulaId: "formule-disparue", qty: 1, picks: [] }],
      },
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/formule/i);
  });

  /* Rupture entre l'affichage et la validation : le client a touché le dernier
   * thiéboudiène en même temps que le comptoir l'a vendu. La commande déjà
   * écrite doit disparaître, sinon la cuisine voit passer un plat qui n'existe
   * plus. */
  it("supprime la commande quand un plat vient d'être épuisé", async () => {
    reserveStock.mockResolvedValue({
      ok: false,
      shortages: [{ dishId: MAFE.id, name: MAFE.name, requested: 1, available: 0 }],
    });
    const r = await commander();
    expect(r.statut).toBe(409);
    expect(r.corps.error).toContain("Mafé Bœuf");
    expect(etat.supprimees).toEqual(["cmd-1"]);
  });
});

// ─── Montants : la tablette ne décide de rien ──────────────────

/* La faille historique du projet, côté borne : un écran tactile en libre accès
 * est encore plus facile à manipuler qu'un navigateur, et il n'y a pas de
 * Stripe derrière pour rattraper l'erreur — c'est le comptoir qui encaisse ce
 * que la commande affiche. */
describe("montants", () => {
  it("ignore les prix et totaux glissés dans le corps", async () => {
    const r = await commander({
      corps: {
        mode: "sur_place",
        lines: [{ dishId: MAFE.id, qty: 2, unitPriceCents: 1, lineTotalCents: 2, price: 0.01 }],
        totalCents: 2,
        subtotalCents: 2,
        discountCents: 5000,
      },
    });

    expect(r.statut).toBe(201);
    expect(r.corps.totalCents).toBe(2400);
    const row = derniereCommande();
    expect(row.totalCents).toBe(2400);
    expect(row.subtotalCents).toBe(2400);
    expect(row.discountCents).toBe(0);
    expect(row.feeCents).toBe(0);
  });

  it("ne facture aucun frais de livraison en salle", async () => {
    const r = await commander();
    expect(r.statut).toBe(201);
    expect(derniereCommande().feeCents).toBe(0);
    expect(derniereCommande().zoneIdx).toBeNull();
  });
});

// ─── TVA en salle ──────────────────────────────────────────────

/* Une canette porte 5,5 % en base, parce qu'elle se vend aussi en contenant
 * fermé. Servie à table, elle repasse à 10 %. Ventiler la salle au taux du plat
 * déclarerait les boissons du restaurant au taux de l'épicerie. */
describe("ventilation de TVA", () => {
  it("passe une canette consommée sur place à 10 %", async () => {
    const r = await commander({
      corps: { mode: "sur_place", lines: [{ dishId: CANETTE.id, qty: 2 }] },
    });
    expect(r.statut).toBe(201);
    const lignes = r.corps.lines as { vatSplit: [number, number][] }[];
    expect(lignes[0].vatSplit).toEqual([[1000, 500]]);
  });

  it("laisse la même canette à 5,5 % quand elle part à emporter", async () => {
    const r = await commander({
      corps: { mode: "emporter", lines: [{ dishId: CANETTE.id, qty: 2 }] },
    });
    expect(r.statut).toBe(201);
    const lignes = r.corps.lines as { vatSplit: [number, number][] }[];
    expect(lignes[0].vatSplit).toEqual([[550, 500]]);
  });

  it("laisse un plat à 10 % dans les deux cas", async () => {
    for (const mode of ["sur_place", "emporter"]) {
      const r = await commander({ corps: { mode, lines: [{ dishId: MAFE.id, qty: 1 }] } });
      const lignes = r.corps.lines as { vatSplit: [number, number][] }[];
      expect(lignes[0].vatSplit, mode).toEqual([[1000, 1200]]);
    }
  });
});

// ─── Numéro d'attente et commande créée ────────────────────────

/* Le numéro d'attente est le **seul** lien entre le client et sa commande : la
 * borne ne prend ni email ni téléphone. S'il manque, se répète ou ne remonte
 * pas à la tablette, le client n'a plus aucun moyen de réclamer son plat. */
describe("numéro d'attente", () => {
  it("tire un numéro du jour et le rend à la tablette", async () => {
    const r = await commander();
    expect(r.statut).toBe(201);
    expect(r.corps.ticketNumber).toBe(1);
    expect(r.corps.ticketDate).toBe("2026-10-14");
    expect(derniereCommande().ticketNumber).toBe(1);
    expect(derniereCommande().ticketDate).toBe("2026-10-14");
  });

  it("avance d'une commande à l'autre", async () => {
    expect((await commander()).corps.ticketNumber).toBe(1);
    expect((await commander()).corps.ticketNumber).toBe(2);
    expect((await commander()).corps.ticketNumber).toBe(3);
  });

  it("rend aussi la référence et la composition, de quoi imprimer le ticket", async () => {
    const r = await commander();
    expect(String(r.corps.ref)).toMatch(/^#[A-Z0-9]{6}$/);
    expect(r.corps.orderId).toBe("cmd-1");
    expect(typeof r.corps.createdAt).toBe("number");
    expect(r.corps.lines).toHaveLength(1);
  });
});

/* La commande de la borne entre en cuisine tout de suite — le client est
 * debout devant le comptoir — mais n'est pas payée : c'est la caisse qui
 * encaisse, et l'écran Facturation doit pouvoir le faire à la main. */
describe("commande écrite en base", () => {
  it("entre en cuisine immédiatement, sans être payée", async () => {
    await commander();
    const row = derniereCommande();
    expect(row.status).toBe("confirmee");
    expect(row.confirmedAt).toBeInstanceOf(Date);
    expect(row.paid).toBe(false);
    expect(row.paymentStatus).toBe("en_attente");
    expect(row.paymentMethod).toBe(PAYMENT_AT_COUNTER);
    expect(row.slot).toBe("asap");
    expect(row.preorder).toBe(false);
  });

  it("ne porte aucune coordonnée : rien ne doit partir par email", async () => {
    await commander();
    const row = derniereCommande();
    expect(row.customerEmail).toBe("");
    expect(row.customerPhone).toBe("");
    expect(row.address).toBeNull();
    expect(row.userId).toBeNull();
  });

  it("nettoie le prénom saisi au clavier tactile", async () => {
    await commander({
      corps: { mode: "sur_place", lines: [{ dishId: MAFE.id, qty: 1 }], prenom: "  awa \n diallo " },
    });
    expect(derniereCommande().customerName).toBe("awa diallo");
  });

  it("appelle « Client borne » celui qui n'a rien saisi", async () => {
    await commander({ corps: { mode: "sur_place", lines: [{ dishId: MAFE.id, qty: 1 }] } });
    expect(derniereCommande().customerName).toBe(BORNE_DEFAULT_NAME);
  });

  it("borne la note du client à ce qu'un ticket peut imprimer", async () => {
    await commander({
      corps: {
        mode: "sur_place",
        lines: [{ dishId: MAFE.id, qty: 1, note: "x".repeat(900) }],
      },
    });
    const lignes = JSON.parse(String(derniereCommande().lines)) as { note: string }[];
    expect(lignes[0].note).toHaveLength(300);
  });

  /* Dernier filet : l'écriture en base échoue malgré les reprises de
   * `withUniqueRef`. Le client est debout devant l'écran — il doit lire quoi
   * faire, pas une trace d'erreur. */
  it("renvoie le client au comptoir quand l'écriture échoue", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => undefined);
    etat.collisionCreation = true;
    const r = await commander();
    expect(r.statut).toBe(500);
    expect(r.corps.error).toMatch(/comptoir/);
    expect(r.corps.error).not.toMatch(/Unique constraint/);
    expect(journal).toHaveBeenCalled();
    journal.mockRestore();
  });
});
