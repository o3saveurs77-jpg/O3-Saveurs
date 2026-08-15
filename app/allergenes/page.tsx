import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/JsonLd";
import { ALLERGENES_PAR_PLAT } from "@/lib/allergenes";
import { cats } from "@/lib/menu";
import { prisma } from "@/lib/prisma";
import { graph, breadcrumbNode } from "@/lib/seo";
import { rowToDish } from "@/lib/serialize";
import type { Dish } from "@/lib/menu";
import { ALLERGEN_LABEL, ALLERGEN_SHORT, ALLERGENS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Tableau des allergènes",
  description:
    "Les 14 allergènes réglementaires plat par plat chez Ô 3 Saveurs — Chez Laila à Pontault-Combault. Information obligatoire au titre du règlement (UE) 1169/2011.",
  alternates: { canonical: "/allergenes" },
  openGraph: {
    title: "Tableau des allergènes · Ô 3 Saveurs — Chez Laila",
    description: "Les 14 allergènes réglementaires, plat par plat.",
    url: "/allergenes",
  },
};

/* Même cadence que la carte : la cuisine corrige ses recettes depuis
 * *Admin → Plats*, et une correction d'allergène ne doit pas attendre. */
export const revalidate = 300;

/**
 * Un plat sans allergène coché recouvre deux situations que la base ne
 * distingue pas : « recette examinée, aucun des quatorze présent » et
 * « personne ne l'a encore examinée ». Les annoncer pareil serait dangereux —
 * déclarer une paella sans allergène parce qu'elle n'a jamais été évaluée
 * expose un client allergique aux crustacés.
 *
 * Faute d'un champ dédié en base, la transcription du tableau remis par la
 * cliente sert de registre des plats réellement examinés. Un plat créé plus
 * tard depuis le back-office en est absent : il s'affichera « non renseigné »
 * tant que personne n'aura coché ses allergènes, ce qui est le bon défaut.
 */
function estEvalue(dish: Dish): boolean {
  return dish.allergens.length > 0 || dish.name in ALLERGENES_PAR_PLAT;
}

async function loadDishes(): Promise<Dish[]> {
  try {
    const rows = await prisma.dish.findMany({
      where: { available: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    return rows.map(rowToDish);
  } catch {
    /* Base indisponible : mieux vaut une page sans tableau, portant la mention
     * légale et le numéro de téléphone, qu'une erreur 500. */
    return [];
  }
}

export default async function AllergenesPage() {
  const dishes = await loadDishes();
  const parCategorie = cats
    .map((c) => ({ cat: c, plats: dishes.filter((d) => d.cat === c.id) }))
    .filter((g) => g.plats.length > 0);

  const nonRenseignes = dishes.filter((d) => !estEvalue(d));

  return (
    <main className="wrap py-8 sm:py-12">
      <JsonLd
        data={graph([
          breadcrumbNode([
            { name: "Accueil", path: "/" },
            { name: "Allergènes", path: "/allergenes" },
          ]),
        ])}
      />

      <h1 className="text-3xl sm:text-4xl">Tableau des allergènes</h1>
      <p className="mt-2 max-w-3xl text-ink-2">
        Information obligatoire au titre du règlement{" "}
        <abbr title="Règlement (UE) n° 1169/2011 concernant l'information des consommateurs sur les denrées alimentaires">
          (UE) 1169/2011
        </abbr>
        . Un point signale un allergène <strong>présent dans la recette</strong>.
      </p>

      {/* Le tableau fait quinze colonnes : il déborde de tout téléphone. On le
          fait défiler dans son propre cadre plutôt que de laisser la page
          entière glisser latéralement. */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">
            Allergènes présents dans chaque plat de la carte, par famille.
          </caption>
          <thead>
            <tr className="bg-panel-2">
              <th scope="col" className="sticky left-0 z-10 bg-panel-2 p-2 text-left font-bold">
                Plat
              </th>
              {ALLERGENS.map((a) => (
                <th
                  key={a}
                  scope="col"
                  title={ALLERGEN_LABEL[a]}
                  className="w-10 p-2 text-center text-xs font-bold"
                >
                  <abbr title={ALLERGEN_LABEL[a]} className="no-underline">
                    {ALLERGEN_SHORT[a]}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>

          {parCategorie.map(({ cat, plats }) => (
            <tbody key={cat.id}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={ALLERGENS.length + 1}
                  className="bg-primary-soft p-2 text-left font-bold text-brick"
                >
                  {cat.label}
                </th>
              </tr>
              {plats.map((d) => {
                const evalue = estEvalue(d);
                return (
                  <tr key={d.id} className="border-t border-line">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-panel p-2 text-left font-normal"
                    >
                      {d.name}
                      {!evalue && (
                        <span className="ml-1.5 whitespace-nowrap text-[11px] font-semibold text-brick">
                          non renseigné
                        </span>
                      )}
                    </th>
                    {ALLERGENS.map((a) => {
                      const present = d.allergens.includes(a);
                      return (
                        <td key={a} className="p-2 text-center">
                          {present ? (
                            <>
                              <span aria-hidden className="text-brick">
                                •
                              </span>
                              <span className="sr-only">
                                {ALLERGEN_LABEL[a]} : présent
                              </span>
                            </>
                          ) : (
                            <span className="sr-only">
                              {ALLERGEN_LABEL[a]} :{" "}
                              {evalue ? "absent" : "non renseigné"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <h2 className="mt-8 text-xl">Légende</h2>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
        {ALLERGENS.map((a) => (
          <li key={a}>
            <strong className="text-ink">{ALLERGEN_SHORT[a]}</strong> — {ALLERGEN_LABEL[a]}
          </li>
        ))}
      </ul>

      {nonRenseignes.length > 0 && (
        <div className="mt-8 rounded-xl border border-line bg-panel p-4">
          <h2 className="text-base font-bold">Plats non renseignés</h2>
          <p className="mt-1 text-sm text-ink-2">
            Nous n'avons pas encore établi la liste des allergènes de{" "}
            {nonRenseignes.map((d) => d.name).join(", ")}. Une case vide n'y
            signifie donc <strong>pas</strong> l'absence d'allergène :
            appelez-nous avant de commander.
          </p>
        </div>
      )}

      <div className="mt-6 rounded-xl border-l-4 border-brick bg-panel p-4">
        <p className="text-sm text-ink-2">
          <strong className="text-ink">Contaminations croisées.</strong> Nos
          plats sont préparés dans une cuisine où sont manipulés les quatorze
          allergènes. Malgré notre vigilance, la présence de traces ne peut être
          exclue. En cas d'allergie sévère, parlez-nous-en avant de commander —
          nous préférons vous le dire que vous exposer.
        </p>
      </div>

      <p className="mt-6 text-sm text-ink-2">
        Voir aussi nos{" "}
        <Link href="/cgv#allergenes" className="font-semibold text-brick underline">
          conditions générales de vente
        </Link>{" "}
        et la{" "}
        <Link href="/carte" className="font-semibold text-brick underline">
          carte complète
        </Link>
        .
      </p>
    </main>
  );
}
