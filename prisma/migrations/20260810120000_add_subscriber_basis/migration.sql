-- AlterTable
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "basis" TEXT NOT NULL DEFAULT 'optin';

-- Les abonnés existants viennent tous du formulaire d'inscription avec double
-- opt-in : leur base légale est bien le consentement. La valeur par défaut est
-- donc exacte pour eux, et aucune reprise n'est nécessaire.

-- Index de joignabilité : la sélection des destinataires interroge désormais
-- `unsubscribedAt` avec `confirmed` OU `basis`, sur toute la liste à chaque
-- campagne.
CREATE INDEX "NewsletterSubscriber_basis_confirmed_idx"
  ON "NewsletterSubscriber"("basis", "confirmed", "unsubscribedAt");
