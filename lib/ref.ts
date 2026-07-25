/* Références de commande et numérotation de facture.
 *
 * Deux besoins distincts, longtemps confondus :
 *
 *  · La **référence de commande** est courte et lisible, annoncée au client et
 *    au livreur. Elle était tirée sur 4 caractères dans un alphabet de 31, soit
 *    923 521 possibilités sur une colonne `@unique` : par le paradoxe des
 *    anniversaires, ~5 % de risque de collision dès 300 commandes et ~50 % vers
 *    1 100 — quelques mois d'activité. Une collision faisait lever `create`
 *    sans `try/catch`, donc un 500 au moment de payer. Désormais 6 caractères
 *    tirés avec `crypto` (887 millions de possibilités) et un retry à l'appel.
 *
 *  · Le **numéro de facture** doit être séquentiel, chronologique et sans
 *    rupture (art. 242 nonies A du CGI). Un identifiant aléatoire ne satisfait
 *    pas cette obligation : il est produit par un compteur en base, attribué
 *    une seule fois, au moment où la facture est due.
 */

import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Sans I, O, 0, 1 ni U : pas de confusion à la lecture ou au téléphone. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTVWXYZ23456789";

function pick(length: number, alphabet = ALPHABET): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Référence courte affichée au client : `#7K2QF9`. */
export function makeRef(length = 6): string {
  return "#" + pick(length);
}

/**
 * Crée un enregistrement dont le `ref` doit être unique, en réessayant sur
 * collision (`P2002`) plutôt qu'en laissant remonter une 500 au moment de payer.
 */
export async function withUniqueRef<T>(
  create: (ref: string) => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await create(makeRef());
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2002") throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error("Impossible de générer une référence unique");
}

/**
 * Numéro de facture suivant, incrémenté atomiquement.
 * À n'appeler qu'une seule fois par commande : la séquence ne doit comporter
 * aucun trou.
 */
export async function nextInvoiceNumber(): Promise<number> {
  const counter = await prisma.counter.upsert({
    where: { key: "invoice" },
    create: { key: "invoice", value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}

/** `FACT-2026-000142` — présentation du numéro séquentiel. */
export function formatInvoiceNumber(n: number | null, at: Date = new Date()): string {
  if (n === null) return "—";
  return `FACT-${at.getFullYear()}-${String(n).padStart(6, "0")}`;
}

/** Code promo de dédommagement, généré depuis un ticket SAV. */
export function makeGestureCode(): string {
  return "SAV" + pick(6);
}

/** Jeton d'inscription / désinscription newsletter (RGPD). */
export function makeToken(length = 32): string {
  return pick(length, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
}
