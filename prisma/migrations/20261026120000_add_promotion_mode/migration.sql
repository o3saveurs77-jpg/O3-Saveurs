-- Promotion réservée à un mode de commande.
--
-- Le dépliant 2026 annonce « −10 % sur toute la carte à emporter » : une remise
-- qui ne doit pas s'appliquer à une livraison. Colonne nullable, additive :
-- les promotions existantes (NULL) restent valables dans les deux modes.

ALTER TABLE "Promotion" ADD COLUMN "mode" TEXT;
