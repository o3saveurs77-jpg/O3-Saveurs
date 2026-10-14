/* Ce qu'un double en mémoire ne peut pas prouver.
 *
 * Le reste de la suite double Prisma, et vérifie donc la logique écrite dans
 * nos fichiers. Elle ne vérifie pas que PostgreSQL tient ses promesses : qu'une
 * transaction annulée rend bien le stock qu'elle avait pris, qu'un compteur
 * incrémenté par vingt appels simultanés rend vingt valeurs distinctes, qu'un
 * index unique tranche entre deux écritures concurrentes. Ces trois choses-là
 * portent l'argent et le stock du restaurant, et elles ne se démontrent que
 * contre une vraie base.
 *
 * D'où ce fichier, qui parle à un PostgreSQL jetable en conteneur. Sans
 * conteneur, il se saute : voir `aide/baseJetable.ts`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { baseJetable, baseDisponible, vider, fermer } from "./aide/baseJetable";

/* Les modules testés importent `@/lib/prisma`. On leur fait pointer la base
 * jetable — c'est le seul détournement du fichier, et il est explicite. */
vi.mock("@/lib/prisma", async () => {
  const { baseJetable: base } = await import("./aide/baseJetable");
  return { prisma: base() };
});

const db = baseJetable();
let disponible = false;

beforeAll(async () => {
  disponible = await baseDisponible();
  if (!disponible) {
    console.warn(
      "\n  [integration] conteneur absent sur localhost:55432 — tests sautés.\n" +
        "  Pour les lancer : voir l'en-tête de tests/integration/aide/baseJetable.ts\n",
    );
  }
});

afterAll(fermer);

beforeEach(async () => {
  if (disponible) await vider();
});

/** Déclare un test qui ne tourne que si le conteneur répond. */
const siBase = (nom: string, corps: () => Promise<void>) =>
  it(nom, async () => {
    if (!disponible) return;
    await corps();
  });

async function poserPlat(id: string, nom: string, stock: number | null, prix = 1000) {
  await db.category.upsert({
    where: { slug: "cat-test" },
    create: { slug: "cat-test", label: "Test", script: "latin", position: 1 },
    update: {},
  });
  await db.dish.create({
    data: {
      id,
      name: nom,
      desc: "",
      priceCents: prix,
      cat: "cat-test",
      stock,
      available: true,
    },
  });
}

describe("stock — ce que la base garantit, et nous pas", () => {
  siBase("deux clients ne peuvent pas obtenir le même dernier plat", async () => {
    await poserPlat("d-dernier", "Thiéboudiène", 1);
    const { reserveStock } = await import("@/lib/stock");

    /* Les deux réservations partent ensemble. Le décrément conditionnel
     * (`where: { stock: { gte: qty } }`) doit en faire échouer exactement une. */
    const [a, b] = await Promise.all([
      reserveStock([{ dishId: "d-dernier", name: "Thiéboudiène", qty: 1 }]),
      reserveStock([{ dishId: "d-dernier", name: "Thiéboudiène", qty: 1 }]),
    ]);

    const reussites = [a, b].filter((r) => r.ok).length;
    expect(reussites).toBe(1);

    const plat = await db.dish.findUnique({ where: { id: "d-dernier" } });
    expect(plat?.stock).toBe(0);

    const mouvements = await db.stockMovement.count({ where: { dishId: "d-dernier" } });
    expect(mouvements).toBe(1);
  });

  siBase("une réservation refusée ne prélève rien du tout", async () => {
    /* Le premier plat est servable, le second non. Sans transaction réelle, le
     * premier serait décrémenté puis l'appel échouerait : du stock perdu sans
     * commande en face, et personne pour s'en apercevoir avant l'inventaire. */
    await poserPlat("d-ok", "Yassa", 10);
    await poserPlat("d-rupture", "Mafé", 0);
    const { reserveStock } = await import("@/lib/stock");

    const r = await reserveStock([
      { dishId: "d-ok", name: "Yassa", qty: 2 },
      { dishId: "d-rupture", name: "Mafé", qty: 1 },
    ]);

    expect(r.ok).toBe(false);
    const ok = await db.dish.findUnique({ where: { id: "d-ok" } });
    expect(ok?.stock).toBe(10);
    expect(await db.stockMovement.count()).toBe(0);
  });

  siBase("un plat à stock illimité ne bloque jamais", async () => {
    await poserPlat("d-infini", "Riz blanc", null);
    const { reserveStock } = await import("@/lib/stock");

    const r = await reserveStock([{ dishId: "d-infini", name: "Riz blanc", qty: 99 }]);
    expect(r.ok).toBe(true);
    const plat = await db.dish.findUnique({ where: { id: "d-infini" } });
    expect(plat?.stock).toBeNull();
  });
});

describe("numéros — une suite sans trou ni doublon", () => {
  siBase("vingt factures simultanées reçoivent vingt numéros distincts", async () => {
    const { nextInvoiceNumber } = await import("@/lib/ref");

    const numeros = await Promise.all(Array.from({ length: 20 }, () => nextInvoiceNumber()));

    /* Le double en mémoire rendait vingt fois le même numéro sans que rien ne
     * s'en plaigne. Ici c'est `upsert … increment` qui doit tenir, et la série
     * doit être exactement 1..20 : ni doublon (deux factures au même numéro),
     * ni trou (une facture manquante au contrôle). */
    expect(new Set(numeros).size).toBe(20);
    expect([...numeros].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  siBase("les avoirs tiennent leur propre suite", async () => {
    const { nextInvoiceNumber, nextCreditNoteNumber } = await import("@/lib/ref");

    await nextInvoiceNumber();
    await nextInvoiceNumber();
    const avoir = await nextCreditNoteNumber();

    /* Deux compteurs distincts : mêler les suites rendrait impossible de dire,
     * devant un contrôle, combien de factures ont été émises sur l'exercice. */
    expect(avoir).toBe(1);
    expect(await nextInvoiceNumber()).toBe(3);
  });

  siBase("le numéro d’attente repart à 1 le lendemain", async () => {
    const { nextTicketNumber } = await import("@/lib/ref");

    expect(await nextTicketNumber("2026-10-14")).toBe(1);
    expect(await nextTicketNumber("2026-10-14")).toBe(2);
    expect(await nextTicketNumber("2026-10-15")).toBe(1);
  });
});

describe("index unique — deux commandes ne portent pas le même numéro d’attente", () => {
  siBase("la base refuse le doublon, elle ne l’arbitre pas en silence", async () => {
    const commande = (ref: string, numero: number) => ({
      ref,
      status: "confirmee",
      mode: "sur_place",
      customerName: "Salle",
      customerEmail: "",
      customerPhone: "",
      address: "",
      zip: "",
      city: "",
      subtotalCents: 1000,
      feeCents: 0,
      discountCents: 0,
      totalCents: 1000,
      paymentMethod: "Au comptoir",
      paymentStatus: "en_attente",
      lines: "[]",
      ticketDate: "2026-10-14",
      ticketNumber: numero,
    });

    await db.order.create({ data: commande("A-1", 7) as never });

    /* `Order_ticketDate_ticketNumber_key` existe pour ça : deux clients ne
     * doivent jamais se présenter au comptoir avec le même numéro. */
    await expect(db.order.create({ data: commande("A-2", 7) as never })).rejects.toThrow();

    /* Le lendemain, le même numéro est libre. */
    await expect(
      db.order.create({ data: { ...commande("A-3", 7), ticketDate: "2026-10-15" } as never }),
    ).resolves.toBeTruthy();
  });
});
