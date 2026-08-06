import type { Metadata } from "next";
import { MenuClient } from "@/components/menu/MenuClient";
import { CarteActions } from "@/components/menu/CarteActions";
import { prisma } from "@/lib/prisma";
import { rowToDish } from "@/lib/serialize";
import { fmtPrice } from "@/lib/menu";
import type { Dish } from "@/lib/menu";
import { loadDailySpecial } from "@/lib/dailySpecial";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = {
  title: "La Carte · Ô 3 Saveurs — Chez Laila",
  description:
    "Découvrez toute la carte : saveurs africaines, maghrébines et méditerranéennes, grillades, sandwichs, boissons maison et desserts.",
  alternates: { canonical: "/carte" },
};

/* Même cadence que l'accueil : la carte change au rythme des réglages du
 * back-office, pas à celui des visites. */
export const revalidate = 300;

/** Catalogue lu en base pour la première peinture (voir `MenuClient`). */
async function loadDishes(): Promise<Dish[]> {
  try {
    const rows = await prisma.dish.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    return rows.map(rowToDish);
  } catch (error) {
    /* Base indisponible : on sert la page sans plats plutôt qu'une erreur 500.
     * `DishesProvider` retentera côté navigateur et signalera l'échec. */
    console.error("[carte] lecture de la base échouée:", error);
    return [];
  }
}

export default async function CartePage() {
  const [dishes, platToday] = await Promise.all([loadDishes(), loadDailySpecial().catch(() => null)]);

  return (
    <>
      <header className="relative overflow-hidden bg-primary text-white">
        <div className="ots-band flip" />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_80%_10%,color-mix(in_oklab,var(--color-gold)_30%,transparent),transparent_60%)]"
          aria-hidden="true"
        />
        <div className="wrap relative py-12 text-center">
          <p className="font-script text-3xl text-gold">Bienvenue à table</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">La Carte</h1>
          <p className="mx-auto mt-3 max-w-xl text-white/90">
            Afrique · Maghreb · Méditerranée — tout est préparé maison. Composez votre commande, en
            livraison ou à emporter.
          </p>

          {/* Plat du jour.
              Il n'était annoncé que sur l'accueil : un visiteur arrivant
              directement sur la Carte — depuis un lien, une recherche — ne le
              voyait jamais.
              Aucun bouton d'ajout ici : les plats du jour du catalogue sont des
              annonces libres (`dishId` nul, sans prix), rien à mettre au panier.
              Un bouton serait un bouton mort. */}
          {platToday && (
            <div className="mx-auto mt-7 flex max-w-lg flex-col items-center gap-1.5 rounded-[var(--radius-card)] border border-white/25 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gold">
                <Icon name="sparkle" size={14} /> Plat du jour · {platToday.jour}
              </p>
              <p className="font-script text-3xl text-white">{platToday.name}</p>
              <p className="text-sm text-white/85">
                Préparé en quantité limitée — uniquement aujourd'hui
                {platToday.priceCents !== null && <> · {fmtPrice(platToday.priceCents)}</>}.
              </p>
            </div>
          )}

          {/* Emporter la carte : PDF officiel et QR code. Placé sous le plat du
              jour — c'est un service annexe, il ne doit pas passer devant
              l'annonce du jour ni devant le catalogue lui-même. */}
          <CarteActions />
        </div>
      </header>

      <MenuClient initial={dishes} />
    </>
  );
}
