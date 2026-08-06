/* Politique de confidentialité — art. 13 du RGPD.
 *
 * Point vérifié lors de l'audit et volontairement expliqué ici : le site
 * n'embarque **aucun traceur tiers** (ni Google Analytics, ni pixel Meta, ni
 * Matomo), et les polices sont auto-hébergées par `next/font`. Les deux seuls
 * stockages côté client — le cookie de session et le panier en `localStorage` —
 * sont strictement nécessaires au service demandé, donc exemptés de consentement
 * (art. 82 de la loi Informatique et Libertés). C'est pourquoi il n'y a pas de
 * bandeau cookies : en ajouter un serait inutile et nuirait à la conversion.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  LEGAL_UPDATED,
  LegalBody,
  LegalHero,
  LegalSection,
  Value,
  readSettings,
} from "@/components/LegalNotice";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Politique de confidentialité · Ô 3 Saveurs — Chez Laila",
  description:
    "Quelles données nous collectons, pourquoi, combien de temps nous les conservons, et comment exercer vos droits.",
};

/** Un tableau vaut mieux qu'un paragraphe pour l'art. 13 : chaque finalité a sa base légale. */
const TRAITEMENTS = [
  {
    finalite: "Traiter et livrer vos commandes",
    donnees: "Nom, téléphone, email, adresse de livraison, contenu de la commande",
    base: "Exécution du contrat (art. 6.1.b)",
    duree: "3 ans après la dernière commande",
  },
  {
    finalite: "Gérer votre compte client",
    donnees: "Nom, email, téléphone, adresses, favoris",
    base: "Exécution du contrat (art. 6.1.b)",
    duree: "Jusqu'à la suppression du compte",
  },
  {
    finalite: "Émettre et conserver les factures",
    donnees: "Identité, adresse, détail et montant de la commande",
    base: "Obligation légale (art. 6.1.c)",
    duree: "10 ans (art. L123-22 du code de commerce)",
  },
  {
    finalite: "Traiter vos réclamations",
    donnees: "Identité, commande concernée, échanges de messages",
    base: "Intérêt légitime (art. 6.1.f)",
    duree: "3 ans après clôture",
  },
  {
    finalite: "Envoyer la newsletter",
    donnees: "Email, prénom si renseigné",
    base: "Consentement (art. 6.1.a), révocable à tout moment",
    duree: "Jusqu'à désinscription",
  },
  {
    finalite: "Répondre au formulaire de contact",
    donnees: "Nom, email, téléphone si renseigné, message",
    base: "Intérêt légitime (art. 6.1.f)",
    duree: "1 an",
  },
  {
    finalite: "Traiter vos demandes de devis traiteur",
    donnees:
      "Nom, téléphone, email, type d'événement, date, lieu, nombre de convives, message",
    base: "Mesures précontractuelles à votre demande (art. 6.1.b)",
    duree: "3 ans après le dernier échange",
  },
  {
    finalite: "Calculer les frais de livraison et proposer votre adresse",
    donnees: "Adresse saisie au moment de la commande",
    base: "Exécution du contrat (art. 6.1.b)",
    duree: "Non conservée par le prestataire de cartographie",
  },
];

const SOUS_TRAITANTS = [
  {
    nom: "Stripe Payments Europe, Ltd.",
    role: "Traitement des paiements par carte bancaire",
    lieu: "Union européenne (Irlande)",
  },
  {
    nom: "Okta, Inc. (Auth0)",
    role: "Authentification et gestion des comptes clients",
    lieu: "États-Unis — clauses contractuelles types",
  },
  {
    nom: "Google Ireland Limited (Maps Platform)",
    role: "Autocomplétion des adresses de livraison et calcul de la distance routière",
    lieu: "Irlande, avec transferts encadrés par clauses contractuelles types",
  },
  {
    nom: "Neon, Inc.",
    role: "Hébergement de la base de données",
    lieu: "Union européenne (région Europe)",
  },
  {
    nom: "Vercel, Inc.",
    role: "Hébergement du site et stockage des photos",
    lieu: "États-Unis — clauses contractuelles types",
  },
  {
    nom: "Resend, Inc.",
    role: "Envoi des courriels de confirmation, de facture et de la newsletter",
    lieu: "États-Unis — clauses contractuelles types",
  },
];

export default async function ConfidentialitePage() {
  const s = await readSettings();
  const contactEmail = s["restaurant.email"];

  return (
    <>
      <LegalHero
        kicker="Vos données"
        title="Politique de confidentialité"
        intro="Ce que nous collectons, pourquoi, combien de temps nous le gardons, et comment reprendre la main."
      />

      <LegalBody>
        <p className="text-sm text-ink-2">Dernière mise à jour : {LEGAL_UPDATED}.</p>

        <LegalSection id="responsable" title="1. Qui est responsable du traitement ?">
          <p>
            Le responsable du traitement est l&apos;exploitant du restaurant{" "}
            <strong>Ô 3 Saveurs — Chez Laila</strong> :{" "}
            <Value value={s["legal.company"]} what="la dénomination sociale" />, dont les
            coordonnées complètes figurent dans les{" "}
            <Link href="/mentions-legales" className="font-semibold text-brick underline">
              mentions légales
            </Link>
            .
          </p>
          <p>
            Pour toute question sur vos données :{" "}
            <a href={`mailto:${contactEmail}`} className="font-semibold text-brick underline">
              {contactEmail}
            </a>
            .
          </p>
        </LegalSection>

        <LegalSection id="traitements" title="2. Quelles données, pour quoi faire ?">
          <p>
            Nous ne collectons que ce qui est nécessaire pour préparer, livrer et facturer vos
            commandes. Aucune donnée n&apos;est vendue ni cédée à des fins publicitaires.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <caption className="sr-only">
                Finalités, données traitées, bases légales et durées de conservation
              </caption>
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="py-2 pr-3 font-bold">Finalité</th>
                  <th scope="col" className="py-2 pr-3 font-bold">Données</th>
                  <th scope="col" className="py-2 pr-3 font-bold">Base légale</th>
                  <th scope="col" className="py-2 font-bold">Conservation</th>
                </tr>
              </thead>
              <tbody>
                {TRAITEMENTS.map((t) => (
                  <tr key={t.finalite} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-3 font-semibold">{t.finalite}</td>
                    <td className="py-2 pr-3 text-ink-2">{t.donnees}</td>
                    <td className="py-2 pr-3 text-ink-2">{t.base}</td>
                    <td className="py-2 text-ink-2">{t.duree}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Ces durées ne sont pas seulement déclaratives : une purge automatique s&apos;exécute
            chaque nuit et efface ou anonymise ce qui les a dépassées. Les commandes déjà facturées
            font exception le temps des dix ans que la loi comptable impose, puis leur identité est
            retirée à son tour ; seuls les montants et les dates, qui ne désignent plus personne,
            restent alors dans nos comptes.
          </p>

          <p>
            <strong>Votre mot de passe ne nous est jamais transmis.</strong> La connexion est
            déléguée à notre prestataire d&apos;authentification (Auth0, voir le tableau des
            sous-traitants) : nous ne recevons que votre adresse email et votre nom une fois
            l&apos;identification réussie. De la même façon, vos données de carte bancaire ne
            transitent jamais par nos serveurs et ne sont jamais conservées par le restaurant —
            elles sont saisies directement sur la page sécurisée de Stripe.
          </p>
        </LegalSection>

        <LegalSection id="destinataires" title="3. Qui a accès à vos données ?">
          <p>
            En interne, seul le personnel du restaurant, pour les besoins de la préparation, de la
            livraison et de la comptabilité. En externe, uniquement les prestataires techniques
            ci-dessous, qui agissent sur nos instructions et sont liés par un contrat de
            sous-traitance :
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <caption className="sr-only">Sous-traitants et localisation des traitements</caption>
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="py-2 pr-3 font-bold">Prestataire</th>
                  <th scope="col" className="py-2 pr-3 font-bold">Rôle</th>
                  <th scope="col" className="py-2 font-bold">Localisation</th>
                </tr>
              </thead>
              <tbody>
                {SOUS_TRAITANTS.map((st) => (
                  <tr key={st.nom} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-3 font-semibold">{st.nom}</td>
                    <td className="py-2 pr-3 text-ink-2">{st.role}</td>
                    <td className="py-2 text-ink-2">{st.lieu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LegalSection>

        <LegalSection id="cookies" title="4. Cookies et stockage local">
          <p>
            Ce site n&apos;utilise <strong>aucun traceur publicitaire ni outil de mesure
            d&apos;audience tiers</strong>. Il n&apos;y a ni Google Analytics, ni pixel de réseau
            social, ni régie publicitaire. Les polices de caractères sont hébergées sur notre propre
            serveur : votre navigateur ne contacte aucun service externe pour les charger.
          </p>
          <p>Deux éléments seulement sont stockés dans votre navigateur :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Un cookie de session</strong>, déposé uniquement si vous vous connectez à
              votre compte. Il permet de vous maintenir authentifié et expire à la déconnexion ou à
              l&apos;expiration de la session.
            </li>
            <li>
              <strong>Votre panier</strong>, conservé localement dans votre navigateur
              (<code className="rounded bg-panel-2 px-1 text-xs">localStorage</code>) afin de ne pas
              le perdre si vous fermez l&apos;onglet. Il ne quitte votre appareil qu&apos;au moment
              de la commande.
            </li>
          </ul>
          <p>
            Ces deux éléments sont <strong>strictement nécessaires</strong> au service que vous
            demandez. À ce titre, ils sont exemptés de consentement préalable au sens de
            l&apos;article 82 de la loi Informatique et Libertés et des lignes directrices de la
            CNIL. C&apos;est la raison pour laquelle aucun bandeau cookies ne vous est présenté. Si
            un outil de mesure d&apos;audience venait à être ajouté, un bandeau de consentement
            serait mis en place et cette page mise à jour.
          </p>
        </LegalSection>

        <LegalSection id="droits" title="5. Vos droits">
          <p>Vous disposez à tout moment des droits suivants sur vos données :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Accès</strong> : obtenir une copie des données que nous détenons sur vous.
            </li>
            <li>
              <strong>Rectification</strong> : corriger une information inexacte. Vos coordonnées
              sont modifiables directement depuis votre espace client.
            </li>
            <li>
              <strong>Effacement</strong> : demander la suppression de votre compte et de vos
              données, sous réserve des factures que la loi nous oblige à conserver dix ans.
            </li>
            <li>
              <strong>Opposition et limitation</strong> : vous opposer à un traitement fondé sur
              notre intérêt légitime.
            </li>
            <li>
              <strong>Portabilité</strong> : recevoir vos données dans un format lisible par
              machine.
            </li>
            <li>
              <strong>Retrait du consentement</strong> : vous désinscrire de la newsletter en un
              clic, depuis le lien présent dans chaque envoi.
            </li>
          </ul>
          <p>
            Pour exercer ces droits, écrivez à{" "}
            <a href={`mailto:${contactEmail}`} className="font-semibold text-brick underline">
              {contactEmail}
            </a>
            . Nous répondons dans un délai d&apos;un mois.
          </p>
        </LegalSection>

        <LegalSection id="reclamation" title="6. Réclamation auprès de la CNIL">
          <p>
            Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une
            réclamation à la Commission nationale de l&apos;informatique et des libertés :
            CNIL, 3 place de Fontenoy — TSA 80715 — 75334 Paris Cedex 07, ou en ligne sur{" "}
            <a
              href="https://www.cnil.fr/fr/plaintes"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brick underline"
            >
              cnil.fr
            </a>
            .
          </p>
        </LegalSection>

        <LegalSection id="securite" title="7. Sécurité">
          <p>
            Les échanges avec ce site sont chiffrés (HTTPS). Les mots de passe sont stockés sous
            forme d&apos;empreinte irréversible. L&apos;accès aux données de commande est cloisonné :
            un client ne peut consulter que ses propres commandes et ses propres factures, et
            l&apos;administration du restaurant est protégée par une authentification distincte.
          </p>
        </LegalSection>
      </LegalBody>
    </>
  );
}
