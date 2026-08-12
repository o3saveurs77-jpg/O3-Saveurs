-- CreateTable
CREATE TABLE "Formula" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "desc" TEXT NOT NULL DEFAULT '',
    "extra" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormulaSlot" (
    "id" TEXT NOT NULL,
    "formulaId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FormulaSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormulaChoice" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "supplementCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FormulaChoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Formula_code_key" ON "Formula"("code");

-- CreateIndex
CREATE INDEX "Formula_active_position_idx" ON "Formula"("active", "position");

-- CreateIndex
CREATE INDEX "FormulaSlot_formulaId_position_idx" ON "FormulaSlot"("formulaId", "position");

-- CreateIndex
CREATE INDEX "FormulaChoice_slotId_position_idx" ON "FormulaChoice"("slotId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FormulaChoice_slotId_dishId_key" ON "FormulaChoice"("slotId", "dishId");

-- AddForeignKey
ALTER TABLE "FormulaSlot" ADD CONSTRAINT "FormulaSlot_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "Formula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulaChoice" ADD CONSTRAINT "FormulaChoice_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "FormulaSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulaChoice" ADD CONSTRAINT "FormulaChoice_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
