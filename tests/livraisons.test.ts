import { describe, it, expect } from "vitest";
import {
  cashDueCents,
  peutEncaisser,
  reordered,
  stopIds,
} from "@/components/admin/LivraisonsAdmin";
import { PAYMENT_AT_COUNTER, type OrderStatus } from "@/lib/types";

/**
 * Règles de l'écran Livraisons. Deux d'entre elles touchent à de l'argent et à
 * des pièces comptables : marquer « encaissé » attribue un numéro de facture
 * définitif et envoie la facture au client, et la feuille de route imprimée
 * est ce que le livreur réclame au client sur le palier.
 */

const arret = (champs: {
  id?: string;
  paid?: boolean;
  paymentMethod?: string;
  totalCents?: number;
  status?: OrderStatus;
}) => ({
  id: champs.id ?? "o1",
  paid: champs.paid ?? false,
  paymentMethod: champs.paymentMethod ?? "Espèces à la livraison",
  totalCents: champs.totalCents ?? 2450,
  status: champs.status ?? ("route" as OrderStatus),
});

describe("argent à recevoir sur un arrêt", () => {
  it("compte le montant quand il se règle en main propre", () => {
    expect(cashDueCents(arret({}))).toBe(2450);
    expect(cashDueCents(arret({ paymentMethod: PAYMENT_AT_COUNTER }))).toBe(2450);
  });

  it("ne compte rien sur un paiement par carte non abouti", () => {
    // Le livreur n'a pas de terminal : « non payée » n'est pas « à encaisser ».
    expect(cashDueCents(arret({ paymentMethod: "Carte bancaire" }))).toBe(0);
    expect(cashDueCents(arret({ paymentMethod: "Apple Pay" }))).toBe(0);
  });

  it("ne compte rien sur une commande déjà payée", () => {
    expect(cashDueCents(arret({ paid: true }))).toBe(0);
    expect(cashDueCents(arret({ paid: true, paymentMethod: PAYMENT_AT_COUNTER }))).toBe(0);
  });
});

describe("qui peut être marqué « encaissé »", () => {
  it("accepte l'argent reçu en main propre", () => {
    expect(peutEncaisser(arret({}))).toBe(true);
    expect(peutEncaisser(arret({ paymentMethod: PAYMENT_AT_COUNTER }))).toBe(true);
  });

  it("refuse une commande par carte", () => {
    /* Le défaut corrigé : un clic attribuait un numéro de facture définitif et
     * envoyait la facture pour de l'argent jamais reçu. Un numéro de facture
     * ne se reprend pas. */
    expect(peutEncaisser(arret({ paymentMethod: "Carte bancaire" }))).toBe(false);
  });

  it("refuse une commande déjà payée ou annulée", () => {
    expect(peutEncaisser(arret({ paid: true }))).toBe(false);
    expect(peutEncaisser(arret({ status: "annulee" }))).toBe(false);
  });
});

describe("composition envoyée au serveur", () => {
  it("conserve l'ordre d'affichage", () => {
    const arrets = [arret({ id: "a" }), arret({ id: "b" }), arret({ id: "c" })];
    expect(stopIds(arrets)).toEqual(["a", "b", "c"]);
  });

  it("laisse les arrêts annulés de côté", () => {
    /* `PATCH /api/delivery-runs/[id]` refuse une commande annulée : renvoyer la
     * liste telle qu'affichée gelait la tournée entière. */
    const arrets = [
      arret({ id: "a" }),
      arret({ id: "b", status: "annulee" }),
      arret({ id: "c" }),
    ];
    expect(stopIds(arrets)).toEqual(["a", "c"]);
  });
});

describe("déplacement d'un arrêt d'un cran", () => {
  const ids = ["a", "b", "c"];

  it("échange avec le précédent et avec le suivant", () => {
    expect(reordered(ids, 1, -1)).toEqual(["b", "a", "c"]);
    expect(reordered(ids, 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("refuse de sortir de la liste", () => {
    expect(reordered(ids, 0, -1)).toBeNull();
    expect(reordered(ids, 2, 1)).toBeNull();
    expect(reordered(ids, 7, -1)).toBeNull();
    expect(reordered([], 0, 1)).toBeNull();
  });

  it("ne modifie pas la liste d'origine", () => {
    // L'affichage optimiste repose dessus : React ne repeint que sur un
    // nouveau tableau, et l'ancien doit rester intact pour le rechargement.
    reordered(ids, 0, 1);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});
