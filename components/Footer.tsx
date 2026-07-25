import Link from "next/link";
import { Emblem } from "./Brand";
import { Icon } from "./Icon";
import { info } from "@/lib/menu";

export function Footer() {
  return (
    <footer className="bg-footer-bg text-footer-ink">
      <div className="ots-band" />
      <div className="wrap grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        {/* marque */}
        <div>
          <div className="flex items-center gap-3">
            <Emblem size={48} />
            <div>
              <p className="font-display text-xl">Ô 3 Saveurs</p>
              <p className="text-sm text-gold">Chez Laila · Cuisine du monde</p>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-sm opacity-80">{info.baseline}</p>
          <div className="mt-5 flex gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
              <Icon name="insta" size={20} />
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
              <Icon name="snap" size={20} />
            </span>
          </div>
        </div>

        {/* coordonnées */}
        <div>
          <h3 className="mb-4 text-gold">Nous trouver</h3>
          <ul className="flex flex-col gap-3 text-sm opacity-90">
            <li className="flex items-start gap-2">
              <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-primary" />
              {info.address}
            </li>
            <li className="flex items-center gap-2">
              <Icon name="phone" size={18} className="shrink-0 text-primary" />
              <a href={`tel:${info.phone.replace(/\s/g, "")}`}>{info.phone}</a>
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

      <div className="border-t border-white/10">
        <div className="wrap flex flex-col items-center justify-between gap-2 py-5 text-xs opacity-70 sm:flex-row">
          <p>© {new Date().getFullYear()} Ô 3 Saveurs — Chez Laila. Tous droits réservés.</p>
          <nav className="flex gap-4">
            <Link href="/carte" className="hover:text-gold">La Carte</Link>
            <Link href="/a-propos" className="hover:text-gold">À propos</Link>
            <Link href="/contact" className="hover:text-gold">Contact</Link>
            <Link href="/admin" className="hover:text-gold">Back-office</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
