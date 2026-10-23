-- Borne de commande en salle : numéro d'attente.
--
-- Additif et sans rupture : les deux colonnes restent NULL sur toutes les
-- commandes existantes (passées en ligne), et l'index unique tolère les NULL
-- par construction. Aucune commande n'est modifiée.
--
-- Le mode « sur_place » ne demande rien ici : `Order.mode` est un texte validé
-- par TypeScript (`lib/types.ts`), pas un enum Prisma — voir l'en-tête du schéma.

ALTER TABLE "Order" ADD COLUMN "ticketNumber" INTEGER;
ALTER TABLE "Order" ADD COLUMN "ticketDate" TEXT;

CREATE UNIQUE INDEX "Order_ticketDate_ticketNumber_key" ON "Order"("ticketDate", "ticketNumber");
