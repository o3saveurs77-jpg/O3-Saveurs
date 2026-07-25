import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest } from "@/lib/guard";
import { collect, int, bool } from "@/lib/validate";
import { getOpeningHours, getSlotConfig } from "@/lib/settings";
import {
  WEEKDAY_LABEL,
  availableSlots,
  isOpenAt,
  nextService,
  parisNow,
  toMinutes,
  type DayHours,
} from "@/lib/hours";

export const dynamic = "force-dynamic";

/* Horaires d'ouverture (lot 4.5, audit §3.10).
 *
 * Les horaires n'existaient que sous forme de chaînes décoratives dans le pied
 * de page (« 11h30 – 14h30 ») : aucune fonction ne les lisait. Une commande
 * pouvait être passée et payée à 4 h du matin, et les créneaux du midi étaient
 * proposés le vendredi et le dimanche, jours où le restaurant est **fermé le
 * midi**. Ils viennent désormais de la table `OpeningHours` et pilotent à la
 * fois l'affichage et le refus côté serveur.
 *
 * `GET` est public : c'est une information de vitrine, affichée dans le pied de
 * page et sur la page Contact. `PUT` est réservé à l'administration.
 */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Réponse commune à GET et PUT : les 7 jours + l'état courant. */
async function state(hours: DayHours[]) {
  const at = new Date();
  const cfg = await getSlotConfig();
  const { weekday, hhmm } = parisNow(at);
  return {
    hours,
    /** heure de Paris au moment de la requête, quel que soit le fuseau du serveur */
    now: { weekday, weekdayLabel: WEEKDAY_LABEL[weekday], time: hhmm },
    open: isOpenAt(hours, at),
    next: nextService(hours, at),
    /** créneaux encore commandables aujourd'hui, délai de préparation déduit */
    slots: availableSlots(hours, {
      at,
      stepMinutes: cfg.stepMinutes,
      leadTimeMinutes: cfg.leadTimeMinutes,
    }),
    slotConfig: { stepMinutes: cfg.stepMinutes, leadTimeMinutes: cfg.leadTimeMinutes },
  };
}

/** GET /api/hours — **publique** : horaires des 7 jours et état d'ouverture. */
export async function GET() {
  return NextResponse.json(await state(await getOpeningHours()));
}

interface DayBody {
  weekday?: unknown;
  closed?: unknown;
  lunchOpen?: unknown;
  lunchClose?: unknown;
  dinnerOpen?: unknown;
  dinnerClose?: unknown;
}

interface PutBody {
  days?: DayBody[];
}

/** Une heure facultative : `""`, `null` et absente valent « pas de service ». */
function optionalTime(v: unknown, field: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !HHMM.test(v.trim())) {
    return { ok: false, error: `${field} doit être une heure au format HH:MM` };
  }
  return { ok: true, value: v.trim() };
}

/** Un service est soit absent des deux côtés, soit complet et croissant. */
function readService(
  open: unknown,
  close: unknown,
  label: string,
  dayLabel: string,
): { ok: true; open: string | null; close: string | null } | { ok: false; error: string } {
  const o = optionalTime(open, `L'ouverture du ${label} (${dayLabel})`);
  if (!o.ok) return o;
  const c = optionalTime(close, `La fermeture du ${label} (${dayLabel})`);
  if (!c.ok) return c;

  if (o.value === null && c.value === null) return { ok: true, open: null, close: null };
  if (o.value === null || c.value === null) {
    return {
      ok: false,
      error: `Le service du ${label} de ${dayLabel} a besoin d'une heure d'ouverture et d'une heure de fermeture, ou d'aucune des deux`,
    };
  }
  if (toMinutes(c.value) <= toMinutes(o.value)) {
    return {
      ok: false,
      error: `La fermeture du ${label} de ${dayLabel} (${c.value}) doit être après l'ouverture (${o.value})`,
    };
  }
  return { ok: true, open: o.value, close: c.value };
}

/**
 * PUT /api/hours — **administration uniquement**.
 *
 * Accepte un ou plusieurs jours : `{ days: [{ weekday, closed, lunchOpen, … }] }`
 * ou directement un jour unique. Les services du midi et du soir sont
 * indépendants : le restaurant est réellement fermé le midi le vendredi et le
 * dimanche, ce qui s'exprime par un service du midi vide, pas par `closed`.
 */
export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<PutBody & DayBody>(req);
  if (!body) return badRequest("Requête invalide");

  const input: DayBody[] = Array.isArray(body.days)
    ? body.days
    : body.weekday !== undefined
      ? [body]
      : [];
  if (!input.length) return badRequest("Aucun jour fourni");
  if (input.length > 7) return badRequest("La semaine ne compte que 7 jours");

  const rows: DayHours[] = [];
  const seen = new Set<number>();

  for (const day of input) {
    const base = collect({ weekday: int(day.weekday, "Le jour de la semaine", { min: 0, max: 6 }) });
    if (!base.ok) return badRequest(base.error);
    const weekday = base.value.weekday;
    if (seen.has(weekday)) return badRequest(`${WEEKDAY_LABEL[weekday]} est fourni deux fois`);
    seen.add(weekday);

    const dayLabel = WEEKDAY_LABEL[weekday].toLowerCase();
    const closed = bool(day.closed, false);

    const lunch = readService(day.lunchOpen, day.lunchClose, "midi", dayLabel);
    if (!lunch.ok) return badRequest(lunch.error);
    const dinner = readService(day.dinnerOpen, day.dinnerClose, "soir", dayLabel);
    if (!dinner.ok) return badRequest(dinner.error);

    if (lunch.close && dinner.open && toMinutes(dinner.open) < toMinutes(lunch.close)) {
      return badRequest(
        `Le service du soir de ${dayLabel} (${dinner.open}) commence avant la fin du midi (${lunch.close})`,
      );
    }

    // Un jour ouvert sans aucun service est un piège : le client verrait
    // « ouvert » sans qu'aucun créneau ne soit proposable.
    if (!closed && !lunch.open && !dinner.open) {
      return badRequest(
        `${WEEKDAY_LABEL[weekday]} n'est pas marqué fermé mais n'a aucun service : cochez « fermé » ou renseignez au moins un service`,
      );
    }

    rows.push({
      weekday,
      closed,
      lunchOpen: lunch.open,
      lunchClose: lunch.close,
      dinnerOpen: dinner.open,
      dinnerClose: dinner.close,
    });
  }

  await prisma.$transaction(
    rows.map((r) =>
      prisma.openingHours.upsert({
        where: { weekday: r.weekday },
        create: r,
        update: {
          closed: r.closed,
          lunchOpen: r.lunchOpen,
          lunchClose: r.lunchClose,
          dinnerOpen: r.dinnerOpen,
          dinnerClose: r.dinnerClose,
        },
      }),
    ),
  );

  return NextResponse.json(await state(await getOpeningHours()));
}
