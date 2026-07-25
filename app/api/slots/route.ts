import { NextResponse } from "next/server";
import { getOpeningHours, getSlotConfig } from "@/lib/settings";
import { availableSlots, isOpenAt, nextService, WEEKDAY_LABEL } from "@/lib/hours";

export const dynamic = "force-dynamic";

/**
 * GET /api/slots — créneaux réellement proposables, publique.
 *
 * Le tunnel de commande affichait une liste codée en dur (`12:00`, `12:30`,
 * `13:00`, `19:00`…) qui proposait le service du midi les jours où le
 * restaurant est fermé le midi, et ne retirait jamais les créneaux déjà passés.
 * Les horaires viennent maintenant de la base, et le même calcul (`lib/hours`)
 * sert à l'affichage et au refus côté `/api/checkout` — impossible de proposer
 * un créneau que le serveur rejettera.
 */
export async function GET() {
  try {
    const [hours, config] = await Promise.all([getOpeningHours(), getSlotConfig()]);
    const now = new Date();

    const open = isOpenAt(hours, now);
    const slots = availableSlots(hours, {
      at: now,
      stepMinutes: config.stepMinutes,
      leadTimeMinutes: config.leadTimeMinutes,
    });
    const next = nextService(hours, now);

    return NextResponse.json({
      open,
      slots,
      leadTimeMinutes: config.leadTimeMinutes,
      nextService: next
        ? { ...next, weekdayLabel: WEEKDAY_LABEL[next.weekday] }
        : null,
    });
  } catch (error) {
    console.error("[slots] lecture des horaires échouée:", error);
    // Ne rien proposer plutôt que de proposer un créneau que le serveur refusera.
    return NextResponse.json(
      { open: false, slots: [], leadTimeMinutes: 35, nextService: null },
      { status: 200 },
    );
  }
}
