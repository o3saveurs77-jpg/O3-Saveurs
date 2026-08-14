/* Conditions générales de vente.
 *
 * Obligatoires pour la vente à distance (art. L221-5 et L111-1 du code de la
 * consommation). Le point le plus coûteux à omettre est l'article 10 :
 * l'exclusion du droit de rétractation pour les denrées périssables
 * (art. L221-28 3°) n'est **opposable que si elle figure dans des CGV acceptées
 * avant paiement**. Sans elles, chaque client pouvait légalement exiger le
 * remboursement d'un repas déjà livré et consommé.
 *
 * Les zones et les frais sont lus en base, pas écrits en dur : ils doivent
 * refléter ce que le client paie réellement au tunnel de commande.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { rowToZone } from "@/lib/serialize";
import { fmtCents, fmtVatRate } from "@/lib/money";
import type { Zone } from "@/lib/menu";
import {
  LEGAL_UPDATED,
  LegalBody,
  LegalHero,
  LegalSection,
  Missing,
  MissingBox,
  Value,
  readSettings,
} from "@/components/LegalNotice";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description:
    "Conditions de commande, prix, livraison, paiement, réclamations et droit de rétractation.",
  alternates: { canonical: "/cgv" },
};

async function readZones(): Promise<Zone[]> {
  try {
    const rows = await prisma.zone.findMany({
      where: { active: true },
      orderBy: { idx: "asc" },
    });
    return rows.map(rowToZone);
  } catch {
    // Base indisponible : la page doit rester lisible, en signalant le manque
    // plutôt qu'en affichant des tarifs inventés.
    return [];
  }
}

export default async function CgvPage() {
  const [s, zones] = await Promise.all([readSettings(), readZones()]);
  const vatRateBp = Number(s["vat.rateBp"]) || 1000;
  const mediator = s["legal.mediator"];

  return (
    <>
      <LegalHero
        kicker="Vente à distance"
        title="Conditions générales de vente"
        intro="Elles régissent toute commande passée sur ce site, en livraison comme à emporter. En validant votre commande, vous les acceptez."
      />

      <LegalBody>
        <p className="text-sm text-ink-2">Dernière mise à jour : {LEGAL_UPDATED}.</p>

        <LegalSection id="objet" title="1. Objet et champ d'application">
          <p>
            Les présentes conditions générales de vente régissent les ventes de plats préparés
            réalisées à distance sur ce site par l&apos;exploitant du restaurant{" "}
            <strong>Ô 3 Saveurs — Chez Laila</strong>, dont les informations légales figurent dans
            les <Link href="/mentions-legales" className="font-semibold text-brick underline">mentions légales</Link>.
          </p>
          <p>
            Elles s&apos;appliquent à toute commande, en livraison à domicile comme en retrait sur
            place. Toute commande implique leur acceptation sans réserve, matérialisée par la case à
            cocher présentée avant le paiement.
          </p>
        </LegalSection>

        <LegalSection id="commande" title="2. Passation de la commande">
          <p>
            Le client sélectionne ses plats, renseigne ses coordonnées et son adresse, choisit un
            créneau puis un moyen de paiement. Le récapitulatif affiché avant validation indique le
            détail des articles, les éventuelles remises, les frais de livraison et le montant total
            à payer.
          </p>
          <p>
            La commande n&apos;est définitive qu&apos;après confirmation du paiement, ou après
            validation de la commande pour un règlement en espèces sur place. Un courriel de
            confirmation récapitulant la commande est alors adressé au client.
          </p>
          <p>
            Le restaurant se réserve le droit de refuser ou d&apos;annuler une commande en cas
            d&apos;indisponibilité d&apos;un plat, d&apos;adresse manifestement erronée, de
            défaut de paiement, ou de commande anormale au regard des quantités habituelles.
          </p>
        </LegalSection>

        <LegalSection id="disponibilite" title="3. Disponibilité des plats">
          <p>
            Les plats sont préparés à la commande, dans la limite des stocks disponibles. Un plat
            épuisé est retiré de la carte automatiquement. Si un plat devient indisponible après la
            validation de la commande, le restaurant en informe le client et lui propose un
            remplacement ou le remboursement du plat concerné.
          </p>
        </LegalSection>

        <LegalSection id="prix" title="4. Prix">
          <p>
            Les prix sont indiqués en euros, <strong>toutes taxes comprises</strong>. Le taux de TVA
            dépend du produit : {fmtVatRate(vatRateBp)} pour la restauration à emporter et livrée,{" "}
            {fmtVatRate(550)} pour les boissons non alcoolisées vendues en contenant fermé. Le détail
            par taux figure sur la facture. Les frais de livraison sont indiqués séparément avant la
            validation de la commande et s&apos;ajoutent au montant des plats.
          </p>
          <p>
            Le restaurant peut modifier ses prix à tout moment. Le prix applicable est celui affiché
            au moment de la validation de la commande.
          </p>
        </LegalSection>

        <LegalSection id="livraison" title="5. Livraison, zones et minimum de commande">
          <p>
            La livraison est assurée par le restaurant sur les communes listées ci-dessous. La zone
            applicable est déterminée par le <strong>code postal</strong> de l&apos;adresse de
            livraison. Chaque zone comporte des frais de livraison et un minimum de commande.
          </p>

          {zones.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-sm">
                <caption className="sr-only">
                  Frais de livraison et minimum de commande par zone
                </caption>
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="py-2 pr-3 font-bold">Zone</th>
                    <th scope="col" className="py-2 pr-3 font-bold">Communes desservies</th>
                    <th scope="col" className="py-2 pr-3 font-bold">Frais</th>
                    <th scope="col" className="py-2 font-bold">Minimum</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z) => (
                    <tr key={z.idx} className="border-b border-line/60 align-top">
                      <td className="py-2 pr-3 font-semibold">Zone {z.idx + 1}</td>
                      <td className="py-2 pr-3 text-ink-2">{z.villes.join(", ")}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtCents(z.feeCents)}</td>
                      <td className="py-2 whitespace-nowrap">{fmtCents(z.minimumCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <MissingBox
              what="les zones de livraison, les frais et les minimums de commande"
              why="Ces informations sont lues dans le back-office (Réglages → Zones). Elles doivent être renseignées avant l'ouverture des commandes, car elles engagent le restaurant sur le prix annoncé."
            />
          )}

          <p>
            Les délais annoncés sont indicatifs et dépendent de l&apos;affluence et des conditions
            de circulation. Le client s&apos;engage à être joignable au numéro communiqué et à
            réceptionner sa commande au créneau choisi. En cas d&apos;absence à la livraison, le
            restaurant conserve la commande pendant la durée du service et le montant reste dû.
          </p>
          <p>
            Toute commande hors des zones desservies est refusée au moment de la validation. Le
            retrait sur place reste possible sans frais et sans minimum.
          </p>
        </LegalSection>

        <LegalSection id="horaires" title="6. Horaires">
          <p>
            Les commandes ne peuvent être passées que pendant les heures de service. Les créneaux
            proposés au moment de la commande correspondent aux services réellement ouverts, en
            tenant compte du délai de préparation. Aucune commande n&apos;est acceptée en dehors de
            ces plages.
          </p>
        </LegalSection>

        <LegalSection id="paiement" title="7. Paiement">
          <p>
            Le paiement s&apos;effectue au choix par carte bancaire en ligne, via notre prestataire
            de paiement sécurisé <strong>Stripe</strong>, ou en espèces au moment de la livraison ou
            du retrait, lorsque cette option est proposée.
          </p>
          <p>
            Les données de carte bancaire ne transitent jamais par nos serveurs et ne sont jamais
            conservées par le restaurant : la saisie a lieu sur une page hébergée par Stripe. Le
            montant débité est celui recalculé par nos serveurs à partir des prix en vigueur, et il
            correspond au récapitulatif affiché avant validation.
          </p>
          <p>
            En cas de refus d&apos;autorisation de paiement, la commande est automatiquement
            annulée.
          </p>
        </LegalSection>

        <LegalSection id="facture" title="8. Facture">
          <p>
            Une facture numérotée est émise pour chaque commande réglée et reste consultable depuis
            l&apos;espace client. Elle mentionne le détail des articles, le montant hors taxes, la
            TVA ventilée par taux applicable et le total toutes taxes comprises.
          </p>
        </LegalSection>

        <LegalSection id="allergenes" title="9. Allergènes et information sur les denrées">
          <p>
            Conformément au règlement (UE) n° 1169/2011, l&apos;information relative aux
            quatorze allergènes réglementaires est mise à disposition avant la conclusion de la
            commande. Elle figure sur la fiche de chaque plat et sur la page{" "}
            <Link href="/allergenes" className="font-semibold text-brick underline">
              allergènes
            </Link>
            .
          </p>
          <p>
            Nos plats sont préparés dans une cuisine où sont manipulés l&apos;ensemble de ces
            allergènes : la présence de traces ne peut pas être totalement exclue. En cas
            d&apos;allergie sévère, nous invitons le client à nous appeler avant de commander au{" "}
            <a
              href={`tel:${s["restaurant.phone"].replace(/\s/g, "")}`}
              className="font-semibold text-brick underline"
            >
              {s["restaurant.phone"]}
            </a>
            .
          </p>
        </LegalSection>

        {/* L'article le plus important de ces CGV. */}
        <LegalSection id="retractation" title="10. Droit de rétractation">
          <p className="rounded-xl border border-brick/40 bg-primary-soft p-4 font-semibold text-brick">
            Conformément à l&apos;article L221-28 3° du code de la consommation, le droit de
            rétractation ne peut pas être exercé pour les biens susceptibles de se détériorer ou de
            se périmer rapidement. Les plats préparés commandés sur ce site étant des denrées
            alimentaires périssables, <strong>aucun droit de rétractation ne s&apos;applique</strong>{" "}
            une fois la commande confirmée.
          </p>
          <p>
            Cette exclusion ne fait pas obstacle aux droits du client en cas de non-conformité de la
            commande : voir l&apos;article suivant.
          </p>
        </LegalSection>

        <LegalSection id="reclamations" title="11. Réclamations, annulation et remboursement">
          <p>
            Une commande peut être annulée sans frais tant que sa préparation n&apos;a pas commencé.
            Passé ce stade, elle reste due. Le client est informé de l&apos;avancement de sa
            commande par courriel et depuis la page de suivi.
          </p>
          <p>
            En cas de plat manquant, d&apos;erreur de commande, de retard important ou de problème
            de qualité, le client est invité à déposer une réclamation depuis son espace client, ou
            à contacter directement le restaurant, <strong>dans les 24 heures</strong> suivant la
            livraison. Selon le cas, le restaurant propose le remplacement du plat, un
            remboursement partiel ou total, ou un geste commercial.
          </p>
          <p>
            Les remboursements sont effectués par le même moyen de paiement que celui utilisé pour
            la commande, dans un délai de quatorze jours à compter de l&apos;accord.
          </p>
        </LegalSection>

        {/* La page Traiteur affiche des engagements chiffrés — devis sous 24 h,
            acompte de 30 %, solde à J-7 — qu'aucune clause ne couvrait : ces
            prestations ne relèvent ni du même mode de conclusion, ni de la même
            exclusion de rétractation que la vente de plats à emporter. */}
        <LegalSection id="traiteur" title="12. Prestations traiteur">
          <p>
            Les prestations traiteur présentées sur la page{" "}
            <Link href="/traiteur" className="font-semibold text-brick underline">
              Traiteur
            </Link>{" "}
            ne sont pas vendues en ligne. Le formulaire de cette page constitue une{" "}
            <strong>demande de devis</strong> : il n&apos;engage ni le client ni le restaurant et ne
            vaut pas commande.
          </p>
          <p>
            Le restaurant adresse une proposition chiffrée sous vingt-quatre heures ouvrées. Le
            contrat n&apos;est formé qu&apos;à l&apos;acceptation écrite de ce devis, qui précise la
            composition de la prestation, le nombre de convives, la date, le lieu, le prix et la
            durée de validité de l&apos;offre.
          </p>
          <p>
            <strong>Acompte.</strong> Un acompte de 30 % du montant du devis est demandé à son
            acceptation ; la date de l&apos;événement n&apos;est réservée qu&apos;à compter de son
            encaissement. S&apos;agissant d&apos;un acompte et non d&apos;arrhes au sens de
            l&apos;article L214-1 du code de la consommation, il vaut engagement ferme des deux
            parties. Le solde est réglable jusqu&apos;à sept jours avant la date de
            l&apos;événement.
          </p>
          <p>
            <strong>Modification et annulation.</strong> Le nombre de convives peut être ajusté
            jusqu&apos;à sept jours avant l&apos;événement, dans les limites indiquées au devis. Les
            conditions d&apos;annulation, de report et de retenue sur acompte sont celles fixées au
            devis accepté. En cas de force majeure empêchant l&apos;exécution, le restaurant propose
            un report ou rembourse les sommes versées.
          </p>
          <p className="rounded-xl border border-brick/40 bg-primary-soft p-4 font-semibold text-brick">
            Conformément à l&apos;article L221-28 12° du code de la consommation, le droit de
            rétractation ne s&apos;applique pas aux prestations de restauration devant être fournies
            à une date déterminée. Une prestation traiteur retenue pour une date donnée
            n&apos;ouvre donc pas de droit de rétractation.
          </p>
        </LegalSection>

        <LegalSection id="responsabilite" title="13. Responsabilité">
          <p>
            Le restaurant est responsable de la conformité et de la qualité des plats livrés. Sa
            responsabilité ne peut être engagée en cas de force majeure, de renseignement erroné
            fourni par le client — notamment une adresse ou un numéro de téléphone inexact —, ni en
            cas de conservation ou de réchauffage inapproprié après la livraison.
          </p>
          <p>
            Les plats sont destinés à une consommation immédiate. Ils doivent être consommés dans
            les deux heures suivant la livraison ou le retrait, ou conservés au réfrigérateur et
            consommés dans les vingt-quatre heures.
          </p>
        </LegalSection>

        <LegalSection id="donnees" title="14. Données personnelles">
          <p>
            Le traitement des données personnelles collectées lors d&apos;une commande est décrit
            dans notre{" "}
            <Link href="/confidentialite" className="font-semibold text-brick underline">
              politique de confidentialité
            </Link>
            .
          </p>
        </LegalSection>

        <LegalSection id="mediation" title="15. Médiation de la consommation">
          <p>
            Conformément à l&apos;article L612-1 du code de la consommation, le client a le droit de
            recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable
            d&apos;un litige, après avoir adressé une réclamation écrite au restaurant.
          </p>
          <p>
            Médiateur compétent :{" "}
            {mediator ? (
              <Value value={mediator} what="le médiateur de la consommation" />
            ) : (
              <Missing what="le médiateur de la consommation (adhésion obligatoire)" />
            )}
            .
          </p>
          {!mediator && (
            <MissingBox
              what="l'adhésion à un médiateur de la consommation"
              why="L'adhésion à un dispositif de médiation est une obligation légale pour tout professionnel vendant à des consommateurs (art. L612-1). Le nom et les coordonnées du médiateur doivent figurer ici et sur les bons de commande."
            />
          )}
        </LegalSection>

        <LegalSection id="droit" title="16. Droit applicable et litiges">
          <p>
            Les présentes conditions sont soumises au droit français. En cas de litige, et après
            échec d&apos;une résolution amiable ou d&apos;une médiation, les tribunaux français sont
            seuls compétents.
          </p>
        </LegalSection>

        <LegalSection id="contact" title="17. Contact">
          <p>
            Pour toute question relative à une commande ou aux présentes conditions :{" "}
            <a
              href={`tel:${s["restaurant.phone"].replace(/\s/g, "")}`}
              className="font-semibold text-brick underline"
            >
              {s["restaurant.phone"]}
            </a>{" "}
            ·{" "}
            <a
              href={`mailto:${s["restaurant.email"]}`}
              className="font-semibold text-brick underline"
            >
              {s["restaurant.email"]}
            </a>{" "}
            ·{" "}
            <Link href="/contact" className="font-semibold text-brick underline">
              formulaire de contact
            </Link>
            .
          </p>
        </LegalSection>
      </LegalBody>
    </>
  );
}
