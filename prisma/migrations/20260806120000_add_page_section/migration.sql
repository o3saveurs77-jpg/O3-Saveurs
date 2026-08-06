-- CreateTable
CREATE TABLE "PageSection" (
    "id" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "contentJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageSection_page_position_idx" ON "PageSection"("page", "position");
