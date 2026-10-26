/* Double de Prisma pour les tests de routes.
 *
 * ⚠️ Raison d'être, et elle n'est pas théorique : `.env` pointe sur la base de
 * **production** du restaurant. Un test qui laisserait passer un vrai client
 * Prisma écrirait dans les réglages, les horaires ou la carte du site en ligne.
 * Toute suite qui importe un route handler doit donc neutraliser `@/lib/prisma`.
 *
 * Le double enregistre chaque appel dans `journal` : c'est ce qui permet de
 * vérifier non seulement la réponse HTTP, mais aussi **qu'aucune écriture n'a eu
 * lieu** quand la route refuse. Un 400 renvoyé après une écriture partielle
 * serait un faux négatif qu'une assertion sur le seul statut ne verrait pas.
 */

import { vi } from "vitest";

export interface AppelPrisma {
  /** « dish.findUnique », « $transaction », … */
  cible: string;
  args: unknown[];
}

/** Méthodes qui modifient la base — servent à prouver l'absence d'écriture. */
const ECRITURES = [
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
];

export interface PrismaDouble {
  /** Tous les appels, dans l'ordre. */
  journal: AppelPrisma[];
  /** Réponses programmées, par cible (« setting.findMany »). */
  reponses: Map<string, unknown>;
  /** Programme la valeur renvoyée par une cible. */
  quand(cible: string, valeur: unknown): void;
  /** Vide le journal et les réponses programmées. */
  reinitialiser(): void;
  /** Appels d'écriture uniquement. */
  ecritures(): AppelPrisma[];
  /** Le client à passer à `vi.mock("@/lib/prisma")`. */
  client: Record<string, never>;
}

/** Valeur par défaut d'une méthode Prisma non programmée. */
function defautPour(methode: string): unknown {
  if (methode === "findMany" || methode === "groupBy" || methode === "$queryRaw") return [];
  if (methode === "findUnique" || methode === "findFirst") return null;
  if (methode === "count") return 0;
  if (methode === "aggregate") return { _sum: {}, _count: {}, _avg: {} };
  if (methode === "createMany" || methode === "updateMany" || methode === "deleteMany") {
    return { count: 1 };
  }
  return { id: "double" };
}

/**
 * Crée un double de `prisma` qui accepte n'importe quel modèle et n'importe
 * quelle méthode.
 *
 * Un objet littéral exigerait de connaître à l'avance tous les modèles touchés
 * par les 73 routes ; un `Proxy` laisse le balayage d'autorisation importer
 * n'importe quelle route sans s'écrouler sur un `prisma.xxx is undefined`
 * — lequel masquerait le refus qu'on cherche justement à observer.
 */
export function creerPrismaDouble(): PrismaDouble {
  const journal: AppelPrisma[] = [];
  const reponses = new Map<string, unknown>();

  const appel = (cible: string, methode: string) =>
    async (...args: unknown[]) => {
      journal.push({ cible, args });
      if (reponses.has(cible)) {
        const programmee = reponses.get(cible);
        if (typeof programmee === "function") {
          return (programmee as (...a: unknown[]) => unknown)(...args);
        }
        return programmee;
      }
      return defautPour(methode);
    };

  const client: Record<string, unknown> = {};

  const racine = new Proxy(client, {
    get(_cible, prop: string) {
      if (prop === "then") return undefined; // ne pas se faire prendre pour une promesse

      /* `$transaction` reçoit soit un tableau de promesses déjà lancées, soit
       * une fonction interactive. Les deux formes sont utilisées dans le dépôt
       * (`PUT /api/hours` passe un tableau, `applyMovement` une fonction). */
      if (prop === "$transaction") {
        return async (arg: unknown) => {
          journal.push({ cible: "$transaction", args: [arg] });
          if (Array.isArray(arg)) return Promise.all(arg);
          if (typeof arg === "function") {
            return (arg as (tx: unknown) => unknown)(racine);
          }
          return undefined;
        };
      }

      if (prop === "$queryRaw" || prop === "$executeRaw") {
        return appel(prop, "$queryRaw");
      }

      if (prop.startsWith("$")) return async () => undefined;

      return new Proxy(
        {},
        {
          get(_m, methode: string) {
            if (methode === "then") return undefined;
            return appel(`${prop}.${methode}`, methode);
          },
        },
      );
    },
  });

  return {
    journal,
    reponses,
    quand(cible, valeur) {
      reponses.set(cible, valeur);
    },
    reinitialiser() {
      journal.length = 0;
      reponses.clear();
    },
    ecritures() {
      return journal.filter((a) => {
        const methode = a.cible.split(".")[1] ?? "";
        return ECRITURES.includes(methode);
      });
    },
    client: racine as Record<string, never>,
  };
}

/** Instance partagée : une par fichier de test, lue par la fabrique `vi.mock`. */
export const prismaDouble = creerPrismaDouble();

/**
 * Double de `@/lib/email`.
 *
 * La clé Resend du dépôt est **active**. Une route qui enverrait un vrai email
 * à un vrai client depuis une suite de tests serait un incident, pas un test
 * raté : chaque fonction d'envoi est donc remplacée par un espion muet.
 */
export function doubleEmail(): Record<string, unknown> {
  const envois: { fn: string; args: unknown[] }[] = [];
  const espion = (fn: string) =>
    vi.fn(async (...args: unknown[]) => {
      envois.push({ fn, args });
      return true;
    });

  return new Proxy(
    { __envois: envois },
    {
      get(cible: Record<string, unknown>, prop: string) {
        if (prop === "__envois") return envois;
        if (prop === "then") return undefined;
        if (!(prop in cible)) cible[prop] = espion(prop);
        return cible[prop];
      },
    },
  ) as Record<string, unknown>;
}
