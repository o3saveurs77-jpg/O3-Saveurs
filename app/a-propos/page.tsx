import type { Metadata } from "next";
import { info } from "@/lib/menu";

export const metadata: Metadata = {
  title: "À propos · Ô 3 Saveurs — Chez Laila",
  description: "L'histoire de Chez Laila : une cuisine du monde généreuse, préparée maison à Lognes.",
};

export default function AProposPage() {
  return (
    <>
      <header className="bg-primary text-white">
        <div className="wrap py-12 text-center">
          <p className="font-script text-3xl text-gold">Chez Laila</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">Notre histoire</h1>
        </div>
        <div className="ots-band" />
      </header>

      <article className="wrap grid gap-10 py-14 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4 text-[17px] leading-relaxed text-ink-2">
          <p>
            <strong className="text-ink">Ô 3 Saveurs — Chez Laila</strong> est née d'une envie
            simple : réunir dans une même assiette les saveurs qui ont bercé notre famille. Trois
            continents, une seule cuisine, faite maison chaque jour.
          </p>
          <p>
            De l'<strong className="text-ink">Afrique de l'Ouest</strong> (tcheb, yassa, mafé,
            athiéké), du <strong className="text-ink">Maghreb</strong> (nos tajines mijotés) et d'
            <strong className="text-ink">Asie</strong> (loc lac, bo bun, banh mì), chaque plat
            raconte un voyage.
          </p>
          <p>
            Nous travaillons des produits frais, des épices choisies et des recettes transmises de
            génération en génération. Le tout livré chez vous ou à emporter, sans rien perdre de la
            générosité de la maison.
          </p>
        </div>

        <aside className="h-fit rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
          <h2 className="text-xl">Informations</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-ink-2">Adresse</dt>
              <dd className="font-semibold">{info.address}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Téléphone</dt>
              <dd className="font-semibold">{info.phone}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Paiements</dt>
              <dd className="font-semibold">{info.payments.join(" · ")}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Livraison</dt>
              <dd className="font-semibold">À domicile, à emporter & {info.partner}</dd>
            </div>
          </dl>
        </aside>
      </article>
    </>
  );
}
