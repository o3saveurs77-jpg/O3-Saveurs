/* Modèle de domaine partagé (panier, commandes, clients).
 *
 * Tous les montants sont des **centimes entiers** (`…Cents`). Voir `lib/money.ts`.
 */

/**
 * Plat retenu dans un créneau de formule.
 * `supplementCents` est le supplément **déjà inclus** dans le prix unitaire de
 * la ligne : il n'est là que pour l'expliquer au client et à la cuisine.
 */
export interface FormulaPick {
  slotId: string;
  slotLabel: string;
  dishId: string;
  dishName: string;
  supplementCents: number;
  opts: Record<string, string>;
}

/** Ligne de panier, côté navigateur. */
export interface CartLine {
  key: string;
  /** vide sur une ligne formule, qui porte `formulaId` à la place */
  dishId: string;
  /** renseigné sur une ligne formule */
  formulaId?: string | null;
  /** plats retenus dans chaque créneau, pour une ligne formule */
  picks?: FormulaPick[] | null;
  name: string;
  photo: string | null;
  /**
   * Prix unitaire d'affichage. **Indicatif seulement** : le serveur le
   * recalcule depuis la base à la commande et ignore cette valeur.
   */
  unitPriceCents: number;
  qty: number;
  /** options choisies : { "Sauce": "Piment maison", … } */
  opts: Record<string, string>;
  formule: string | null;
  note: string;
}

/** Ligne de commande figée par le serveur, telle qu'archivée dans `Order.lines`. */
export interface OrderLine {
  /** vide sur une ligne formule */
  dishId: string;
  /** renseigné sur une ligne formule */
  formulaId?: string | null;
  /**
   * Composition retenue, pour une ligne formule. C'est elle qui permet à la
   * cuisine de savoir quoi préparer et au stock de savoir quoi décrémenter —
   * `opts` n'en est que la version lisible.
   */
  picks?: FormulaPick[] | null;
  name: string;
  photo: string | null;
  /** prix unitaire recalculé côté serveur (plat + options + formule) */
  unitPriceCents: number;
  qty: number;
  /** unitPriceCents × qty, figé pour que la facture ne bouge jamais */
  lineTotalCents: number;
  opts: Record<string, string>;
  formule: string | null;
  note: string;
}

/** Vrai si la ligne est une formule composée et non un plat à la carte. */
export const isFormulaLine = <T extends { formulaId?: string | null }>(l: T): boolean =>
  Boolean(l.formulaId);

export type OrderMode = "livraison" | "emporter";

/**
 * Statuts de suivi.
 * `en_attente_paiement` est distinct de `confirmee` : une commande n'entre en
 * cuisine qu'une fois le paiement confirmé par le webhook Stripe.
 */
export type OrderStatus =
  | "en_attente_paiement"
  | "confirmee"
  | "cuisine"
  | "route"
  | "livree"
  | "annulee";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "en_attente_paiement",
  "confirmee",
  "cuisine",
  "route",
  "livree",
  "annulee",
];

/**
 * Progression normale affichée au client (hors annulation et attente).
 * `as const` volontaire : le type des éléments se restreint à ces quatre
 * statuts, ce qui permet aux composants de suivi d'exiger une icône pour
 * chacun — et seulement pour ceux-là.
 */
export const STATUS_FLOW = ["confirmee", "cuisine", "route", "livree"] as const;

export type FlowStatus = (typeof STATUS_FLOW)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  en_attente_paiement: "En attente de paiement",
  confirmee: "Confirmée",
  cuisine: "En cuisine",
  route: "En route",
  livree: "Livrée",
  annulee: "Annulée",
};

/** Transitions autorisées depuis l'administration. */
export const STATUS_NEXT: Record<OrderStatus, OrderStatus[]> = {
  en_attente_paiement: ["confirmee", "annulee"],
  confirmee: ["cuisine", "annulee"],
  cuisine: ["route", "livree", "annulee"],
  route: ["livree", "annulee"],
  livree: [],
  annulee: [],
};

export type PaymentStatus = "en_attente" | "paye" | "echec" | "rembourse" | "expire";

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "en_attente",
  "paye",
  "echec",
  "rembourse",
  "expire",
];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  en_attente: "En attente",
  paye: "Payé",
  echec: "Échec",
  rembourse: "Remboursé",
  expire: "Expiré",
};

export interface OrderCustomer {
  name: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  zip?: string;
}

export interface Order {
  id: string;
  ref: string;
  invoiceNumber: number | null;
  lines: OrderLine[];
  mode: OrderMode;
  zoneIdx: number | null;
  /** "asap" ou heure "19:30" */
  slot: "asap" | string;
  customer: OrderCustomer;
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  totalCents: number;
  vatRateBp: number;
  promoCode: string | null;
  status: OrderStatus;
  paid: boolean;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  createdAt: number; // timestamp ms
  driverId: string | null;
  driverName: string | null;
  deliveryRunId: string | null;
  runPosition: number | null;
  /** horodatage des étapes, en ms (null si l'étape n'a pas eu lieu) */
  timeline: {
    confirmedAt: number | null;
    cookingAt: number | null;
    routeAt: number | null;
    deliveredAt: number | null;
    canceledAt: number | null;
  };
}

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  zip: string;
  city: string;
}

export interface AppUser {
  name: string;
  email: string;
  phone: string;
  addresses: SavedAddress[];
  favorites: string[]; // dishIds
  role?: string; // CLIENT | ADMIN (renseigné par /api/auth/me)
}

/** Conservé le temps que les écrans historiques migrent vers `AppUser`. */
export type MockUser = AppUser;

// ─── Allergènes (règlement INCO 1169/2011, annexe II) ──────────

export const ALLERGENS = [
  "gluten",
  "crustaces",
  "oeufs",
  "poissons",
  "arachides",
  "soja",
  "lait",
  "fruits_a_coque",
  "celeri",
  "moutarde",
  "sesame",
  "sulfites",
  "lupin",
  "mollusques",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  gluten: "Gluten",
  crustaces: "Crustacés",
  oeufs: "Œufs",
  poissons: "Poissons",
  arachides: "Arachides",
  soja: "Soja",
  lait: "Lait",
  fruits_a_coque: "Fruits à coque",
  celeri: "Céleri",
  moutarde: "Moutarde",
  sesame: "Sésame",
  sulfites: "Sulfites",
  lupin: "Lupin",
  mollusques: "Mollusques",
};

// ─── Promotions ────────────────────────────────────────────────

export type PromotionKind = "percent" | "amount" | "free_delivery";

export const PROMOTION_KINDS: readonly PromotionKind[] = ["percent", "amount", "free_delivery"];

export const PROMOTION_KIND_LABEL: Record<PromotionKind, string> = {
  percent: "Pourcentage",
  amount: "Montant fixe",
  free_delivery: "Livraison offerte",
};

// ─── Stocks ────────────────────────────────────────────────────

export type StockReason = "vente" | "reappro" | "correction" | "perte" | "inventaire";

export const STOCK_REASONS: readonly StockReason[] = [
  "vente",
  "reappro",
  "correction",
  "perte",
  "inventaire",
];

export const STOCK_REASON_LABEL: Record<StockReason, string> = {
  vente: "Vente",
  reappro: "Réapprovisionnement",
  correction: "Correction",
  perte: "Perte",
  inventaire: "Inventaire",
};

// ─── Achats & budget ───────────────────────────────────────────

export type BudgetCategory =
  | "viandes"
  | "poissons"
  | "legumes"
  | "feculents"
  | "laitiers"
  | "epicerie"
  | "pain"
  | "boissons"
  | "emballages";

/** Ordre d'affichage : les postes alimentaires d'abord, les emballages en dernier. */
export const BUDGET_CATEGORIES: readonly BudgetCategory[] = [
  "viandes",
  "poissons",
  "legumes",
  "feculents",
  "laitiers",
  "epicerie",
  "pain",
  "boissons",
  "emballages",
];

export const BUDGET_CATEGORY_LABEL: Record<BudgetCategory, string> = {
  viandes: "Viandes & volailles",
  poissons: "Poissons",
  legumes: "Légumes & fruits",
  feculents: "Riz, semoule & féculents",
  laitiers: "Produits laitiers & œufs",
  epicerie: "Épicerie & secs",
  pain: "Pain & pâte à pastels",
  boissons: "Boissons & fruits à jus",
  emballages: "Emballages & à emporter",
};

export interface BudgetItemView {
  id: string;
  category: BudgetCategory;
  label: string;
  qty: number;
  unit: string;
  unitPriceCents: number;
  /** qty × unitPriceCents, arrondi — jamais stocké côté serveur */
  totalCents: number;
  packaging: boolean;
  position: number;
}

// ─── Service après-vente ───────────────────────────────────────

export type TicketStatus = "ouvert" | "en_cours" | "resolu" | "ferme";

export const TICKET_STATUSES: readonly TicketStatus[] = ["ouvert", "en_cours", "resolu", "ferme"];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  ouvert: "Ouvert",
  en_cours: "En cours",
  resolu: "Résolu",
  ferme: "Fermé",
};

export type TicketCategory =
  | "retard"
  | "manquant"
  | "qualite"
  | "erreur_commande"
  | "remboursement"
  | "autre";

export const TICKET_CATEGORIES: readonly TicketCategory[] = [
  "retard",
  "manquant",
  "qualite",
  "erreur_commande",
  "remboursement",
  "autre",
];

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  retard: "Retard de livraison",
  manquant: "Article manquant",
  qualite: "Qualité du plat",
  erreur_commande: "Erreur de commande",
  remboursement: "Demande de remboursement",
  autre: "Autre",
};

export interface TicketMessageView {
  id: string;
  author: "CLIENT" | "ADMIN";
  body: string;
  createdAt: number;
}

export interface SupportTicketView {
  id: string;
  orderId: string | null;
  orderRef: string | null;
  customerName: string;
  customerEmail: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: "basse" | "normale" | "haute";
  refundCents: number | null;
  gestureCode: string | null;
  createdAt: number;
  updatedAt: number;
  messages: TicketMessageView[];
}

// ─── Formulaire de contact ──────────────────────────────────────

export interface ContactMessageView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  handled: boolean;
  createdAt: number;
}

// ─── Traiteur ────────────────────────────────────────────────

export type CateringEventType = "bureau" | "mariage" | "autre";

export const CATERING_EVENT_TYPES: readonly CateringEventType[] = ["bureau", "mariage", "autre"];

export const CATERING_EVENT_TYPE_LABEL: Record<CateringEventType, string> = {
  bureau: "Réunion / séminaire de bureau",
  mariage: "Mariage & réception",
  autre: "Anniversaire, baptême ou autre réception",
};

export type CateringStatus = "nouveau" | "contacte" | "devis_envoye" | "confirme" | "decline";

export const CATERING_STATUSES: readonly CateringStatus[] = [
  "nouveau",
  "contacte",
  "devis_envoye",
  "confirme",
  "decline",
];

export const CATERING_STATUS_LABEL: Record<CateringStatus, string> = {
  nouveau: "Nouvelle demande",
  contacte: "Client recontacté",
  devis_envoye: "Devis envoyé",
  confirme: "Confirmé",
  decline: "Déclinée",
};

export interface CateringInquiryView {
  id: string;
  eventType: string;
  eventDate: number | null;
  guestCount: number | null;
  location: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  message: string;
  status: CateringStatus;
  note: string;
  createdAt: number;
  updatedAt: number;
}
