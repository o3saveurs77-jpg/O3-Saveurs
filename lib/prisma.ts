import { PrismaClient } from "@prisma/client";
import { assertEnv } from "./env";

/* Point d'entrée de toute lecture en base : c'est le premier module chargé par
 * n'importe quelle page ou route utile, donc le bon endroit pour refuser de
 * démarrer sur une configuration incomplète. Voir `lib/env.ts`. */
assertEnv();

// Singleton — évite d'épuiser les connexions en dev (hot reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
