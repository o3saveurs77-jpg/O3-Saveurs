import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/Icon";
import { FormulesClient } from "@/components/formule/FormulesClient";
import { rowToFormula, formulaSupplements } from "@/lib/formulas";
import { fmtPrice } from "@/lib/menu";
import type { Formula } from "@/lib/menu";
import { JsonLd } from "@/components/JsonLd";
import { graph, formulasNode, breadcrumbNode } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Nos Formules",
  description:
    "Formules Express, Midi, Gourmande, Sandwich et Menu Enfant à prix fixe : un plat au choix parmi nos salades, tajines, plats d'Afrique de l'Ouest et grillades, à Pontault-Combault.",
  alternates: { canonical: "/formules" },
  openGraph: {
    title: "Nos Formules · Ô 3 Saveurs — Chez Laila",
    description: "Un plat au choix, une boisson maison — à prix fixe, midi et soir.",
    url: "/formules",
  },
};

/* Même cadence que la carte : les formules bougent au rythme du back-office. */
export const revalidate = 300;

async function loadFormulas(): Promise<Formula[]> {
  try {
    const rows = await prisma.formula.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
      include: {
        slots: {
          orderBy: { position: "asc" },
          include: { choices: { orderBy: { position: "asc" }, include: { dish: true } } },
        },
      },
    });
    return rows.map(rowToFormula);
  } catch (error) {
    // Base indisponible : la page reste lisible plutôt que de rendre une 500.
    console.error("[formules] lecture de la base échouée:", error);
    return [];
  }
}

export default async function FormulesPage() {
  const formulas = await loadFormulas();

  // Mention « Suppléments : … » construite depuis les données, jamais écrite en
  // dur : un supplément modifié au back-office se répercute ici.
  const supplements = [...new Map(formulas.flatMap(formulaSupplements).map((s) => [s.name, s])).values()].sort(
    (a, b) => a.cents - b.cents,
  );

  const jsonLd = graph([
    formulasNode(formulas),
    breadcrumbNode([
      { name: "Accueil", path: "/" },
      { name: "Nos Formules", path: "/formules" },
    ]),
  ]);

  return (
    <>
      <JsonLd data={jsonLd} />
      <header className="relative overflow-hidden bg-panel-2">
        <div className="ots-band" />
        <div className="wrap relative py-12 text-center sm:py-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Plus avantageux qu'à la carte
          </p>
          <h1 className="mt-2 font-display text-4xl text-brick sm:text-5xl">Nos Formules</h1>
          <p className="mx-auto mt-3 max-w-2xl text-ink-2">
            Un plat au choix parmi nos salades &amp; bowls, tajines, plats d'Afrique de l'Ouest,
            méditerranéens et grillades. Boisson : jus pressé ou cocktail maison.
          </p>
          {supplements.length > 0 && (
            <p className="mx-auto mt-2 max-w-2xl text-sm text-ink-2">
              Suppléments :{" "}
              {supplements.map((s, i) => (
                <span key={s.name}>
                  {i > 0 && " · "}
                  {s.name} +{fmtPrice(s.cents)}
                </span>
              ))}
            </p>
          )}
        </div>
      </header>

      <section className="wrap py-12">
        <FormulesClient formulas={formulas} />

        <p className="mt-10 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-ink-2">
          <Icon name="sparkle" size={16} className="text-teal" />
          Envie d'autre chose&nbsp;? Tous nos plats sont aussi commandables à l'unité —
          <Link href="/carte" className="link-underline font-semibold text-primary">
            voir la carte
          </Link>
        </p>
      </section>
    </>
  );
}
