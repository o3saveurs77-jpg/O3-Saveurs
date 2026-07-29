/* Mentions légales — art. 6-III de la loi pour la confiance dans l'économie
 * numérique (LCEN) et art. R123-237 du code de commerce.
 *
 * Les valeurs viennent des réglages : aucune information légale n'est écrite en
 * dur ni inventée. Là où un réglage est vide, la page affiche un encadré
 * « À compléter par le restaurant ».
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  LEGAL_UPDATED,
  LegalBody,
  LegalHero,
  LegalNotice,
  LegalSection,
  Missing,
  MissingBox,
  readSettings,
} from "@/components/LegalNotice";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mentions légales · Ô 3 Saveurs — Chez Laila",
  description:
    "Éditeur du site, informations légales de l'entreprise, hébergeur et responsable de la publication.",
};

export default async function MentionsLegalesPage() {
  const s = await readSettings();
  const tel = s["restaurant.phone"].replace(/\s/g, "");

  return (
    <>
      <LegalHero
        kicker="Informations obligatoires"
        title="Mentions légales"
        intro="Identité de l'éditeur du site, coordonnées et hébergement, conformément à l'article 6-III de la LCEN."
      />

      <LegalBody>
        <LegalSection id="editeur" title="1. Éditeur du site">
          <p>
            Le présent site est édité par l&apos;exploitant du restaurant Ô 3 Saveurs — Chez Laila,
            dont les informations légales sont les suivantes :
          </p>
          <LegalNotice settings={s} />
        </LegalSection>

        <LegalSection id="publication" title="2. Responsable de la publication">
          <p>
            Responsable de la publication et directeur de la rédaction :{" "}
            {s["legal.publisher"] ? (
              <strong>{s["legal.publisher"]}</strong>
            ) : (
              <Missing what="le nom du responsable de la publication" />
            )}
            .
          </p>
          <p>
            Toute demande relative au contenu du site peut être adressée par email à{" "}
            <a href={`mailto:${s["restaurant.email"]}`}>{s["restaurant.email"]}</a> ou par téléphone
            au <a href={`tel:${tel}`}>{s["restaurant.phone"]}</a>.
          </p>
        </LegalSection>

        <LegalSection id="hebergeur" title="3. Hébergement">
          <p>Le site est hébergé par :</p>
          {s["legal.host"] ? (
            <p>
              <strong>{s["legal.host"]}</strong>
            </p>
          ) : (
            <MissingBox
              what="l'identité et l'adresse de l'hébergeur"
              why="L'hébergeur doit être identifiable (art. 6-III 1° c de la LCEN)."
            />
          )}
          <p>
            La base de données est opérée par Neon Inc. (États-Unis) et les paiements par carte par
            Stripe Payments Europe, Ltd. (Irlande). Les transferts de données hors Union européenne
            et les garanties associées sont détaillés dans notre{" "}
            <Link href="/confidentialite">politique de confidentialité</Link>.
          </p>
        </LegalSection>

        <LegalSection id="activite" title="4. Activité et informations sur les produits">
          <p>
            Le site présente la carte du restaurant et permet de commander des repas préparés sur
            place, en livraison ou à emporter. Les prix, les frais de livraison, les zones desservies
            et les délais sont détaillés dans nos{" "}
            <Link href="/cgv">conditions générales de vente</Link>.
          </p>
          <p>
            L&apos;information sur les quatorze allergènes réglementaires est disponible avant toute
            commande, sur la fiche de chaque plat et sur la page{" "}
            <Link href="/allergenes">allergènes</Link>, conformément au règlement (UE) 1169/2011.
          </p>
        </LegalSection>

        <LegalSection id="propriete" title="5. Propriété intellectuelle">
          <p>
            L&apos;ensemble des éléments du site — textes, photographies des plats, logo, charte
            graphique, structure et code — est protégé par le code de la propriété intellectuelle.
            Toute reproduction ou représentation, totale ou partielle, sans autorisation écrite
            préalable est interdite.
          </p>
          <p>
            Les marques et noms de tiers éventuellement cités (Stripe, Uber Eats, Vercel) demeurent
            la propriété de leurs titulaires respectifs.
          </p>
        </LegalSection>

        <LegalSection id="liens" title="6. Liens hypertextes">
          <p>
            Le site peut renvoyer vers des sites tiers. L&apos;éditeur n&apos;exerce aucun contrôle
            sur leur contenu et ne saurait en être tenu responsable.
          </p>
        </LegalSection>

        <LegalSection id="donnees" title="7. Données personnelles et cookies">
          <p>
            Le traitement des données personnelles est décrit dans la{" "}
            <Link href="/confidentialite">politique de confidentialité</Link> : finalités, bases
            légales, durées de conservation, destinataires, et modalités d&apos;exercice de vos
            droits.
          </p>
          <p>
            Le site n&apos;utilise <strong>aucun traceur publicitaire ni outil de mesure
            d&apos;audience tiers</strong>. Les seuls stockages sur votre appareil sont le cookie de
            session, si vous vous connectez à un compte, et votre panier conservé dans le navigateur
            — tous deux strictement nécessaires au service, donc exemptés de consentement. C&apos;est
            la raison pour laquelle aucun bandeau cookies ne vous est présenté.
          </p>
        </LegalSection>

        <LegalSection id="signalement" title="8. Signalement d'un contenu">
          <p>
            Tout contenu que vous estimeriez illicite ou erroné peut être signalé à{" "}
            <a href={`mailto:${s["restaurant.email"]}`}>{s["restaurant.email"]}</a>. Nous nous
            engageons à examiner chaque signalement dans les meilleurs délais.
          </p>
        </LegalSection>

        <p className="text-center text-sm text-ink-2">
          Dernière mise à jour : {LEGAL_UPDATED}.
        </p>
      </LegalBody>
    </>
  );
}
