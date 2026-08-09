-- AlterTable
ALTER TABLE "DeliveryRun" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "accessExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryCode" TEXT,
ADD COLUMN     "deliveredWithoutCode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "driverNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "incidentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRun_accessToken_key" ON "DeliveryRun"("accessToken");
