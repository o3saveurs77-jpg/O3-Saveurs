/* Conversion entre lignes Prisma (SQLite, champs JSON en String) et types du domaine */

import type { Dish, DishOption, Zone } from "./menu";
import type { Order, OrderStatus, OrderMode, MockUser, SavedAddress, CartLine } from "./types";

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ─── Dish ──────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */

export function rowToDish(r: any): Dish {
  return {
    id: r.id,
    cat: r.cat,
    name: r.name,
    desc: r.desc,
    price: r.price ?? null,
    photo: r.photo ?? null,
    badge: r.badge ?? null,
    popular: r.popular,
    available: r.available,
    spice: r.spice,
    tags: parse<string[]>(r.tags, []),
    options: parse<DishOption[]>(r.options, []),
    formules: r.formules ? parse<[string, number][]>(r.formules, []) : undefined,
  };
}

export function dishToRow(d: Partial<Dish>) {
  const row: Record<string, unknown> = {};
  if (d.cat !== undefined) row.cat = d.cat;
  if (d.name !== undefined) row.name = d.name;
  if (d.desc !== undefined) row.desc = d.desc;
  if (d.price !== undefined) row.price = d.price;
  if (d.photo !== undefined) row.photo = d.photo;
  if (d.badge !== undefined) row.badge = d.badge;
  if (d.popular !== undefined) row.popular = d.popular;
  if (d.available !== undefined) row.available = d.available;
  if (d.spice !== undefined) row.spice = d.spice;
  if (d.tags !== undefined) row.tags = JSON.stringify(d.tags);
  if (d.options !== undefined) row.options = JSON.stringify(d.options);
  if (d.formules !== undefined) row.formules = d.formules ? JSON.stringify(d.formules) : null;
  return row;
}

// ─── Zone ──────────────────────────────────────────────

export function rowToZone(r: any): Zone {
  return { fee: r.fee, min: r.minimum, villes: parse<string[]>(r.cities, []) };
}

// ─── Order ─────────────────────────────────────────────

export function rowToOrder(r: any): Order {
  return {
    id: r.id,
    ref: r.ref,
    lines: parse<CartLine[]>(r.lines, []),
    mode: r.mode as OrderMode,
    zoneIdx: r.zoneIdx ?? null,
    slot: r.slot,
    customer: {
      name: r.customerName,
      email: r.customerEmail,
      phone: r.customerPhone,
      address: r.address ?? undefined,
      city: r.city ?? undefined,
      zip: r.zip ?? undefined,
    },
    subtotal: r.subtotal,
    fee: r.fee,
    total: r.total,
    status: r.status as OrderStatus,
    paid: r.paid,
    paymentMethod: r.paymentMethod,
    createdAt: new Date(r.createdAt).getTime(),
    driver: r.driver ?? null,
  };
}

// ─── User ──────────────────────────────────────────────

export function rowToUser(r: any): MockUser {
  return {
    name: r.name,
    email: r.email,
    phone: r.phone,
    addresses: parse<SavedAddress[]>(r.addresses, []),
    favorites: parse<string[]>(r.favorites, []),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
