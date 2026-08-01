/* Palette de graphiques du tableau de bord.
 *
 * Dérivée de la charte, puis **validée** (bande de clarté OKLCH, plancher de
 * chroma, séparation sous protanopie/deutéranopie, contraste ≥ 3:1 sur le fond
 * blanc des cartes). Le turquoise et le doré de la charte ont dû être assombris
 * pour passer : `text-teal` et le doré d'origine tombent à 2,4–3,0:1.
 *
 * Deux séries seulement se touchent (CA commandé / CA encaissé) : elles
 * occupent les emplacements 1 et 2, dans cet ordre, et ne changent jamais.
 */
import type { OrderStatus } from "@/lib/types";

export const SERIES = {
  /** emplacement 1 — CA commandé */
  ordered: "#e8732a",
  /** emplacement 2 — CA encaissé */
  collected: "#0d9184",
} as const;

export const AXIS = "#856a50"; // text-ink-2
export const GRID = "#eadfca"; // hairline, une teinte au-dessus du fond

/** Rampe ordinale d'une seule teinte (clair → foncé) pour les étapes du flux. */
export const FLOW_RAMP = ["#f0a06b", "#e8732a", "#c25c17", "#8d3f0d"] as const;

/** Le statut n'est pas une identité de série : c'est un état. Couleurs réservées. */
export const STATUS_COLOR: Record<OrderStatus, string> = {
  en_attente_paiement: "#b98705", // attention — paiement non acquis
  confirmee: FLOW_RAMP[0],
  cuisine: FLOW_RAMP[1],
  route: FLOW_RAMP[2],
  livree: FLOW_RAMP[3],
  annulee: "#a6243a", // critique
};

export const tooltipStyle = {
  borderRadius: 12,
  border: `1px solid ${GRID}`,
  fontSize: 13,
} as const;

/** Axe monétaire : les centimes ne s'affichent pas sur une graduation. */
export const euroTick = (cents: number) => `${Math.round(cents / 100)} €`;
