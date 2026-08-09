import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, badRequest } from "@/lib/guard";
import { sendStatusUpdate } from "@/lib/email";
import { cashToCollect, checkDelivery, checkRunAccess } from "@/lib/deliveryAccess";
import type { OrderLine } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Tournée d'un livreur, ouverte par un lien privé — **sans compte**.
 *
 * Le jeton de l'URL *est* l'autorisation : le livreur reçoit son lien par SMS
 * et l'ouvre sur son téléphone. C'est ce qui permet de faire rouler un extra
 * embauché le matin même.
 *
 * Deux conséquences, tenues ici et dans `lib/deliveryAccess.ts` :
 *
 *  · le jeton est revérifié **à chaque appel**, y compris pour les écritures.
 *    Un lien expiré ou remplacé ne fait plus rien ;
 *  · on ne renvoie que les arrêts de cette tournée, et rien d'autre. Pas de
 *    liste de clients, pas d'historique, pas de chiffre d'affaires — le strict
 *    nécessaire pour livrer.
 */

/** Ce que le livreur a besoin de voir d'un arrêt, et rien de plus. */
function toStop(o: {
  id: string;
  ref: string;
  status: string;
  runPosition: number | null;
  customerName: string;
  customerPhone: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  totalCents: number;
  paid: boolean;
  paymentMethod: string;
  lines: string;
  deliveryCode: string | null;
  deliveredWithoutCode: boolean;
  driverNote: string;
}) {
  let items: { qty: number; name: string }[] = [];
  try {
    const parsed: unknown = JSON.parse(o.lines);
    if (Array.isArray(parsed)) {
      items = (parsed as OrderLine[]).map((l) => ({ qty: l.qty, name: l.name }));
    }
  } catch {
    /* lignes illisibles : l'arrêt reste livrable, le détail manquera */
  }

  return {
    id: o.id,
    ref: o.ref,
    status: o.status,
    position: o.runPosition,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    address: [o.address, [o.zip, o.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    totalCents: o.totalCents,
    paid: o.paid,
    paymentMethod: o.paymentMethod,
    /* Le code n'est **jamais** renvoyé au livreur : il doit le recevoir du
     * client. L'afficher sur son écran viderait la preuve de tout son sens. */
    hasCode: !!o.deliveryCode,
    deliveredWithoutCode: o.deliveredWithoutCode,
    driverNote: o.driverNote,
    items,
  };
}

async function loadRun(token: string) {
  const run = await prisma.deliveryRun.findUnique({
    where: { accessToken: token },
    include: {
      driver: { select: { name: true } },
      orders: { orderBy: [{ runPosition: "asc" }, { createdAt: "asc" }] },
    },
  });
  return run;
}

/** GET /api/tournee/[token] — la tournée et ses arrêts. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const run = await loadRun(token);

  const access = checkRunAccess(run, token);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const stops = run!.orders.map(toStop);

  return NextResponse.json({
    runId: run!.id,
    driverName: run!.driver.name,
    date: run!.date.toISOString(),
    status: run!.status,
    stops,
    cashToCollectCents: cashToCollect(
      run!.orders.map((o) => ({
        paid: o.paid,
        paymentMethod: o.paymentMethod,
        totalCents: o.totalCents,
        status: o.status,
      })),
    ),
  });
}

interface ActionBody {
  orderId?: unknown;
  action?: unknown;
  code?: unknown;
  reason?: unknown;
}

/**
 * POST /api/tournee/[token] — une action sur un arrêt.
 *
 * `action` vaut `livree`, `encaisse` ou `incident`. Le regroupement en une
 * seule route évite trois fichiers pour trois écritures qui partagent toutes
 * la même vérification de jeton et la même recherche d'arrêt.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const run = await loadRun(token);

  const access = checkRunAccess(run, token);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await readJson<ActionBody>(req)) ?? {};
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const action = typeof body.action === "string" ? body.action : "";
  const code = typeof body.code === "string" ? body.code : "";
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 300) : "";

  /* L'arrêt doit appartenir à **cette** tournée : sans ce contrôle, un jeton
   * valide permettrait d'agir sur n'importe quelle commande du restaurant. */
  const order = run!.orders.find((o) => o.id === orderId);
  if (!order) return badRequest("Cet arrêt ne fait pas partie de la tournée.");

  if (order.status === "annulee") return badRequest("Cette commande a été annulée.");

  switch (action) {
    case "livree": {
      if (order.status === "livree") return badRequest("Cet arrêt est déjà clos.");

      const verdict = checkDelivery(order.deliveryCode, code, reason);
      if (!verdict.ok) return badRequest(verdict.error);

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "livree",
          deliveredAt: new Date(),
          deliveredWithoutCode: verdict.withoutCode,
          driverNote: verdict.withoutCode ? reason : order.driverNote,
        },
      });

      await sendStatusUpdate(updated).catch((error) =>
        console.error(`[tournee] email de livraison pour ${order.id} échoué:`, error),
      );

      return NextResponse.json({ ok: true, withoutCode: verdict.withoutCode });
    }

    case "encaisse": {
      if (order.paid) return badRequest("Cette commande est déjà réglée.");

      /* Le livreur encaisse, il ne facture pas : le numéro de facture reste
       * attribué par le back-office, qui seul sait si les mentions légales
       * sont complètes. La commande est marquée payée, la facture partira à
       * la validation côté restaurant. */
      await prisma.order.update({
        where: { id: order.id },
        data: { paid: true, paymentStatus: "paye" },
      });

      return NextResponse.json({ ok: true });
    }

    case "incident": {
      if (reason.trim().length < 3) return badRequest("Décrivez brièvement le problème.");

      await prisma.order.update({
        where: { id: order.id },
        data: { driverNote: reason, incidentAt: new Date() },
      });

      return NextResponse.json({ ok: true });
    }

    default:
      return badRequest("Action inconnue.");
  }
}
