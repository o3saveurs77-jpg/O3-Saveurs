import { beforeEach, describe, expect, it, vi } from "vitest";

/* PATCH /api/orders/[id] — la machine à états des commandes, côté admin.
 *
 * Cette route était **ouverte à tous** : n'importe qui pouvait basculer toutes
 * les commandes en « annulée » ou « livrée », et la page de suivi client faisait
 * même avancer le statut toute seule toutes les douze secondes. Deux choses sont
 * donc éprouvées ici avant tout le reste :
 *
 *  · **qui** peut écrire — un ADMIN, personne d'autre, et le refus doit arriver
 *    avant même de dire si la commande existe ;
 *  · **quelles** transitions sont possibles. `STATUS_NEXT` est la seule
 *    autorité : on ne revient pas d'une commande livrée à « en cuisine », on ne
 *    saute pas la cuisine, et une commande annulée est un terminus. Chaque
 *    étape franchie est horodatée — ces dates sont les délais réels qu'affiche
 *    le tableau de bord, et une étape sautée les rend faux pour toujours.
 *
 * S'y ajoutent les effets de bord qui ne se voient pas dans la réponse et que
 * rien d'autre qu'un test ne surveille : le stock rendu, la tournée quittée,
 * le numéro de facture attribué une seule fois, les emails envoyés.
 */

vi.mock("@/auth", async () => (await import("./aide/session")).moduleAuth());

/** Sous-ensemble des arguments Prisma réellement lus par les doubles. */
interface ArgsPrisma {
  where?: { id?: string; deliveryRunId?: string | null };
  data?: Record<string, unknown>;
  include?: { driver?: unknown };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: async (args: ArgsPrisma) => {
        etat.lectures.push(String(args.where?.id ?? ""));
        return etat.commande && etat.commande.id === args.where?.id ? etat.commande : null;
      },
      findMany: async (args: ArgsPrisma) => {
        etat.tourneeRelue = args.where?.deliveryRunId ?? null;
        return etat.arretsRestants;
      },
      /* Volontairement **sans muter** la ligne préparée par le test : Prisma
       * rend une ligne neuve, et la route compare l'état écrit à l'état lu
       * avant écriture (`current.paid`, `current.status`) pour décider de rendre
       * le stock ou d'envoyer la facture. Un double qui modifie l'objet lu
       * ferait passer ces deux conditions pour fausses, et des tests verts pour
       * des effets jamais déclenchés. */
      update: async (args: ArgsPrisma) => {
        const id = String(args.where?.id ?? "");
        const data = args.data ?? {};
        etat.majCommandes.push({ id, data });
        if (etat.commande && etat.commande.id === id) {
          const fusion = { ...etat.commande, ...data };
          const livreur = etat.livreurs.find((l) => l.id === fusion.driverId);
          return { ...fusion, driver: livreur ? { name: livreur.name } : null };
        }
        return { id, ...data };
      },
    },
    driver: {
      findUnique: async (args: ArgsPrisma) =>
        etat.livreurs.find((l) => l.id === args.where?.id) ?? null,
    },
    counter: {
      upsert: async () => {
        etat.compteurFactures += 1;
        etat.appelsCompteur += 1;
        return { key: "invoice", value: etat.compteurFactures };
      },
    },
    $transaction: async (operations: unknown) =>
      Array.isArray(operations) ? Promise.all(operations) : operations,
  },
}));

const releaseStock = vi.fn();
vi.mock("@/lib/stock", () => ({
  releaseStock: (...args: unknown[]) => releaseStock(...args),
  reserveStock: async () => ({ ok: true }),
}));

const envoiStatut = vi.fn();
const envoiFacture = vi.fn();
const envoiRefusAnnulation = vi.fn();
vi.mock("@/lib/email", () => ({
  sendStatusUpdate: (...args: unknown[]) => envoiStatut(...args),
  sendInvoice: (...args: unknown[]) => envoiFacture(...args),
  sendCancelDeclined: (...args: unknown[]) => envoiRefusAnnulation(...args),
}));

import { PATCH } from "@/app/api/orders/[id]/route";
import { ORDER_STATUSES, STATUS_NEXT, type OrderStatus } from "@/lib/types";
import type { Order } from "@/lib/types";
import { appeler, type CorpsErreur } from "./aide/requete";
import { anonyme, enAdmin, enClient } from "./aide/session";

// ─── Commande simulée ──────────────────────────────────────────

/** Ligne `Order` telle que `rowToOrderWithDriver()` la lit. */
interface LigneCommande {
  id: string;
  ref: string;
  invoiceNumber: number | null;
  ticketNumber: number | null;
  ticketDate: string | null;
  userId: string | null;
  lines: string;
  mode: string;
  zoneIdx: number | null;
  distanceKm: number | null;
  slot: string;
  preorder: boolean;
  scheduledFor: Date | null;
  refusalReason: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  totalCents: number;
  vatRateBp: number;
  promotionId: string | null;
  promoCode: string | null;
  paid: boolean;
  paymentStatus: string;
  paymentMethod: string;
  refundedCents: number;
  creditNoteNumber: number | null;
  refundedAt: Date | null;
  refundReason: string;
  cancelRequestedAt: Date | null;
  cancelReason: string;
  createdAt: Date;
  driverId: string | null;
  deliveryRunId: string | null;
  runPosition: number | null;
  deliveryCode: string | null;
  confirmedAt: Date | null;
  cookingAt: Date | null;
  routeAt: Date | null;
  deliveredAt: Date | null;
  canceledAt: Date | null;
  status: string;
}

const LIGNES_FIGEES = JSON.stringify([
  { dishId: "plat-mafe", name: "Mafé Bœuf", unitPriceCents: 1200, qty: 2, lineTotalCents: 2400 },
]);

function commande(over: Partial<LigneCommande> = {}): LigneCommande {
  return {
    id: "cmd-1",
    ref: "#7K2QF9",
    invoiceNumber: null,
    ticketNumber: null,
    ticketDate: null,
    userId: null,
    lines: LIGNES_FIGEES,
    mode: "livraison",
    zoneIdx: 0,
    distanceKm: null,
    slot: "20:00",
    preorder: false,
    scheduledFor: null,
    refusalReason: "",
    customerName: "Awa Diallo",
    customerEmail: "awa.diallo@example.fr",
    customerPhone: "0612345678",
    address: "12 rue des Prés",
    city: "Pontault-Combault",
    zip: "77340",
    subtotalCents: 2400,
    discountCents: 0,
    feeCents: 300,
    totalCents: 2700,
    vatRateBp: 1000,
    promotionId: null,
    promoCode: null,
    paid: false,
    paymentStatus: "en_attente",
    paymentMethod: "Carte bancaire",
    refundedCents: 0,
    creditNoteNumber: null,
    refundedAt: null,
    refundReason: "",
    cancelRequestedAt: null,
    cancelReason: "",
    createdAt: new Date("2026-10-14T17:00:00.000Z"),
    driverId: null,
    deliveryRunId: null,
    runPosition: null,
    deliveryCode: null,
    confirmedAt: new Date("2026-10-14T17:01:00.000Z"),
    cookingAt: null,
    routeAt: null,
    deliveredAt: null,
    canceledAt: null,
    status: "confirmee",
    ...over,
  };
}

const etat = {
  commande: null as LigneCommande | null,
  livreurs: [] as { id: string; name: string }[],
  arretsRestants: [] as { id: string; runPosition: number | null }[],
  majCommandes: [] as { id: string; data: Record<string, unknown> }[],
  lectures: [] as string[],
  tourneeRelue: null as string | null | undefined,
  compteurFactures: 41,
  appelsCompteur: 0,
};

/** Dernière écriture envoyée à Prisma pour la commande visée. */
function derniereMaj(id = "cmd-1"): Record<string, unknown> {
  const maj = [...etat.majCommandes].reverse().find((m) => m.id === id);
  if (!maj) throw new Error(`aucune mise à jour pour ${id}`);
  return maj.data;
}

function patch(corps: Record<string, unknown>, id = "cmd-1") {
  return appeler<Order & CorpsErreur>(PATCH, {
    methode: "PATCH",
    chemin: `/api/orders/${id}`,
    corps,
    params: { id },
  });
}

beforeEach(() => {
  enAdmin();
  etat.commande = commande();
  etat.livreurs = [{ id: "liv-1", name: "Moussa" }];
  etat.arretsRestants = [];
  etat.majCommandes = [];
  etat.lectures = [];
  etat.tourneeRelue = undefined;
  etat.compteurFactures = 41;
  etat.appelsCompteur = 0;
  releaseStock.mockReset();
  releaseStock.mockResolvedValue(undefined);
  envoiStatut.mockReset();
  envoiStatut.mockResolvedValue(undefined);
  envoiFacture.mockReset();
  envoiFacture.mockResolvedValue(undefined);
  envoiRefusAnnulation.mockReset();
  envoiRefusAnnulation.mockResolvedValue(undefined);
});

// ─── Qui a le droit d'écrire ───────────────────────────────────

/* Le middleware ne protège que les **pages** `/admin` : aucune route `/api/*`
 * n'en bénéficie. Si le garde disparaît d'ici, rien d'autre ne retient un
 * visiteur qui fait avancer ou annuler les commandes du service. */
describe("accès réservé à l'administration", () => {
  it("refuse un visiteur sans session, sans même lire la commande", async () => {
    anonyme();
    const r = await patch({ status: "cuisine" });
    expect(r.statut).toBe(401);
    expect(r.corps.error).toBe("Connexion requise");
    expect(etat.lectures).toHaveLength(0);
    expect(etat.majCommandes).toHaveLength(0);
  });

  it("refuse un client connecté", async () => {
    enClient();
    const r = await patch({ status: "annulee" });
    expect(r.statut).toBe(403);
    expect(r.corps.error).toMatch(/administration/i);
    expect(etat.majCommandes).toHaveLength(0);
  });

  it("traite comme un client une session sans rôle", async () => {
    enClient({ role: undefined });
    expect((await patch({ status: "cuisine" })).statut).toBe(403);
  });

  it("refuse une session sans email exploitable", async () => {
    enAdmin({ email: "" });
    expect((await patch({ status: "cuisine" })).statut).toBe(401);
  });

  it("répond 404 sur une commande inconnue", async () => {
    const r = await patch({ status: "cuisine" }, "cmd-fantome");
    expect(r.statut).toBe(404);
  });

  it("refuse un corps qui n'est pas du JSON", async () => {
    const r = await appeler<CorpsErreur>(PATCH, {
      methode: "PATCH",
      chemin: "/api/orders/cmd-1",
      corpsBrut: "{status:",
      params: { id: "cmd-1" },
    });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toBe("Requête invalide");
  });
});

// ─── Transitions ───────────────────────────────────────────────

/* Le tableau complet, dans les deux sens. Écrit en boucle sur `STATUS_NEXT`
 * volontairement : une valeur ajoutée à la machine à états sans transition
 * pensée se signalera ici, et non en plein service. */
describe("machine à états", () => {
  const autorisees: [OrderStatus, OrderStatus][] = [];
  const interdites: [OrderStatus, OrderStatus][] = [];
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      if (from === to) continue;
      (STATUS_NEXT[from].includes(to) ? autorisees : interdites).push([from, to]);
    }
  }

  it("connaît des transitions autorisées et des transitions interdites", () => {
    expect(autorisees.length).toBeGreaterThan(5);
    expect(interdites.length).toBeGreaterThan(autorisees.length);
  });

  it("accepte toutes les transitions de STATUS_NEXT", async () => {
    for (const [from, to] of autorisees) {
      /* `en_attente_validation` fait exception : la transition existe bien dans
       * `STATUS_NEXT`, mais elle doit passer par la route dédiée aux plats sur
       * commande — sans quoi le client n'est ni prévenu ni remboursé. */
      if (from === "en_attente_validation") continue;

      etat.commande = commande({ status: from });
      etat.majCommandes = [];
      const r = await patch({ status: to });
      expect(r.statut, `${from} → ${to}`).toBe(200);
      expect(derniereMaj().status, `${from} → ${to}`).toBe(to);
    }
  });

  it("refuse tout retour en arrière et toute étape sautée", async () => {
    for (const [from, to] of interdites) {
      etat.commande = commande({ status: from });
      etat.majCommandes = [];
      const r = await patch({ status: to });
      expect(r.statut, `${from} → ${to}`).toBe(400);
      expect(etat.majCommandes, `${from} → ${to}`).toHaveLength(0);
    }
  });

  it("refuse nommément de revenir d'une commande livrée à la cuisine", async () => {
    etat.commande = commande({ status: "livree", deliveredAt: new Date() });
    const r = await patch({ status: "cuisine" });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toBe("Transition impossible : « livree » → « cuisine »");
  });

  it("refuse de sauter la cuisine", async () => {
    etat.commande = commande({ status: "confirmee" });
    expect((await patch({ status: "route" })).statut).toBe(400);
    expect((await patch({ status: "livree" })).statut).toBe(400);
  });

  it("fait d'une commande annulée un terminus", async () => {
    etat.commande = commande({ status: "annulee", canceledAt: new Date() });
    for (const to of ORDER_STATUSES) {
      if (to === "annulee") continue;
      expect((await patch({ status: to })).statut, to).toBe(400);
    }
  });

  it("renvoie vers le panneau dédié pour une commande sur commande à valider", async () => {
    etat.commande = commande({ status: "en_attente_validation", preorder: true });
    const r = await patch({ status: "confirmee" });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toMatch(/preorder/);
    expect(etat.majCommandes).toHaveLength(0);
    expect(envoiStatut).not.toHaveBeenCalled();
  });

  it("refuse un statut qui n'existe pas", async () => {
    for (const status of ["livrée", "payee", "", 42, null]) {
      const r = await patch({ status });
      expect(r.statut, JSON.stringify(status)).toBe(400);
    }
  });

  it("ne touche à rien quand le statut est déjà celui demandé", async () => {
    const r = await patch({ status: "confirmee" });
    expect(r.statut).toBe(200);
    expect(etat.majCommandes).toHaveLength(0);
    expect(envoiStatut).not.toHaveBeenCalled();
  });
});

// ─── Horodatage ────────────────────────────────────────────────

/* Chaque étape pose sa date. C'est ce qui permet au tableau de bord de dire
 * « 38 minutes entre la confirmation et le départ » plutôt que de l'estimer, et
 * c'est irrattrapable : une date non posée au moment du geste est perdue. */
describe("horodatage des étapes", () => {
  it("pose la date de chaque étape franchie", async () => {
    const etapes: [OrderStatus, OrderStatus, string][] = [
      ["confirmee", "cuisine", "cookingAt"],
      ["cuisine", "route", "routeAt"],
      ["route", "livree", "deliveredAt"],
      ["confirmee", "annulee", "canceledAt"],
    ];
    for (const [from, to, champ] of etapes) {
      etat.commande = commande({ status: from });
      etat.majCommandes = [];
      await patch({ status: to });
      expect(derniereMaj()[champ], `${from} → ${to}`).toBeInstanceOf(Date);
    }
  });

  it("garde la première date de confirmation plutôt que de la réécrire", async () => {
    const dejaConfirmee = new Date("2026-10-14T17:01:00.000Z");
    etat.commande = commande({ status: "en_attente_paiement", confirmedAt: dejaConfirmee });
    await patch({ status: "confirmee" });
    expect(derniereMaj().confirmedAt).toEqual(dejaConfirmee);
  });

  it("confirme une commande qui n'avait pas encore de date", async () => {
    etat.commande = commande({ status: "en_attente_paiement", confirmedAt: null });
    await patch({ status: "confirmee" });
    expect(derniereMaj().confirmedAt).toBeInstanceOf(Date);
  });

  it("prévient le client à chaque changement de statut", async () => {
    await patch({ status: "cuisine" });
    expect(envoiStatut).toHaveBeenCalledTimes(1);
  });
});

// ─── Code de remise ────────────────────────────────────────────

/* Le code dicté au livreur sur le pas de porte prouve la remise en main propre.
 * Il est engendré au départ et **une seule fois** : le regénérer invaliderait
 * celui que le client a déjà sous les yeux. */
describe("code de remise", () => {
  it("engendre un code à quatre chiffres au départ d'une livraison", async () => {
    etat.commande = commande({ status: "cuisine", mode: "livraison" });
    await patch({ status: "route" });
    expect(String(derniereMaj().deliveryCode)).toMatch(/^\d{4}$/);
  });

  it("ne regénère pas un code déjà remis au client", async () => {
    etat.commande = commande({ status: "cuisine", mode: "livraison", deliveryCode: "1234" });
    await patch({ status: "route" });
    expect(derniereMaj().deliveryCode).toBeUndefined();
  });

  it("n'en engendre aucun pour une commande à emporter", async () => {
    etat.commande = commande({ status: "cuisine", mode: "emporter" });
    await patch({ status: "route" });
    expect(derniereMaj().deliveryCode).toBeUndefined();
  });
});

// ─── Annulation ────────────────────────────────────────────────

/* Une annulation a trois effets invisibles dans la réponse, et chacun a déjà
 * coûté une soirée : les articles doivent rentrer en stock, la commande doit
 * quitter sa tournée — `PATCH /api/delivery-runs/[id]` refuse toute composition
 * contenant une commande annulée, donc un arrêt annulé gelait la tournée
 * entière — et les arrêts restants doivent se resserrer sur 0, 1, 2… pour que
 * la feuille de route imprimée corresponde encore à l'écran. */
describe("annulation", () => {
  it("rend les articles au stock", async () => {
    await patch({ status: "annulee" });
    expect(releaseStock).toHaveBeenCalledTimes(1);
    const [lignes, options] = releaseStock.mock.calls[0] as [
      { dishId: string; qty: number }[],
      { orderId: string; reason: string },
    ];
    expect(lignes[0]).toMatchObject({ dishId: "plat-mafe", qty: 2 });
    expect(options).toMatchObject({ orderId: "cmd-1", reason: "correction" });
  });

  it("ne rend rien au stock si les lignes archivées sont illisibles", async () => {
    etat.commande = commande({ lines: "{{corrompu" });
    const r = await patch({ status: "annulee" });
    expect(r.statut).toBe(200);
    const [lignes] = releaseStock.mock.calls[0] as [unknown[]];
    expect(lignes).toEqual([]);
  });

  it("détache la commande de sa tournée", async () => {
    etat.commande = commande({ deliveryRunId: "run-1", runPosition: 1, driverId: "liv-1" });
    etat.arretsRestants = [
      { id: "cmd-2", runPosition: 0 },
      { id: "cmd-3", runPosition: 2 },
    ];

    const r = await patch({ status: "annulee" });

    expect(r.statut).toBe(200);
    expect(derniereMaj()).toMatchObject({ deliveryRunId: null, runPosition: null });
    // Le livreur reste en place : c'est bien lui qui avait la course en main.
    expect(derniereMaj().driverId).toBeUndefined();
    expect(etat.tourneeRelue).toBe("run-1");
  });

  it("resserre les arrêts restants de la tournée", async () => {
    etat.commande = commande({ deliveryRunId: "run-1", runPosition: 0 });
    etat.arretsRestants = [
      { id: "cmd-2", runPosition: 1 },
      { id: "cmd-3", runPosition: 2 },
    ];

    await patch({ status: "annulee" });

    expect(derniereMaj("cmd-2")).toEqual({ runPosition: 0 });
    expect(derniereMaj("cmd-3")).toEqual({ runPosition: 1 });
  });

  it("ne réécrit pas les positions déjà contiguës", async () => {
    etat.commande = commande({ deliveryRunId: "run-1", runPosition: 2 });
    etat.arretsRestants = [
      { id: "cmd-2", runPosition: 0 },
      { id: "cmd-3", runPosition: 1 },
    ];

    await patch({ status: "annulee" });

    expect(etat.majCommandes.filter((m) => m.id !== "cmd-1")).toHaveLength(0);
  });

  it("ne relit aucune tournée pour une commande qui n'en avait pas", async () => {
    await patch({ status: "annulee" });
    expect(etat.tourneeRelue).toBeUndefined();
  });

  it("tranche en faveur de l'annulation quand le même appel réaffecte la tournée", async () => {
    etat.commande = commande({ deliveryRunId: "run-1", runPosition: 0 });
    await patch({ status: "annulee", deliveryRunId: "run-2", runPosition: 3 });
    expect(derniereMaj()).toMatchObject({ deliveryRunId: null, runPosition: null });
  });

  /* ⚠️ DÉFAUT DE PRODUCTION — le trou de positions n'est rebouché que par
   * l'annulation.
   *
   * Le resserrement n'est déclenché que par `data.status === "annulee"`. Un
   * arrêt retiré à la main (`deliveryRunId: null`, ce que fait l'écran
   * Livraisons quand on sort une commande d'une tournée) ou déplacé vers une
   * autre tournée laisse exactement le trou que le commentaire du code décrit :
   * les positions restantes valent 0, 2, 3 et le prochain `orderIds` renvoyé
   * par l'écran — qui numérote ce qu'il affiche — réécrit des positions
   * décalées d'un cran par rapport à la feuille de route déjà imprimée. La
   * correction récente n'a traité qu'un des deux chemins. */
  it.fails("devrait aussi resserrer la tournée après un détachement manuel", async () => {
    etat.commande = commande({ deliveryRunId: "run-1", runPosition: 0 });
    etat.arretsRestants = [
      { id: "cmd-2", runPosition: 1 },
      { id: "cmd-3", runPosition: 2 },
    ];

    await patch({ deliveryRunId: null, runPosition: null });

    expect(derniereMaj("cmd-2")).toEqual({ runPosition: 0 });
  });
});

// ─── Encaissement et facture ───────────────────────────────────

/* Le numéro de facture doit être séquentiel, chronologique et **sans trou**
 * (art. 242 nonies A du CGI) : il est attribué une fois, au moment où la
 * facture est due, et jamais réattribué. Sans l'encaissement manuel, tout le
 * chiffre d'affaires en espèces restait par ailleurs invisible dans l'écran
 * Facturation. */
describe("encaissement manuel", () => {
  it("attribue un numéro de facture et envoie la facture", async () => {
    etat.commande = commande({ paymentMethod: "Espèces sur place", status: "livree" });
    const r = await patch({ paid: true });

    expect(r.statut).toBe(200);
    expect(derniereMaj()).toMatchObject({ paid: true, paymentStatus: "paye", invoiceNumber: 42 });
    expect(etat.appelsCompteur).toBe(1);
    expect(envoiFacture).toHaveBeenCalledTimes(1);
    const [, lien] = envoiFacture.mock.calls[0] as [unknown, string];
    expect(lien).toMatch(/\/facture\/cmd-1$/);
  });

  it("n'attribue qu'un seul numéro, même encaissée deux fois", async () => {
    etat.commande = commande({ paymentMethod: "Espèces sur place" });
    await patch({ paid: true });
    expect(derniereMaj().invoiceNumber).toBe(42);

    // Second appel : la commande est relue en base, elle porte désormais son
    // numéro. La suite fiscale ne doit pas avancer d'un cran de plus.
    etat.commande = commande({ paymentMethod: "Espèces sur place", paid: true, invoiceNumber: 42 });
    etat.majCommandes = [];
    await patch({ paid: true });

    expect(derniereMaj().invoiceNumber).toBeUndefined();
    expect(etat.appelsCompteur).toBe(1);
  });

  it("n'envoie pas deux fois la facture d'une commande déjà encaissée", async () => {
    etat.commande = commande({ paid: true, paymentStatus: "paye", invoiceNumber: 17 });
    await patch({ paid: true });
    expect(envoiFacture).not.toHaveBeenCalled();
  });

  it("accepte « livrée et encaissée » en un seul geste", async () => {
    etat.commande = commande({ status: "route", paymentMethod: "Espèces sur place" });
    const r = await patch({ status: "livree", paid: true });

    expect(r.statut).toBe(200);
    expect(derniereMaj()).toMatchObject({ status: "livree", paid: true, invoiceNumber: 42 });
    expect(derniereMaj().deliveredAt).toBeInstanceOf(Date);
    expect(envoiStatut).toHaveBeenCalledTimes(1);
    expect(envoiFacture).toHaveBeenCalledTimes(1);
  });

  it("remet une commande en attente de paiement sans toucher au numéro", async () => {
    etat.commande = commande({ paid: true, paymentStatus: "paye", invoiceNumber: 17 });
    await patch({ paid: false });
    expect(derniereMaj()).toMatchObject({ paid: false, paymentStatus: "en_attente" });
    expect(derniereMaj().invoiceNumber).toBeUndefined();
    expect(etat.appelsCompteur).toBe(0);
    expect(envoiFacture).not.toHaveBeenCalled();
  });

  /* ⚠️ DÉFAUT DE PRODUCTION — `paid` n'est pas validé.
   *
   * Tous les autres champs de cette route passent par un contrôle (`driverId`
   * est même vérifié en base), mais `body.paid` est recopié tel quel dans
   * `data.paid`, et c'est sa **véracité JavaScript** qui décide du statut de
   * paiement. Un appelant qui envoie la chaîne `"false"` — un formulaire mal
   * sérialisé, un `fetch` écrit à la main, un script d'intégration — obtient
   * `paymentStatus: "paye"`, un numéro de facture tiré de la suite fiscale et
   * une facture envoyée au client, pour une commande qu'il voulait justement
   * déclarer impayée. Prisma refusera l'écriture d'une chaîne dans un booléen,
   * donc en production la requête finit en 500 — après avoir consommé un numéro
   * de facture, qui laisse un trou définitif dans la suite. `bool()` de
   * `lib/validate.ts` existe précisément pour ça. */
  it.fails("devrait refuser un drapeau de paiement qui n'est pas un booléen", async () => {
    const r = await patch({ paid: "false" });
    expect(r.statut).toBe(400);
    expect(etat.appelsCompteur).toBe(0);
  });
});

// ─── Livreur et tournée ────────────────────────────────────────

describe("affectation du livreur", () => {
  it("affecte un livreur existant", async () => {
    const r = await patch({ driverId: "liv-1" });
    expect(r.statut).toBe(200);
    expect(derniereMaj().driverId).toBe("liv-1");
    expect(r.corps.driverName).toBe("Moussa");
  });

  it("refuse un livreur introuvable", async () => {
    const r = await patch({ driverId: "liv-fantome" });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toBe("Livreur introuvable");
    expect(etat.majCommandes).toHaveLength(0);
  });

  it("accepte de retirer le livreur", async () => {
    etat.commande = commande({ driverId: "liv-1" });
    const r = await patch({ driverId: null });
    expect(r.statut).toBe(200);
    expect(derniereMaj().driverId).toBeNull();
  });

  /* ⚠️ DÉFAUT DE PRODUCTION — la tournée et la position ne sont pas validées.
   *
   * `driverId` est vérifié en base avant d'être écrit ; `deliveryRunId` et
   * `runPosition`, non : ils sont recopiés tels quels. Une tournée inexistante
   * viole la clé étrangère `Order.deliveryRun` et Prisma lève — la route n'a
   * pas de `try/catch` autour de son `update`, l'admin reçoit donc une 500 nue
   * là où les autres champs produisent un refus lisible. Une `runPosition`
   * négative ou décimale, elle, s'écrit sans rien casser et désordonne
   * silencieusement la feuille de route du livreur. */
  it.fails("devrait refuser une tournée inexistante comme elle refuse un livreur inconnu", async () => {
    const r = await patch({ deliveryRunId: "run-fantome" });
    expect(r.statut).toBe(400);
  });

  it.fails("devrait refuser une position d'arrêt négative ou décimale", async () => {
    expect((await patch({ runPosition: -3 })).statut).toBe(400);
    expect((await patch({ runPosition: 1.5 })).statut).toBe(400);
  });
});

// ─── Demande d'annulation refusée ──────────────────────────────

/* Un client qui demande l'annulation d'une commande déjà engagée doit obtenir
 * une réponse. Sans elle, il attend une annulation qui ne viendra pas, puis
 * voit arriver la commande : le litige assuré. */
describe("refus d'une demande d'annulation", () => {
  it("refuse la demande, l'efface et explique pourquoi au client", async () => {
    etat.commande = commande({ cancelRequestedAt: new Date("2026-10-14T17:10:00.000Z") });
    const r = await patch({ declineCancel: true, declineReason: "Déjà en cuisine" });

    expect(r.statut).toBe(200);
    expect(derniereMaj().cancelRequestedAt).toBeNull();
    expect(envoiRefusAnnulation).toHaveBeenCalledTimes(1);
    const [, raison] = envoiRefusAnnulation.mock.calls[0] as [unknown, string];
    expect(raison).toBe("Déjà en cuisine");
  });

  it("refuse de répondre à une demande qui n'existe pas", async () => {
    const r = await patch({ declineCancel: true });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toMatch(/Aucune demande/);
    expect(envoiRefusAnnulation).not.toHaveBeenCalled();
  });

  it("refuse de maintenir une commande déjà annulée", async () => {
    etat.commande = commande({ status: "annulee", cancelRequestedAt: new Date() });
    const r = await patch({ declineCancel: true });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toMatch(/déjà annulée/);
  });

  it("ignore un refus non explicite", async () => {
    etat.commande = commande({ cancelRequestedAt: new Date() });
    const r = await patch({ declineCancel: "oui" });
    expect(r.statut).toBe(200);
    expect(etat.majCommandes).toHaveLength(0);
    expect(envoiRefusAnnulation).not.toHaveBeenCalled();
  });
});

// ─── Réponse rendue à l'écran ──────────────────────────────────

/* L'écran Commandes remplace sa ligne par la réponse de cette route. Ce qui en
 * manque disparaît donc de l'affichage jusqu'au prochain rechargement. */
describe("réponse rendue à l'admin", () => {
  it("rend la commande complète, livreur compris", async () => {
    etat.commande = commande({ driverId: "liv-1" });
    const r = await patch({ status: "cuisine" });
    expect(r.corps.id).toBe("cmd-1");
    expect(r.corps.status).toBe("cuisine");
    expect(r.corps.driverName).toBe("Moussa");
    expect(r.corps.customer.email).toBe("awa.diallo@example.fr");
  });

  /* ⚠️ DÉFAUT DE PRODUCTION — un appel sans effet perd le nom du livreur.
   *
   * Quand aucun champ n'est à écrire (statut déjà à la valeur demandée, corps
   * vide), la route répond avec `rowToOrderWithDriver({ ...current, driver:
   * null })`. Or `current` est lu sans `include: { driver: … }` : le nom du
   * livreur est donc `null` dans cette réponse, alors qu'il est bien renseigné
   * dans la réponse de n'importe quel appel qui écrit quelque chose. L'écran
   * Commandes, qui remplace sa ligne par ce qu'il reçoit, affiche « non
   * assigné » pour une course bel et bien affectée — et le dispatcher la
   * réaffecte. Il suffirait de relire la commande avec sa relation, ou de
   * renvoyer le nom déjà connu. */
  it.fails("devrait garder le nom du livreur même quand rien n'est à écrire", async () => {
    etat.commande = commande({ driverId: "liv-1" });
    const r = await patch({ status: "confirmee" });
    expect(etat.majCommandes).toHaveLength(0);
    expect(r.corps.driverName).toBe("Moussa");
  });
});
