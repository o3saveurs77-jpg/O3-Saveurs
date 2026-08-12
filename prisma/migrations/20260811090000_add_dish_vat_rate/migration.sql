-- Taux de TVA par plat.
--
-- Additif et sans rupture : les 61 plats existants restent à 1000 (10 %), qui
-- était jusqu'ici le taux unique de toutes les commandes. Les commandes déjà
-- passées ne sont pas touchées — elles portent leur propre `vatRateBp`, figé à
-- l'émission de la facture, et une facture ne se réécrit pas.
--
-- Le passage des boissons à 550 (5,5 %) se fait dans un second temps, en
-- données, pour rester révocable sans migration.

ALTER TABLE "Dish" ADD COLUMN "vatRateBp" INTEGER NOT NULL DEFAULT 1000;
