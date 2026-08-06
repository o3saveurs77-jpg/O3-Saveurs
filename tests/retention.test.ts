/* Tests de `lib/retention.ts`.
 *
 * Le module est volontairement composé de fonctions pures : la route
 * `app/api/cron/retention` ne fait que traduire ces seuils en requêtes Prisma.
 * C'est donc ici que se joue la conformité — un seuil faux efface des données
 * encore obligatoires, ou en conserve au-delà de ce que la politique annonce,
 * et les deux sont des manquements.
 *
 * Le cas qui compte vraiment : une commande facturée doit survivre à trois ans
 * (obligation comptable de dix ans, art. L123-22 du code de commerce) alors
 * qu'une commande abandonnée au même âge doit disparaître.
 */

import { describe, it, expect } from "vitest";
import { ANONYMIZED_ORDER, RETENTION_DAYS, cutoff, isAnonymized, retentionCutoffs } from "@/lib/retention";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("cutoff", () => {
  it("recule exactement du nombre de jours demandé", () => {
    expect(cutoff(NOW, 1).toISOString()).toBe("2026-08-05T12:00:00.000Z");
    expect(cutoff(NOW, 0).getTime()).toBe(NOW.getTime());
  });

  it("reste monotone sur une année bissextile", () => {
    // 2028 est bissextile : un calcul par `setFullYear` donnerait un seuil
    // décalé selon l'année de départ. Ici le pas est constant.
    const a = cutoff(new Date("2028-03-01T00:00:00.000Z"), 365);
    const b = cutoff(new Date("2027-03-01T00:00:00.000Z"), 365);
    expect(a.getTime() - b.getTime()).toBe(366 * DAY_MS);
  });

  it("ne modifie pas la date reçue", () => {
    const t = NOW.getTime();
    cutoff(NOW, 1000);
    expect(NOW.getTime()).toBe(t);
  });
});

describe("retentionCutoffs", () => {
  const c = retentionCutoffs(NOW);

  it("produit un seuil pour chaque durée déclarée", () => {
    expect(Object.keys(c).sort()).toEqual(Object.keys(RETENTION_DAYS).sort());
  });

  it("place le seuil comptable bien avant le seuil de relation client", () => {
    // Dix ans contre trois : le seuil des commandes facturées doit être le
    // plus ancien de tous, sinon on efface une facture encore exigible.
    expect(c.invoicedOrder.getTime()).toBeLessThan(c.order.getTime());
    const oldest = Math.min(...Object.values(c).map((d) => d.getTime()));
    expect(c.invoicedOrder.getTime()).toBe(oldest);
  });

  it("purge les opt-in non confirmés bien plus tôt que les désinscrits", () => {
    expect(c.unconfirmedSubscriber.getTime()).toBeGreaterThan(c.unsubscribedSubscriber.getTime());
  });

  it("traite une commande facturée et une commande abandonnée du même âge différemment", () => {
    const troisAnsEtDemi = new Date(NOW.getTime() - 3.5 * 365 * DAY_MS);
    // Abandonnée : au-delà du seuil, elle doit être anonymisée.
    expect(troisAnsEtDemi.getTime()).toBeLessThan(c.order.getTime());
    // Facturée : le même âge est encore dans l'obligation comptable.
    expect(troisAnsEtDemi.getTime()).toBeGreaterThan(c.invoicedOrder.getTime());
  });
});

describe("anonymisation", () => {
  it("vide l'identité mais garde la commune et le code postal", () => {
    expect(ANONYMIZED_ORDER.customerEmail).toBe("");
    expect(ANONYMIZED_ORDER.customerPhone).toBe("");
    expect(ANONYMIZED_ORDER.address).toBeNull();
    // `city` et `zip` ne sont pas réécrits : ils portent les statistiques par
    // zone et n'identifient personne seuls.
    expect(ANONYMIZED_ORDER).not.toHaveProperty("city");
    expect(ANONYMIZED_ORDER).not.toHaveProperty("zip");
  });

  it("reconnaît une commande déjà anonymisée pour ne pas la retraiter", () => {
    expect(isAnonymized({ customerEmail: "" })).toBe(true);
    expect(isAnonymized({ customerEmail: "sophie@example.com" })).toBe(false);
  });

  it("marque comme anonymisé le résultat de sa propre substitution", () => {
    const order = { customerEmail: "sophie@example.com", customerName: "Sophie" };
    expect(isAnonymized({ ...order, ...ANONYMIZED_ORDER })).toBe(true);
  });
});
