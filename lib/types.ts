/* Modèle de domaine partagé (panier, commandes, clients) */

/** Ligne de panier (source de vérité du type, réexportée par CartContext) */
export interface CartLine {
  key: string;
  dishId: string;
  name: string;
  photo: string | null;
  unitPrice: number;
  qty: number;
  /** options choisies : { "Sauce": "Piment maison", ... } */
  opts: Record<string, string>;
  formule: string | null;
  note: string;
}

export type OrderMode = "livraison" | "emporter";

/** Statuts de suivi (spec §6) */
export type OrderStatus = "confirmee" | "cuisine" | "route" | "livree" | "annulee";

export const STATUS_FLOW: OrderStatus[] = ["confirmee", "cuisine", "route", "livree"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  confirmee: "Confirmée",
  cuisine: "En cuisine",
  route: "En route",
  livree: "Livrée",
  annulee: "Annulée",
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
  ref: string; // référence courte affichée (#A1B2)
  lines: CartLine[];
  mode: OrderMode;
  zoneIdx: number | null;
  /** "asap" ou heure "19:30" */
  slot: "asap" | string;
  customer: OrderCustomer;
  subtotal: number;
  fee: number;
  total: number;
  status: OrderStatus;
  paid: boolean;
  paymentMethod: string;
  createdAt: number; // timestamp ms
  driver?: string | null;
}

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  zip: string;
  city: string;
}

export interface MockUser {
  name: string;
  email: string;
  phone: string;
  addresses: SavedAddress[];
  favorites: string[]; // dishIds
  role?: string; // CLIENT | ADMIN (renseigné par /api/auth/me)
}
