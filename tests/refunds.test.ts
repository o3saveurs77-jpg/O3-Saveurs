import { describe, it, expect } from "vitest";
import {
  cancelAbility,
  checkRefund,
  formatCreditNoteNumber,
  paymentStatusAfterRefund,
  refundableCents,
} from "@/lib/refunds";
import { ORDER_STATUSES } from "@/lib/types";

/**
 * Ces règles décident de sorties d'argent réelles. Les vérifier autrement que
 * par des tests supposerait de rembourser de vraies commandes pour voir.
 */

const paid = (total: number, refunded = 0) => ({
  paid: true,
  totalCents: total,
  refundedCents: refunded,
});

describe("qui peut annuler, et quand", () => {
  it("laisse le client annuler seul tant que rien n'est engagé", () => {
    expect(cancelAbility("en_attente_paiement").kind).toBe("immediate");
    expect(cancelAbility("confirmee").kind).toBe("immediate");
  });

  it("exige une décision humaine dès que la cuisine a pris la main", () => {
    // Des denrées sont sorties et cuisinées : ce n'est plus un simple geste.
    expect(cancelAbility("cuisine").kind).toBe("request");
    expect(cancelAbility("route").kind).toBe("request");
  });

  it("ferme la porte sur une commande livrée ou déjà annulée", () => {
    const livree = cancelAbility("livree");
    expect(livree.kind).toBe("none");
    if (livree.kind === "none") expect(livree.reason).toContain("livrée");

    const annulee = cancelAbility("annulee");
    expect(annulee.kind).toBe("none");
    if (annulee.kind === "none") expect(annulee.reason).toContain("annulée");
  });

  it("répond pour chaque statut existant", () => {
    // Ajouter un statut sans décider ce qu'il autorise laisserait une commande
    // dans un état où le bouton d'annulation se comporte au hasard.
    for (const s of ORDER_STATUSES) {
      expect(["immediate", "request", "none"], s).toContain(cancelAbility(s).kind);
    }
  });
});

describe("montant remboursable", () => {
  it("est nul sur une commande jamais encaissée", () => {
    // Annuler et rembourser sont deux gestes distincts : proposer de rendre ce
    // qui n'a pas été payé sortirait de l'argent en double.
    expect(refundableCents({ paid: false, totalCents: 2000, refundedCents: 0 })).toBe(0);
  });

  it("vaut le total sur une commande payée intacte", () => {
    expect(refundableCents(paid(2000))).toBe(2000);
  });

  it("déduit ce qui a déjà été rendu", () => {
    expect(refundableCents(paid(2000, 500))).toBe(1500);
  });

  it("ne devient jamais négatif", () => {
    expect(refundableCents(paid(2000, 2500))).toBe(0);
  });
});

describe("validation d'un remboursement", () => {
  it("rembourse tout par défaut", () => {
    const r = checkRefund(paid(2000));
    expect(r).toEqual({ ok: true, amountCents: 2000, full: true });
  });

  it("accepte un montant partiel", () => {
    const r = checkRefund(paid(2000), 500);
    expect(r).toEqual({ ok: true, amountCents: 500, full: false });
  });

  it("reconnaît le solde exact comme un remboursement complet", () => {
    const r = checkRefund(paid(2000, 1500), 500);
    expect(r).toEqual({ ok: true, amountCents: 500, full: true });
  });

  it("refuse une commande non encaissée", () => {
    const r = checkRefund({ paid: false, totalCents: 2000, refundedCents: 0 });
    expect(r.ok).toBe(false);
  });

  it("refuse un second remboursement intégral", () => {
    // Sans cette garde, deux clics sur « Rembourser » rendaient deux fois la
    // somme, et Stripe n'aurait rien eu à y redire sur le premier.
    const r = checkRefund(paid(2000, 2000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("déjà intégralement");
  });

  it("refuse un montant supérieur au restant", () => {
    const r = checkRefund(paid(2000, 1500), 900);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("5.00");
  });

  it("refuse un montant absurde", () => {
    expect(checkRefund(paid(2000), 0).ok).toBe(false);
    expect(checkRefund(paid(2000), -100).ok).toBe(false);
    expect(checkRefund(paid(2000), 12.5).ok).toBe(false);
  });
});

describe("statut de paiement après remboursement", () => {
  it("distingue un remboursement partiel d'un remboursement complet", () => {
    // Les confondre ferait disparaître de la comptabilité la part encaissée.
    expect(paymentStatusAfterRefund(paid(2000), 500)).toBe("rembourse_partiel");
    expect(paymentStatusAfterRefund(paid(2000), 2000)).toBe("rembourse");
  });

  it("bascule en remboursé quand les partiels se complètent", () => {
    expect(paymentStatusAfterRefund(paid(2000, 1500), 500)).toBe("rembourse");
  });
});

describe("numérotation des avoirs", () => {
  it("suit la forme AV-année-six chiffres", () => {
    expect(formatCreditNoteNumber(42, new Date("2026-08-08T10:00:00Z"))).toBe("AV-2026-000042");
  });

  it("affiche un tiret tant qu'aucun avoir n'est émis", () => {
    expect(formatCreditNoteNumber(null)).toBe("—");
  });
});
