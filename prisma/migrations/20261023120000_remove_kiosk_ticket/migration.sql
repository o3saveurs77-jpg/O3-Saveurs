-- Abandon de la borne de commande : retrait du numéro d'attente.
--
-- `add_kiosk_ticket` avait été appliquée en production le 13 octobre 2026, puis
-- la borne a quitté le dépôt sans jamais avoir été déployée. Vérifié avant
-- suppression : aucune commande ne porte de numéro d'attente ni le mode
-- « sur_place ». Rien n'est perdu.

DROP INDEX IF EXISTS "Order_ticketDate_ticketNumber_key";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "ticketNumber";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "ticketDate";
