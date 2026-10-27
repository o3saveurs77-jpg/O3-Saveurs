-- Paliers de livraison : durée maximale du trajet, en minutes.
-- Facultative : un palier sans durée ne borne que la distance, comme avant.
-- Ajout pur, sans valeur par défaut ni réécriture : les paliers existants
-- facturent exactement comme avant tant que rien n'est saisi.
ALTER TABLE "DeliveryTier" ADD COLUMN "maxMinutes" DOUBLE PRECISION;
