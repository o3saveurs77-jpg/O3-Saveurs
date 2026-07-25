import { STATUS_LABEL } from "@/lib/types";
import type { OrderStatus } from "@/lib/types";

/**
 * Une couleur par statut — les six clés de `OrderStatus` sont obligatoires, le
 * `Record` complet garantit qu'un nouveau statut ne peut pas être oublié ici.
 *
 * `en_attente_paiement` est volontairement le seul statut **non rempli**, avec
 * un contour en pointillés : c'est le seul qui ne doit pas entrer en cuisine.
 * Rendu comme « Confirmée » (fond doré plein), il faisait préparer des
 * commandes jamais payées.
 */
const COLOR: Record<OrderStatus, string> = {
  en_attente_paiement: "border border-dashed border-brick/60 bg-brick/5 text-brick",
  confirmee: "bg-gold/20 text-[#8a6d00]",
  cuisine: "bg-primary-soft text-primary",
  route: "bg-teal/15 text-teal",
  livree: "bg-[#e9f7f4] text-[#0f6b5e]",
  annulee: "bg-brick/10 text-brick",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${COLOR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
