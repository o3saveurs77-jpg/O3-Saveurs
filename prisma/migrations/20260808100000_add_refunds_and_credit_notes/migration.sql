-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "creditNoteNumber" INTEGER,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "cancelReason" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "Order_creditNoteNumber_key" ON "Order"("creditNoteNumber");

-- Les commandes déjà marquées « remboursées » avant cette migration n'ont ni
-- montant ni avoir : on renseigne le montant pour que la comptabilité ne voie
-- pas un remboursement à zéro euro. Le numéro d'avoir reste nul, il ne peut pas
-- être inventé rétroactivement sans trouer la séquence.
UPDATE "Order" SET "refundedCents" = "totalCents", "refundedAt" = "updatedAt"
WHERE "paymentStatus" = 'rembourse';
