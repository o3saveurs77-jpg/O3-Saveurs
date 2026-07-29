import { prisma } from "@/lib/prisma";
import { parisNow, parisStartOfDay, WEEKDAY_LABEL } from "@/lib/hours";

/* Le plat du jour n'était lu que par l'accueil, la requête écrite en dur au
 * milieu de `loadHome`. La Carte devant l'afficher aussi, la logique est
 * remontée ici plutôt que recopiée : la règle « une date précise l'emporte sur
 * la récurrence hebdomadaire » n'a qu'un seul endroit où être juste. */

export interface PlatDuJourView {
  name: string;
  priceCents: number | null;
  /** Libellé du jour courant, déjà traduit (« mercredi »). */
  jour: string;
  /** Plat du catalogue mis en avant, ou null si l'annonce est libre. */
  dishId: string | null;
}

/**
 * Plat du jour actif pour aujourd'hui, heure de Paris.
 *
 * Renvoie `null` s'il n'y en a pas — les deux pages masquent alors leur encart
 * plutôt que d'afficher un cadre vide.
 */
export async function loadDailySpecial(): Promise<PlatDuJourView | null> {
  const { weekday } = parisNow();
  const today = parisStartOfDay();
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const rows = await prisma.dailySpecial.findMany({
    where: {
      active: true,
      OR: [{ date: { gte: today, lt: tomorrow } }, { weekday }],
    },
    orderBy: [{ position: "asc" }],
  });

  // Une date précise l'emporte sur la récurrence hebdomadaire.
  const special = rows.find((s) => s.date !== null) ?? rows[0] ?? null;
  if (!special) return null;

  return {
    name: special.name,
    priceCents: special.priceCents,
    jour: WEEKDAY_LABEL[weekday],
    dishId: special.dishId,
  };
}
