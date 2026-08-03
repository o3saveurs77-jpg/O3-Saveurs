-- CreateTable
CREATE TABLE "DeliveryTier" (
    "id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "maxKm" DOUBLE PRECISION NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "minimumCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DeliveryTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryTier_idx_key" ON "DeliveryTier"("idx");

-- CreateIndex
CREATE INDEX "DeliveryTier_idx_idx" ON "DeliveryTier"("idx");

-- AlterTable
-- Distance retenue pour facturer, figée à la commande. NULL pour toutes les
-- commandes existantes, tarifées par zone : rien n'est réécrit rétroactivement.
ALTER TABLE "Order" ADD COLUMN "distanceKm" DOUBLE PRECISION;
