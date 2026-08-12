import { NextResponse } from "next/server";
import { getOpeningHours, getSlotConfig } from "@/lib/settings";
import { preorderDays, DEFAULT_LEAD_TIME_HOURS } from "@/lib/preorder";

export const dynamic = "force-dynamic";

/** Un mois de délai suffit largement ; au-delà, c'est une demande traiteur. */
const MAX_LEAD_TIME_HOURS = 24 * 30;

/**
 * GET /api/preorder-slots?hours=48 — dates de retrait d'un plat sur commande.
 *
 * `hours` vient du panier du navigateur et n'est **pas** une donnée de
 * confiance : elle ne sert qu'à dessiner le sélecteur. Le checkout relit le
 * délai réel des plats en base et recalcule la même liste avant d'accepter
 * quoi que ce soit (`checkPreorderSchedule`). Un client qui la falsifierait ne
 * ferait que s'afficher des dates que le serveur lui refusera ensuite.
 */
export async function GET(req: Request) {
  const asked = Number(new URL(req.url).searchParams.get("hours"));
  const leadTimeHours =
    Number.isFinite(asked) && asked > 0
      ? Math.min(Math.round(asked), MAX_LEAD_TIME_HOURS)
      : DEFAULT_LEAD_TIME_HOURS;

  try {
    const [hours, config] = await Promise.all([getOpeningHours(), getSlotConfig()]);
    const days = preorderDays(hours, leadTimeHours, { stepMinutes: config.stepMinutes });
    return NextResponse.json({ leadTimeHours, days });
  } catch (error) {
    console.error("[preorder-slots] lecture des horaires échouée:", error);
    // Ne rien proposer plutôt que de proposer une date que le serveur refusera.
    return NextResponse.json({ leadTimeHours, days: [] }, { status: 200 });
  }
}
