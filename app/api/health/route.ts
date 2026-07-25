import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — sonde de disponibilité.
 *
 * Il n'existait aucune route de ce genre, donc aucun moniteur externe ne pouvait
 * être branché : une panne de base ou une clé Stripe absente restait invisible
 * jusqu'à ce qu'un client se plaigne. Les logs Vercel en offre Hobby ne sont
 * conservés qu'une heure, donc un incident nocturne ne laissait aucune trace au
 * matin.
 *
 * Volontairement **sans détail sensible** : la route est publique pour qu'un
 * service de surveillance gratuit puisse l'interroger. Elle dit si les
 * dépendances répondent, jamais pourquoi elles ne répondent pas.
 */
export async function GET() {
  const started = Date.now();

  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  const checks = {
    database,
    stripe: isStripeConfigured(),
    email: !!process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes("placeholder"),
    blob: !!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_READ_WRITE_TOKEN.includes("placeholder"),
  };

  // Seule la base rend le site inutilisable. Les intégrations manquantes sont
  // dégradantes, pas fatales — sauf Stripe en production, traité au checkout.
  const healthy = checks.database;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks,
      latencyMs: Date.now() - started,
    },
    { status: healthy ? 200 : 503 },
  );
}
