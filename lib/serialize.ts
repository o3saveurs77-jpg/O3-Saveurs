/* Conversion entre lignes Prisma (PostgreSQL, colonnes JSON en TEXT) et types
 * du domaine.
 *
 * Les colonnes JSON sont un héritage SQLite : Postgres offre `jsonb`, qui
 * valide la structure à l'écriture. La migration est prévue au lot 9 ; en
 * attendant, `parse()` fournit un repli et ne laisse jamais une donnée
 * corrompue faire tomber une page.
 *
 * Les types de lignes viennent de `@prisma/client` : plus de `any` à cette
 * frontière, donc le compilateur vérifie réellement ce que le front consomme.
 */

import type {
  Dish as DishRow,
  Zone as ZoneRow,
  Order as OrderRow,
  User as UserRow,
  DailySpecial as DailySpecialRow,
  Promotion as PromotionRow,
  BudgetItem as BudgetItemRow,
  SupportTicket as TicketRow,
  TicketMessage as TicketMessageRow,
  ContactMessage as ContactMessageRow,
  CateringInquiry as CateringInquiryRow,
} from "@prisma/client";

import type { Dish, DishOption, Zone } from "./menu";
import type {
  Allergen,
  Order,
  OrderLine,
  OrderMode,
  OrderStatus,
  PaymentStatus,
  PromotionKind,
  BudgetCategory,
  BudgetItemView,
  AppUser,
  SavedAddress,
  SupportTicketView,
  TicketCategory,
  TicketMessageView,
  TicketStatus,
  ContactMessageView,
  CateringInquiryView,
  CateringStatus,
} from "./types";
import { ALLERGENS } from "./types";

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ─── Dish ──────────────────────────────────────────────

/** Ne garde que les allergènes de la liste réglementaire. */
function parseAllergens(raw: string | null | undefined): Allergen[] {
  const list = parse<string[]>(raw, []);
  return list.filter((a): a is Allergen => (ALLERGENS as readonly string[]).includes(a));
}

export function rowToDish(r: DishRow): Dish {
  return {
    id: r.id,
    cat: r.cat,
    name: r.name,
    desc: r.desc,
    priceCents: r.priceCents,
    photo: r.photo,
    badge: r.badge as Dish["badge"],
    popular: r.popular,
    available: r.available,
    spice: r.spice,
    tags: parse<string[]>(r.tags, []),
    options: parse<DishOption[]>(r.options, []),
    formules: r.formules ? parse<[string, number][]>(r.formules, []) : undefined,
    allergens: parseAllergens(r.allergens),
    stock: r.stock,
    stockAlert: r.stockAlert,
    costCents: r.costCents,
    position: r.position,
    leadTimeHours: r.leadTimeHours,
    vatRateBp: r.vatRateBp,
  };
}

/** Liste blanche des champs modifiables d'un plat (évite tout mass assignment). */
export function dishToRow(d: Partial<Dish>) {
  const row: Record<string, unknown> = {};
  if (d.cat !== undefined) row.cat = d.cat;
  if (d.name !== undefined) row.name = d.name;
  if (d.desc !== undefined) row.desc = d.desc;
  if (d.priceCents !== undefined) row.priceCents = d.priceCents;
  if (d.photo !== undefined) row.photo = d.photo;
  if (d.badge !== undefined) row.badge = d.badge;
  if (d.popular !== undefined) row.popular = d.popular;
  if (d.available !== undefined) row.available = d.available;
  if (d.spice !== undefined) row.spice = d.spice;
  if (d.tags !== undefined) row.tags = JSON.stringify(d.tags);
  if (d.options !== undefined) row.options = JSON.stringify(d.options);
  if (d.formules !== undefined) row.formules = d.formules ? JSON.stringify(d.formules) : null;
  if (d.allergens !== undefined) row.allergens = JSON.stringify(d.allergens);
  if (d.stock !== undefined) row.stock = d.stock;
  if (d.stockAlert !== undefined) row.stockAlert = d.stockAlert;
  if (d.costCents !== undefined) row.costCents = d.costCents;
  if (d.position !== undefined) row.position = d.position;
  if (d.leadTimeHours !== undefined) row.leadTimeHours = d.leadTimeHours;
  if (d.vatRateBp !== undefined) row.vatRateBp = d.vatRateBp;
  return row;
}

// ─── Zone ──────────────────────────────────────────────

export function rowToZone(r: ZoneRow): Zone {
  return {
    idx: r.idx,
    feeCents: r.feeCents,
    minimumCents: r.minimumCents,
    villes: parse<string[]>(r.cities, []),
    zips: parse<string[]>(r.zips, []),
  };
}

// ─── Order ─────────────────────────────────────────────

const ms = (d: Date | null) => (d ? d.getTime() : null);

/** `driverName` vient de la relation quand elle est incluse dans la requête. */
export function rowToOrder(r: OrderRow, driverName: string | null = null): Order {
  return {
    id: r.id,
    ref: r.ref,
    invoiceNumber: r.invoiceNumber,
    lines: parse<OrderLine[]>(r.lines, []),
    mode: r.mode as OrderMode,
    zoneIdx: r.zoneIdx,
    slot: r.slot,
    preorder: r.preorder,
    scheduledFor: ms(r.scheduledFor),
    refusalReason: r.refusalReason,
    customer: {
      name: r.customerName,
      email: r.customerEmail,
      phone: r.customerPhone,
      address: r.address ?? undefined,
      city: r.city ?? undefined,
      zip: r.zip ?? undefined,
    },
    subtotalCents: r.subtotalCents,
    discountCents: r.discountCents,
    feeCents: r.feeCents,
    totalCents: r.totalCents,
    vatRateBp: r.vatRateBp,
    promoCode: r.promoCode,
    status: r.status as OrderStatus,
    paid: r.paid,
    paymentStatus: r.paymentStatus as PaymentStatus,
    paymentMethod: r.paymentMethod,
    refundedCents: r.refundedCents,
    creditNoteNumber: r.creditNoteNumber,
    refundedAt: ms(r.refundedAt),
    refundReason: r.refundReason,
    cancelRequestedAt: ms(r.cancelRequestedAt),
    cancelReason: r.cancelReason,
    createdAt: r.createdAt.getTime(),
    driverId: r.driverId,
    driverName,
    deliveryRunId: r.deliveryRunId,
    runPosition: r.runPosition,
    timeline: {
      confirmedAt: ms(r.confirmedAt),
      cookingAt: ms(r.cookingAt),
      routeAt: ms(r.routeAt),
      deliveredAt: ms(r.deliveredAt),
      canceledAt: ms(r.canceledAt),
    },
  };
}

/** Variante pour les requêtes qui incluent la relation livreur. */
export function rowToOrderWithDriver(r: OrderRow & { driver?: { name: string } | null }): Order {
  return rowToOrder(r, r.driver?.name ?? null);
}

// ─── User ──────────────────────────────────────────────

export function rowToUser(r: UserRow): AppUser {
  return {
    name: r.name,
    email: r.email,
    phone: r.phone,
    addresses: parse<SavedAddress[]>(r.addresses, []),
    favorites: parse<string[]>(r.favorites, []),
  };
}

// ─── Mise en avant ─────────────────────────────────────

export interface DailySpecialView {
  id: string;
  dishId: string | null;
  name: string;
  priceCents: number | null;
  weekday: number | null;
  date: number | null;
  active: boolean;
  position: number;
}

export function rowToDailySpecial(r: DailySpecialRow): DailySpecialView {
  return {
    id: r.id,
    dishId: r.dishId,
    name: r.name,
    priceCents: r.priceCents,
    weekday: r.weekday,
    date: ms(r.date),
    active: r.active,
    position: r.position,
  };
}

// ─── Promotion ─────────────────────────────────────────

export interface PromotionView {
  id: string;
  code: string | null;
  label: string;
  kind: PromotionKind;
  value: number;
  minSubtotalCents: number;
  startsAt: number | null;
  endsAt: number | null;
  maxUses: number | null;
  usedCount: number;
  oncePerCustomer: boolean;
  weekday: number | null;
  auto: boolean;
  active: boolean;
}

export function rowToPromotion(r: PromotionRow): PromotionView {
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    kind: r.kind as PromotionKind,
    value: r.value,
    minSubtotalCents: r.minSubtotalCents,
    startsAt: ms(r.startsAt),
    endsAt: ms(r.endsAt),
    maxUses: r.maxUses,
    usedCount: r.usedCount,
    oncePerCustomer: r.oncePerCustomer,
    weekday: r.weekday,
    auto: r.auto,
    active: r.active,
  };
}

// ─── Achats & budget ────────────────────────────────────

export function rowToBudgetItem(r: BudgetItemRow): BudgetItemView {
  return {
    id: r.id,
    category: r.category as BudgetCategory,
    label: r.label,
    qty: r.qty,
    unit: r.unit,
    unitPriceCents: r.unitPriceCents,
    totalCents: Math.round(r.qty * r.unitPriceCents),
    packaging: r.packaging,
    position: r.position,
  };
}

// ─── Service après-vente ───────────────────────────────

export function rowToTicketMessage(r: TicketMessageRow): TicketMessageView {
  return {
    id: r.id,
    author: r.author === "ADMIN" ? "ADMIN" : "CLIENT",
    body: r.body,
    createdAt: r.createdAt.getTime(),
  };
}

export function rowToTicket(
  r: TicketRow & { messages?: TicketMessageRow[]; order?: { ref: string } | null },
): SupportTicketView {
  return {
    id: r.id,
    orderId: r.orderId,
    orderRef: r.order?.ref ?? null,
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    subject: r.subject,
    category: r.category as TicketCategory,
    status: r.status as TicketStatus,
    priority: r.priority as SupportTicketView["priority"],
    refundCents: r.refundCents,
    gestureCode: r.gestureCode,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
    messages: (r.messages ?? []).map(rowToTicketMessage),
  };
}

export function rowToContactMessage(r: ContactMessageRow): ContactMessageView {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    subject: r.subject,
    message: r.message,
    handled: r.handled,
    createdAt: r.createdAt.getTime(),
  };
}

export function rowToCateringInquiry(r: CateringInquiryRow): CateringInquiryView {
  return {
    id: r.id,
    eventType: r.eventType,
    eventDate: r.eventDate ? r.eventDate.getTime() : null,
    guestCount: r.guestCount,
    location: r.location,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail,
    message: r.message,
    status: r.status as CateringStatus,
    note: r.note,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  };
}
