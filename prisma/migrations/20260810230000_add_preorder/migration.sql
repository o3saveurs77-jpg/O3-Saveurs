-- Plats sur commande (gigot, agneau entier, paella…) et validation par le restaurant.
--
-- Purement additif : colonnes avec valeur par défaut, aucun renommage, aucune
-- suppression. Les 55 plats existants restent à `leadTimeHours = 0` — servis au
-- créneau habituel — et les commandes déjà en base à `preorder = false`.

ALTER TABLE "Dish" ADD COLUMN "leadTimeHours" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order" ADD COLUMN "preorder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "scheduledFor" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "refusalReason" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Order_preorder_scheduledFor_idx" ON "Order"("preorder", "scheduledFor");
