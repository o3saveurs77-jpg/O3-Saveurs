/* Gestion des stocks.
 *
 * Objectif métier : ne plus vendre ce qui n'est plus en cuisine. Un plat avec
 * `stock = null` est illimité (cas des boissons ou des plats préparés à la
 * demande) ; sinon chaque commande décrémente, et le plat bascule tout seul en
 * indisponible à zéro.
 *
 * Le décrément est **atomique et conditionnel** : `decrement` dans un `where`
 * qui exige `stock >= qty`. Deux clients qui commandent le dernier plat en même
 * temps ne peuvent pas passer tous les deux — sans cela, le stock deviendrait
 * négatif et la cuisine découvrirait le problème au moment de préparer.
 *
 * Chaque variation laisse une trace dans `StockMovement`, ce qui permet de
 * répondre à « où sont passées les 12 parts de mafé ? » autrement qu'au doigt
 * mouillé.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { OrderLine, StockReason } from "@/lib/types";

export interface StockShortage {
  dishId: string;
  name: string;
  requested: number;
  available: number;
}

/** Ligne telle que le stock la voit : un plat, une quantité, un nom. */
type StockLine = Pick<OrderLine, "dishId" | "qty"> &
  Partial<Pick<OrderLine, "name" | "formulaId" | "picks">>;

/**
 * Éclate les lignes au niveau du plat.
 *
 * Une formule n'a pas de stock : ce sont les plats qu'elle contient qui
 * sortent de la cuisine. Sans cet éclatement, deux « Formule Gourmande » au
 * thiéboudiène ne décrémenteraient rien et la marmite serait vendue deux fois.
 * L'éclatement vit ici, et non chez les appelants, pour qu'aucun chemin
 * — commande, annulation, échec de paiement — ne puisse l'oublier.
 */
export function toDishLines(lines: StockLine[]): { dishId: string; qty: number; name: string }[] {
  const out: { dishId: string; qty: number; name: string }[] = [];
  for (const l of lines) {
    if (l.formulaId) {
      for (const pick of l.picks ?? []) {
        out.push({ dishId: pick.dishId, qty: l.qty, name: pick.dishName });
      }
      continue;
    }
    if (l.dishId) out.push({ dishId: l.dishId, qty: l.qty, name: l.name ?? "?" });
  }
  return out;
}

/** Cumule les quantités par plat : deux lignes du même plat puisent au même stock. */
export function neededByDish(lines: StockLine[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of toDishLines(lines)) out.set(l.dishId, (out.get(l.dishId) ?? 0) + l.qty);
  return out;
}

/**
 * Réserve le stock des lignes d'une commande.
 * Renvoie la liste des manques si la réservation n'est pas possible ; dans ce
 * cas **aucun** décrément n'a été appliqué (tout se joue dans une transaction).
 */
export async function reserveStock(
  lines: StockLine[],
  { orderId, author }: { orderId?: string; author?: string | null } = {},
): Promise<{ ok: true } | { ok: false; shortages: StockShortage[] }> {
  const dishLines = toDishLines(lines);
  const needed = neededByDish(lines);
  const nameOf = new Map(dishLines.map((l) => [l.dishId, l.name]));

  try {
    await prisma.$transaction(async (tx) => {
      for (const [dishId, qty] of needed) {
        // Un plat à stock illimité n'est pas concerné.
        const dish = await tx.dish.findUnique({
          where: { id: dishId },
          select: { stock: true, name: true },
        });
        if (!dish) throw new ShortageError([{ dishId, name: nameOf.get(dishId) ?? "?", requested: qty, available: 0 }]);
        if (dish.stock === null) continue;

        // Décrément conditionnel : échoue si le stock a bougé entre-temps.
        const updated = await tx.dish.updateMany({
          where: { id: dishId, stock: { gte: qty } },
          data: { stock: { decrement: qty } },
        });
        if (updated.count === 0) {
          throw new ShortageError([
            { dishId, name: dish.name, requested: qty, available: dish.stock ?? 0 },
          ]);
        }

        await tx.stockMovement.create({
          data: { dishId, delta: -qty, reason: "vente", orderId, author: author ?? null },
        });

        // Bascule automatique en indisponible quand le stock tombe à zéro.
        await tx.dish.updateMany({
          where: { id: dishId, stock: { lte: 0 } },
          data: { available: false },
        });
      }
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ShortageError) return { ok: false, shortages: error.shortages };
    throw error;
  }
}

class ShortageError extends Error {
  constructor(public shortages: StockShortage[]) {
    super("Stock insuffisant");
    this.name = "ShortageError";
  }
}

/**
 * Remet en stock les lignes d'une commande annulée ou dont le paiement a échoué.
 * Sans cela, un panier abandonné immobiliserait le stock indéfiniment.
 */
export async function releaseStock(
  lines: StockLine[],
  { orderId, reason = "correction" }: { orderId?: string; reason?: StockReason } = {},
): Promise<void> {
  const needed = neededByDish(lines);
  await prisma.$transaction(async (tx) => {
    for (const [dishId, qty] of needed) {
      const dish = await tx.dish.findUnique({ where: { id: dishId }, select: { stock: true } });
      if (!dish || dish.stock === null) continue;
      await tx.dish.update({ where: { id: dishId }, data: { stock: { increment: qty } } });
      await tx.stockMovement.create({
        data: { dishId, delta: qty, reason, orderId, author: null },
      });
    }
  });
}

/**
 * Mouvement de stock manuel depuis l'administration (réappro, perte, inventaire).
 * `inventaire` fixe la valeur absolue ; les autres motifs ajoutent un delta.
 */
export async function applyMovement({
  dishId,
  delta,
  reason,
  note,
  author,
  absolute,
}: {
  dishId: string;
  delta: number;
  reason: StockReason;
  note?: string | null;
  author: string;
  /** valeur de stock constatée, pour un inventaire */
  absolute?: number;
}): Promise<{ stock: number | null }> {
  return prisma.$transaction(async (tx) => {
    const dish = await tx.dish.findUnique({ where: { id: dishId }, select: { stock: true } });
    if (!dish) throw new Error("Plat introuvable");

    let effectiveDelta = delta;
    let nextStock: number;

    if (reason === "inventaire" && absolute !== undefined) {
      nextStock = Math.max(0, absolute);
      effectiveDelta = nextStock - (dish.stock ?? 0);
    } else {
      nextStock = Math.max(0, (dish.stock ?? 0) + delta);
    }

    await tx.dish.update({
      where: { id: dishId },
      // Une entrée de stock remet le plat en vente : sans cela, la cliente
      // réapprovisionne et le plat reste invisible sur la carte.
      data: { stock: nextStock, ...(nextStock > 0 ? { available: true } : {}) },
    });

    if (effectiveDelta !== 0) {
      await tx.stockMovement.create({
        data: { dishId, delta: effectiveDelta, reason, note: note ?? null, author },
      });
    }

    return { stock: nextStock };
  });
}

export interface LowStockDish {
  id: string;
  name: string;
  stock: number;
  stockAlert: number;
}

/**
 * Plats sous leur seuil d'alerte, pour le tableau de bord et l'écran Stocks.
 * En SQL paramétré car Prisma ne sait pas comparer deux colonnes entre elles
 * dans un `where` (`stock <= stockAlert`).
 */
export async function lowStockDishes(): Promise<LowStockDish[]> {
  return prisma.$queryRaw<LowStockDish[]>(Prisma.sql`
    SELECT "id", "name", "stock", "stockAlert"
    FROM "Dish"
    WHERE "stock" IS NOT NULL
      AND "stockAlert" IS NOT NULL
      AND "stock" <= "stockAlert"
    ORDER BY "stock" ASC, "name" ASC
  `);
}
