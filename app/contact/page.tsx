import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { ContactForm } from "@/components/contact/ContactForm";
import { JsonLd } from "@/components/JsonLd";
import { loadSeoContext } from "@/lib/seoData";
import { graph, restaurantNode, breadcrumbNode, toE164 } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Contact, adresse & horaires",
  description:
    "Adresse, téléphone et horaires d'ouverture du restaurant Ô 3 Saveurs — Chez Laila, 38 rue des Prés Saint-Martin à Pontault-Combault (77340).",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact · Ô 3 Saveurs — Chez Laila",
    description: "Adresse, téléphone et horaires du restaurant à Pontault-Combault.",
    url: "/contact",
  },
};

/* Même cadence que les autres pages vitrine : les coordonnées suivent les
 * réglages du back-office. */
export const revalidate = 300;

export default async function ContactPage() {
  /* La page affichait `info` — les constantes de seed de `lib/menu.ts` —
   * pendant que le pied de page et « À propos » lisaient les réglages. Une
   * cliente changeant son numéro au back-office le voyait donc changer
   * partout *sauf* sur la page Contact.
   *
   * Au-delà de l'incohérence visible, c'est un défaut de référencement à part
   * entière : Google recoupe le triplet nom-adresse-téléphone entre les pages
   * du site et les annuaires, et deux numéros différents sur un même domaine
   * suffisent à faire perdre la confiance accordée à la fiche locale. Une
   * seule source, ici comme ailleurs. */
  const seo = await loadSeoContext();
  const { profile } = seo;
  const address = `${profile.street}, ${profile.zip} ${profile.city}`;

  const jsonLd = graph([
    restaurantNode({
      profile,
      hours: seo.hours,
      zones: seo.zones,
      dishes: seo.dishes,
      acceptsCash: seo.acceptsCash,
      acceptsCard: seo.acceptsCard,
    }),
    breadcrumbNode([
      { name: "Accueil", path: "/" },
      { name: "Contact", path: "/contact" },
    ]),
  ]);

  return (
    <>
      <JsonLd data={jsonLd} />
      <header className="bg-primary text-white">
        <div className="wrap py-12 text-center">
          <p className="font-script text-3xl text-gold">À votre écoute</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">Contact</h1>
        </div>
        <div className="ots-band" />
      </header>

      <div className="wrap grid gap-10 py-14 md:grid-cols-2">
        {/* coordonnées + horaires */}
        <div className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
            <h2 className="mb-4 text-xl">Nous joindre</h2>
            {/* Le microformat h-card double le JSON-LD pour les outils qui ne
                lisent pas le second — et coûte trois attributs. */}
            <ul className="space-y-3 text-[15px]">
              <li className="flex items-start gap-3">
                <Icon name="pin" size={20} className="mt-0.5 shrink-0 text-primary" />
                <address className="not-italic">{address}</address>
              </li>
              <li className="flex items-center gap-3">
                <Icon name="phone" size={20} className="shrink-0 text-primary" />
                <a
                  href={`tel:${toE164(profile.phone)}`}
                  className="font-semibold hover:text-primary"
                >
                  {profile.phone}
                </a>
              </li>
              {profile.email && (
                <li className="flex items-center gap-3">
                  <Icon name="mail" size={20} className="shrink-0 text-primary" />
                  <a href={`mailto:${profile.email}`} className="hover:text-primary">
                    {profile.email}
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
            <h2 className="mb-4 flex items-center gap-2 text-xl">
              <Icon name="clock" size={20} className="text-primary" /> Horaires
            </h2>
            <ul className="space-y-2 text-[15px]">
              {seo.hoursLabels.map((h) => (
                <li
                  key={h.day}
                  className="flex justify-between gap-4 border-b border-line pb-2 last:border-0"
                >
                  <span className="font-semibold">{h.day}</span>
                  <span className="text-right text-ink-2">{h.hours}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* formulaire réel : POST /api/contact → ContactMessage + notification */}
        <ContactForm />
      </div>
    </>
  );
}
