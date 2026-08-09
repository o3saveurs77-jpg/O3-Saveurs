-- AlterTable
ALTER TABLE "Driver" ADD COLUMN "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Driver_email_key" ON "Driver"("email");
