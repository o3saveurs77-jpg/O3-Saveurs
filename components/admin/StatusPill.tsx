import { STATUS_LABEL } from "@/lib/types";
import type { OrderStatus } from "@/lib/types";

/**
 * Une couleur par statut — toutes les clés de `OrderStatus` sont obligatoires,
 * le `Record` complet garantit qu'un nouveau statut ne peut pas être oublié.
 *
 * Les deux statuts d'attente sont volontairement les seuls **non remplis**,
 * avec un contour en pointillés : ce sont les seuls qui ne doivent pas entrer
 * en cuisine. Rendus comme « Confirmée » (fond doré plein), ils faisaient
 * préparer des commandes jamais payées — ou jamais acceptées.
 */
const COLOR: Record<OrderStatus, string> = {
  en_attente_paiement: "border border-dashed border-brick/60 bg-brick/5 text-brick",
  en_attente_validation: "border border-dashed border-[#8a6d00]/60 bg-gold/10 text-[#8a6d00]",
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
