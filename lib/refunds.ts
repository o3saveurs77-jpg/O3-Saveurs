/* Annulations et remboursements — règles pures.
 *
 * Tout ce qui décide « peut-on annuler », « combien peut-on encore rendre »
 * vit ici, sans Prisma ni Stripe, pour être vérifiable par des tests plutôt
 * que par des essais sur des vraies commandes et de l'argent réel.
 *
 * Trois principes tiennent l'ensemble :
 *
 * · **Le client n'annule que ce qui n'est pas engagé.** Tant que la commande
 *   n'est pas partie en cuisine, l'annuler ne coûte que le geste. Après, des
 *   denrées sont sorties et cuisinées : le client peut le *demander*, mais
 *   c'est un humain qui tranche.
 *
 * · **Aucun montant ne vient du navigateur.** Comme pour la commande, le
 *   serveur relit le total en base et calcule lui-même ce qui reste
 *   remboursable. Un client ne peut pas se faire rembourser 80 € sur une
 *   commande de 20 €, ni deux fois la même.
 *
 * · **Rembourser produit une pièce.** Une facture émise ne se modifie pas ;
 *   l'avoir est un document distinct, avec sa propre numérotation.
 */

import type { OrderStatus, PaymentStatus } from "@/lib/types";

/**
 * Statuts où le client annule seul, sans passer par personne.
 *
 * `en_attente_paiement` : rien n'a été encaissé ni cuisiné, l'annulation est
 * sans conséquence. `confirmee` : la commande est enregistrée mais la cuisine
 * ne l'a pas prise en charge.
 */
export const SELF_CANCELLABLE: readonly OrderStatus[] = ["en_attente_paiement", "confirmee"];

/** Statuts où une annulation reste concevable, mais sur décision humaine. */
export const REQUESTABLE: readonly OrderStatus[] = ["cuisine", "route"];

export type CancelAbility =
  /** Le client peut annuler lui-même, immédiatement. */
  | { kind: "immediate" }
  /** Trop tard pour annuler seul : il peut déposer une demande. */
  | { kind: "request" }
  /** Ni l'un ni l'autre — commande déjà livrée ou déjà annulée. */
  | { kind: "none"; reason: string };

/** Ce que le client a le droit de faire, à cet instant, sur cette commande. */
export function cancelAbility(status: OrderStatus): CancelAbility {
  if (SELF_CANCELLABLE.includes(status)) return { kind: "immediate" };
  if (REQUESTABLE.includes(status)) return { kind: "request" };
  if (status === "livree") {
    return {
      kind: "none",
      reason: "Cette commande a été livrée. Ouvrez une réclamation si quelque chose ne va pas.",
    };
  }
  return { kind: "none", reason: "Cette commande est déjà annulée." };
}

export interface RefundableOrder {
  paid: boolean;
  totalCents: number;
  refundedCents: number;
}

/**
 * Ce qu'il reste possible de rendre, en centimes.
 *
 * Zéro pour une commande jamais encaissée : « annuler » et « rembourser » sont
 * deux gestes distincts, et proposer de rembourser ce qui n'a pas été payé est
 * le meilleur moyen de sortir de l'argent en double.
 */
export function refundableCents(order: RefundableOrder): number {
  if (!order.paid) return 0;
  return Math.max(0, order.totalCents - order.refundedCents);
}

export type RefundCheck =
  | { ok: true; amountCents: number; full: boolean }
  | { ok: false; error: string };

/**
 * Valide une demande de remboursement.
 *
 * `amountCents` absent signifie « tout ce qui reste » : c'est le cas courant,
 * et le laisser implicite évite au back-office de recopier un montant qu'il
 * calculerait de tête.
 */
export function checkRefund(order: RefundableOrder, amountCents?: number | null): RefundCheck {
  const restant = refundableCents(order);

  if (!order.paid) return { ok: false, error: "Cette commande n'a jamais été encaissée." };
  if (restant === 0) return { ok: false, error: "Cette commande est déjà intégralement remboursée." };

  if (amountCents === undefined || amountCents === null) {
    return { ok: true, amountCents: restant, full: true };
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Le montant à rembourser doit être un nombre de centimes positif." };
  }
  if (amountCents > restant) {
    return {
      ok: false,
      error: `Montant trop élevé : il ne reste que ${(restant / 100).toFixed(2)} € remboursables.`,
    };
  }

  return { ok: true, amountCents, full: amountCents === restant };
}

/**
 * Statut de paiement après un remboursement.
 *
 * Un remboursement partiel n'est pas un remboursement : confondre les deux
 * ferait disparaître de la comptabilité la part réellement encaissée.
 */
export function paymentStatusAfterRefund(
  order: RefundableOrder,
  amountCents: number,
): PaymentStatus {
  const total = order.refundedCents + amountCents;
  return total >= order.totalCents ? "rembourse" : "rembourse_partiel";
}

/** « AV-2026-000042 » — même forme que les factures, préfixe distinct. */
export function formatCreditNoteNumber(n: number | null, at: Date = new Date()): string {
  if (n === null) return "—";
  return `AV-${at.getFullYear()}-${String(n).padStart(6, "0")}`;
}
