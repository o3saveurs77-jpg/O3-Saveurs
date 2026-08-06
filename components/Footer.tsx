import Link from "next/link";
import { Emblem } from "./Brand";
import { Icon } from "./Icon";
import { NewsletterForm } from "./NewsletterForm";
import { info } from "@/lib/menu";

export function Footer() {
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}`;

  return (
    <footer className="bg-footer-bg text-footer-ink">
      <div className="ots-band" />

      <div className="wrap grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.8fr_1fr_1fr] md:py-14">
        {/* marque */}
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3">
            <Emblem size={48} />
            <div>
              <p className="font-display text-xl">Ô 3 Saveurs</p>
              <p className="text-sm text-gold">Chez Laila · Cuisine du monde</p>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-sm opacity-80">{info.baseline}</p>
          {/* Seuls les réseaux dont l'adresse est renseignée sont affichés :
              une icône sans lien est une promesse non tenue. Voir `info.socials`. */}
          {info.socials.some((s) => s.href) && (
            <div className="mt-5 flex gap-3">
              {info.socials
                .filter((s) => s.href)
                .map((s) => (
                  <a
                    key={s.name}
                    href={s.href!}
                    target="_blank"
                    /* `noopener` : sans lui, la page ouverte garde une référence
                       vers celle-ci via `window.opener`. */
                    rel="noopener noreferrer"
                    aria-label={`${info.name} sur ${s.name}`}
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:-translate-y-0.5 hover:bg-white/20"
                  >
                    <Icon name={s.icon} size={20} />
                  </a>
                ))}
            </div>
          )}
        </div>

        {/* navigation */}
        <div>
          <h3 className="mb-4 text-gold">Navigation</h3>
          <ul className="flex flex-col gap-2.5 text-sm opacity-90">
            <li><Link href="/" className="link-underline">Accueil</Link></li>
            <li><Link href="/carte" className="link-underline">La Carte</Link></li>
            {/* Lien direct vers le PDF : accessible depuis n'importe quelle page,
                sans passer par la carte en ligne. */}
            <li>
              <a
                href="/carte-o3-saveurs.pdf"
                download="Carte - O3 Saveurs.pdf"
                className="link-underline inline-flex items-center gap-1.5"
              >
                <Icon name="download" size={14} />
                La carte en PDF
              </a>
            </li>
            <li><Link href="/a-propos" className="link-underline">À propos</Link></li>
            <li><Link href="/contact" className="link-underline">Contact</Link></li>
            <li><Link href="/compte" className="link-underline">Mon compte</Link></li>
          </ul>
        </div>

        {/* coordonnées */}
        <div>
          <h3 className="mb-4 text-gold">Nous trouver</h3>
          <ul className="flex flex-col gap-3 text-sm opacity-90">
            <li className="flex items-start gap-2">
              <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-primary" />
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="link-underline">
                {info.address}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Icon name="phone" size={18} className="shrink-0 text-primary" />
              <a href={`tel:${info.phone.replace(/\s/g, "")}`} className="link-underline">
                {info.phone}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Icon name="truck" size={18} className="shrink-0 text-primary" />
              Livraison & à emporter · {info.partner}
            </li>
          </ul>
        </div>

        {/* horaires */}
        <div>
          <h3 className="mb-4 text-gold">Horaires</h3>
          <ul className="flex flex-col gap-2 text-sm opacity-90">
            {info.hours.map((h) => (
              <li key={h.d} className="flex flex-col">
                <span className="font-semibold">{h.d}</span>
                <span className="text-xs opacity-75">{h.h}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bandeau newsletter + paiement : une bande à part plutôt qu'une
          cinquième colonne — la grille au-dessus était déjà pleine, et ces deux
          blocs ont plus de poids qu'un lien de plus. */}
      <div className="border-t border-white/10 bg-black/15">
        <div className="wrap flex flex-col gap-8 py-10 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <NewsletterForm variant="dark" />
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold/80">
              Moyens de paiement
            </h4>
            <div className="flex flex-wrap gap-2">
              {info.payments.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-footer-ink/90"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="wrap flex flex-col items-center justify-between gap-2 py-5 text-center text-xs opacity-70 sm:flex-row sm:text-left">
          <p>© {new Date().getFullYear()} Ô 3 Saveurs — Chez Laila. Tous droits réservés.</p>
          {/* `flex-wrap` : plusieurs liens en ligne fixe dépassaient la largeur
              d'un écran de 320 px et créaient un défilement latéral. */}
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <Link href="/mentions-legales" className="hover:text-gold">Mentions légales</Link>
            <Link href="/cgv" className="hover:text-gold">CGV</Link>
            <Link href="/confidentialite" className="hover:text-gold">Confidentialité</Link>
            <Link href="/admin" className="hover:text-gold">Back-office</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
