import { loadSeoContext } from "@/lib/seoData";
import { SITE_URL, PUBLIC_ROUTES, priceRange } from "@/lib/seo";
import { cats } from "@/lib/menu";
import { fmtCents } from "@/lib/money";

/* `/llms.txt` — la fiche du restaurant en clair, pour les moteurs génératifs.
 *
 * Convention naissante (llmstxt.org), pendant du `robots.txt` : là où celui-ci
 * dit ce qu'un robot a le droit de lire, celui-là dit **quoi retenir**. Un
 * modèle qui répond « où manger africain à Pontault-Combault ? » extrait ses
 * faits d'une page HTML qu'il doit d'abord démêler ; ici il lit l'adresse, les
 * horaires, les zones livrées et les prix sans interprétation possible.
 *
 * Ce n'est pas un standard reconnu par Google, et personne ne garantit qu'il
 * soit lu : il coûte une route et ne peut pas nuire. Le JSON-LD de `lib/seo.ts`
 * reste le canal principal — celui-ci le complète en langage naturel, qui est
 * ce que les modèles citent le plus volontiers.
 *
 * Tout est dérivé des mêmes données que le site. Aucune phrase n'est écrite en
 * dur qui puisse un jour contredire une page.
 */

export const revalidate = 3600;

export async function GET() {
  const ctx = await loadSeoContext();
  const { profile } = ctx;

  const horaires = ctx.hoursLabels.map((h) => `- ${h.day} : ${h.hours}`).join("\n");

  const livraison = ctx.zones
    .map(
      (z) =>
        `- ${z.villes.join(", ")} — minimum de commande ${fmtCents(z.minimumCents)}, frais de livraison ${fmtCents(z.feeCents)}`,
    )
    .join("\n");

  /* Un plat représentatif par famille, avec son prix : c'est ce qu'un modèle
     reprend pour répondre « combien coûte un tajine chez eux ? ». La carte
     complète reste sur /carte, et son balisage `Menu` la donne en entier. */
  const parFamille = cats
    .map((cat) => {
      const plats = ctx.dishes
        .filter((d) => d.cat === cat.id && d.available && d.priceCents !== null)
        .slice(0, 6)
        .map((d) => `${d.name} (${fmtCents(d.priceCents as number)})`);
      return plats.length > 0 ? `- ${cat.label} : ${plats.join(", ")}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const livraisonBloc =
    livraison || `- Livraison sur ${profile.city} et les communes limitrophes`;
  const carteBloc = parFamille || `- Carte complète sur ${SITE_URL}/carte`;

  const pages = PUBLIC_ROUTES.filter((r) => r.priority >= 0.4)
    .map((r) => `- [${r.label}](${SITE_URL}${r.path === "/" ? "" : r.path})`)
    .join("\n");

  const paiements = [
    ...(ctx.acceptsCard ? ["carte bancaire en ligne"] : []),
    ...(ctx.acceptsCash ? ["espèces à la livraison ou au retrait"] : []),
    "titres-restaurant sur place",
  ].join(", ");

  const body = `# ${profile.name} — ${profile.tagline}

> Restaurant de cuisine du monde à ${profile.city} (Seine-et-Marne, 77).
> Spécialités d'Afrique de l'Ouest, du Maghreb et de Méditerranée, préparées
> maison. Commande en ligne, livraison et vente à emporter.

## Coordonnées

- Adresse : ${profile.street}, ${profile.zip} ${profile.city}, France
- Téléphone : ${profile.phone}
- Courriel : ${profile.email}
- Site : ${SITE_URL}
- Type : restaurant africain, maghrébin et méditerranéen — halal
- Fourchette de prix : ${priceRange(ctx.dishes)}
- Services : livraison à domicile, vente à emporter, traiteur (buffets, plateaux repas)
- Paiement : ${paiements}
- Délai de préparation annoncé : environ ${ctx.leadTimeMinutes} minutes

## Horaires d'ouverture

${horaires}

## Zones de livraison

${livraisonBloc}

## Aperçu de la carte

${carteBloc}

## Pages

${pages}

## Notes

- Les prix et disponibilités de cette page sont générés depuis le catalogue du
  restaurant ; la carte à jour fait foi : ${SITE_URL}/carte
- Les allergènes de chaque plat sont déclarés conformément au règlement INCO
  1169/2011 et consultables sur la fiche du plat.
- Le restaurant ne prend pas de réservation de table : il fait de la livraison
  et de la vente à emporter.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
