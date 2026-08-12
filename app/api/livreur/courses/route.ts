import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, readJson, badRequest, notFound, conflict } from "@/lib/guard";
import { parisStartOfDay } from "@/lib/hours";
import {
  CLAIMABLE_STATUSES,
  MAX_COURSES_EN_COURS,
  ONGOING_STATUSES,
  checkClaim,
  type ClaimableOrder,
} from "@/lib/dispatch";
import type { OrderLine, OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Courses libres, et prise en charge par le livreur connecté.
 *
 * Le restaurant construisait chaque tournée à la main. Ici le livreur se sert :
 * les commandes prêtes et sans livreur s'affichent, le premier qui appuie
 * l'emporte. La gérante garde la main pour réaffecter depuis Livraisons.
 */

async function driverOf(email: string) {
  return prisma.driver.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

/** Le rôle LIVREUR, ou ADMIN pour vérifier ce que voient les livreurs. */
async function guardDriver() {
  const guard = await requireUser();
  if (!guard.ok) return { ok: false as const, response: guard.response };
  if (guard.user.role !== "LIVREUR" && guard.user.role !== "ADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Accès réservé aux livreurs." }, { status: 403 }),
    };
  }
  return { ok: true as const, email: guard.user.email };
}

/** GET /api/livreur/courses — ce qu'il reste à prendre. */
export async function GET() {
  const g = await guardDriver();
  if (!g.ok) return g.response;

  const driver = await driverOf(g.email);
  if (!driver) {
    return NextResponse.json(
      { error: "Votre compte n'est rattaché à aucune fiche livreur." },
      { status: 404 },
    );
  }

  const ongoing = await prisma.order.count({
    where: { driverId: driver.id, status: { in: ONGOING_STATUSES as string[] } },
  });

  /* Aucune course proposée quand la limite est atteinte : faire miroiter ce
   * qu'on ne peut pas prendre n'aide personne. */
  const rows =
    ongoing >= MAX_COURSES_EN_COURS
      ? []
      : await prisma.order.findMany({
          where: {
            mode: "livraison",
            driverId: null,
            status: { in: CLAIMABLE_STATUSES as string[] },
            createdAt: { gte: parisStartOfDay() },
          },
          orderBy: { createdAt: "asc" },
          take: 25,
        });

  return NextResponse.json({
    ongoing,
    max: MAX_COURSES_EN_COURS,
    courses: rows.map((o) => {
      let items = 0;
      try {
        const parsed: unknown = JSON.parse(o.lines);
        if (Array.isArray(parsed)) items = (parsed as OrderLine[]).reduce((n, l) => n + l.qty, 0);
      } catch {
        /* lignes illisibles : le compte d'articles manquera, la course reste prenable */
      }
      return {
        id: o.id,
        ref: o.ref,
        /* Le livreur voit à qui et où il livre — c'est ce qu'il lui faut pour
         * juger si la course est sur son chemin. */
        customerName: o.customerName,
        address: [o.address, [o.zip, o.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        totalCents: o.totalCents,
        paid: o.paid,
        paymentMethod: o.paymentMethod,
        status: o.status,
        slot: o.slot,
        items,
      };
    }),
  });
}

/** POST /api/livreur/courses — « je prends ». */
export async function POST(req: Request) {
  const g = await guardDriver();
  if (!g.ok) return g.response;

  const driver = await driverOf(g.email);
  if (!driver) return notFound("Votre compte n'est rattaché à aucune fiche livreur.");
  if (!driver.active) return conflict("Votre fiche livreur est désactivée.");

  const body = (await readJson<{ orderId?: unknown }>(req)) ?? {};
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) return badRequest("Course manquante.");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  const ongoing = await prisma.order.count({
    where: { driverId: driver.id, status: { in: ONGOING_STATUSES as string[] } },
  });

  const check = checkClaim(
    order ? ({ ...order, status: order.status as OrderStatus } as ClaimableOrder) : null,
    ongoing,
  );
  if (!check.ok) return conflict(check.error);

  /* Écriture conditionnelle sur `driverId: null` : deux livreurs qui appuient
   * dans la même seconde ne peuvent pas repartir tous les deux avec la course.
   * Le contrôle ci-dessus ne suffit pas — entre sa lecture et cette écriture,
   * l'autre a pu passer. */
  const applied = await prisma.order.updateMany({
    where: { id: orderId, driverId: null, status: { in: CLAIMABLE_STATUSES as string[] } },
    data: { driverId: driver.id },
  });

  if (applied.count === 0) {
    return conflict("Un autre livreur vient de prendre cette course.");
  }

  /* La course rejoint la tournée du jour, créée à la volée si c'est la
   * première : sans tournée, l'écran du livreur n'aurait rien à afficher. */
  let run = await prisma.deliveryRun.findFirst({
    where: {
      driverId: driver.id,
      date: { gte: parisStartOfDay() },
      status: { in: ["preparee", "en_cours"] },
    },
    orderBy: { date: "asc" },
  });

  if (!run) {
    run = await prisma.deliveryRun.create({
      data: { driverId: driver.id, date: parisStartOfDay(), status: "preparee" },
    });
  }

  const last = await prisma.order.findFirst({
    where: { deliveryRunId: run.id },
    orderBy: { runPosition: "desc" },
    select: { runPosition: true },
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { deliveryRunId: run.id, runPosition: (last?.runPosition ?? -1) + 1 },
  });

  return NextResponse.json({ ok: true, runId: run.id });
}
