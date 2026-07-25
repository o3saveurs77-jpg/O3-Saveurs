import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToOrderWithDriver } from "@/lib/serialize";
import { optionalUser } from "@/lib/guard";
import { ORDER_STATUSES } from "@/lib/types";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * GET /api/orders — liste des commandes, **cloisonnée par session**.
 *
 * Cette route renvoyait auparavant toute la table sans authentification : nom,
 * email, téléphone et adresse de chaque client s'obtenaient par un simple
 * `curl`. Le paramètre `?email=` était un filtre d'affichage, pas un contrôle.
 *
 * Désormais : un ADMIN voit tout, un client connecté ne voit que ses propres
 * commandes (rattachées par `userId` **ou** par l'email de son compte), et un
 * visiteur anonyme n'obtient rien.
 */
export async function GET(req: Request) {
  const user = await optionalUser();
  if (!user) {
    return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  }

  const url = new URL(req.url);
  const isAdmin = user.role === "ADMIN";

  const take = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("take")) || PAGE_SIZE),
  );
  const skip = Math.max(0, Number(url.searchParams.get("skip")) || 0);

  const where: Prisma.OrderWhereInput = isAdmin
    ? {}
    : {
        // Rattachement par compte en priorité, par email en secours pour les
        // commandes passées en invité avant la création du compte.
        OR: [{ userId: await userIdOf(user.email) }, { customerEmail: user.email.toLowerCase() }],
      };

  // Les filtres du back-office ne sont ouverts qu'à l'administration : pour un
  // client, tout paramètre supplémentaire est ignoré, jamais élargissant.
  if (isAdmin) {
    const status = url.searchParams.get("status");
    if (status && (ORDER_STATUSES as readonly string[]).includes(status)) {
      where.status = status;
    }

    const paid = url.searchParams.get("paid");
    if (paid === "true" || paid === "false") where.paid = paid === "true";

    const emailFilter = url.searchParams.get("email");
    if (emailFilter) where.customerEmail = emailFilter.toLowerCase();

    const runId = url.searchParams.get("runId");
    if (runId) where.deliveryRunId = runId;

    const since = url.searchParams.get("since");
    if (since) {
      const d = new Date(since);
      if (!Number.isNaN(d.getTime())) where.createdAt = { gte: d };
    }
  }

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { driver: { select: { name: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    orders: rows.map(rowToOrderWithDriver),
    total,
    take,
    skip,
  });
}

async function userIdOf(email: string): Promise<string> {
  const row = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  // Chaîne impossible à confondre avec un cuid : sans compte, aucun
  // rattachement par identifiant ne doit correspondre.
  return row?.id ?? "__aucun__";
}
