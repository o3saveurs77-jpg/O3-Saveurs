/* Prise en charge des courses par les livreurs — règles pures.
 *
 * Le restaurant construisait chaque tournée à la main. En libre-service, les
 * commandes prêtes et sans livreur s'affichent sur les téléphones et le
 * premier qui appuie l'emporte. La gérante garde la main pour réaffecter
 * depuis Livraisons : ce module ne fait qu'ouvrir une seconde voie, il n'en
 * ferme aucune.
 *
 * Deux garde-fous, et ils sont là pour la même raison — un livreur qui prend
 * tout laisse les autres sans course et fait attendre des clients :
 *
 *  · une course déjà prise disparaît des autres écrans ;
 *  · trois courses en cours au maximum.
 */

import type { OrderStatus } from "@/lib/types";

/**
 * Trois : assez pour grouper un secteur, pas assez pour que la dernière
 * arrive froide. Le jour où l'usage dira autre chose, c'est ici que ça change.
 */
export const MAX_COURSES_EN_COURS = 3;

/**
 * Statuts d'une commande qu'un livreur peut prendre.
 *
 * « confirmée » et « en cuisine » seulement : avant, elle n'est pas payée ;
 * après, elle est déjà partie. Prendre une commande en cuisine est voulu — le
 * livreur s'organise pendant qu'elle cuit.
 */
export const CLAIMABLE_STATUSES: readonly OrderStatus[] = ["confirmee", "cuisine"];

/** Une course compte tant qu'elle n'est ni livrée ni annulée. */
export const ONGOING_STATUSES: readonly OrderStatus[] = ["confirmee", "cuisine", "route"];

export interface ClaimableOrder {
  id: string;
  mode: string;
  status: OrderStatus;
  driverId: string | null;
}

/** Cette course est-elle à prendre ? */
export function isClaimable(order: ClaimableOrder): boolean {
  return (
    order.mode === "livraison" &&
    order.driverId === null &&
    CLAIMABLE_STATUSES.includes(order.status)
  );
}

export type ClaimCheck = { ok: true } | { ok: false; error: string };

/**
 * Le livreur peut-il prendre cette course, maintenant ?
 *
 * `ongoing` est le nombre de courses qu'il a déjà en main. Le contrôle est
 * refait côté serveur au moment de l'écriture : deux livreurs qui appuient en
 * même temps ne doivent pas repartir tous les deux avec la même commande.
 */
export function checkClaim(order: ClaimableOrder | null, ongoing: number): ClaimCheck {
  if (!order) return { ok: false, error: "Cette course n'existe plus." };

  if (order.driverId !== null) {
    return { ok: false, error: "Un autre livreur vient de prendre cette course." };
  }
  if (order.mode !== "livraison") {
    return { ok: false, error: "Cette commande est à emporter : le client vient la chercher." };
  }
  if (!CLAIMABLE_STATUSES.includes(order.status)) {
    return {
      ok: false,
      error:
        order.status === "en_attente_paiement"
          ? "Cette commande n'est pas encore payée."
          : "Cette commande n'est plus à prendre.",
    };
  }
  if (ongoing >= MAX_COURSES_EN_COURS) {
    return {
      ok: false,
      error: `Vous avez déjà ${MAX_COURSES_EN_COURS} courses en cours. Terminez-en une avant d'en prendre une autre.`,
    };
  }

  return { ok: true };
}

/** Courses qu'il reste possible de prendre, compte tenu de ce qu'on a en main. */
export function availableFor(orders: ClaimableOrder[], ongoing: number): ClaimableOrder[] {
  if (ongoing >= MAX_COURSES_EN_COURS) return [];
  return orders.filter(isClaimable);
}
