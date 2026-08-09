"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Brand";
import { Icon } from "./Icon";
import { useCart } from "./cart/CartContext";
import { CartDrawer } from "./cart/CartDrawer";
import { useAuth } from "./providers/AuthContext";

const LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/carte", label: "La Carte" },
  { href: "/formules", label: "Formules" },
  { href: "/traiteur", label: "Traiteur" },
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
];

export function Nav() {
  const pathname = usePathname();
  const { count, setOpen } = useCart();
  const { user, logout } = useAuth();
  const [mobile, setMobile] = useState(false);

  /* Se déconnecter n'existait que sur `/compte` : il fallait deviner qu'il
   * fallait aller là pour en sortir. Le menu du bouton « Compte » l'expose
   * depuis n'importe quelle page. */
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  // Le menu ne doit pas rester ouvert par-dessus la page suivante.
  useEffect(() => {
    setAccountOpen(false);
    setMobile(false);
  }, [pathname]);

  /**
   * Déconnexion puis retour à l'accueil, en rechargement complet.
   *
   * `signOut` efface le cookie mais les pages déjà rendues côté serveur
   * gardent la session dans leur HTML : sans ce rechargement, on restait sur
   * un écran qui affiche encore son nom et ses commandes, et on pouvait
   * croire la déconnexion sans effet.
   */
  /* `/compte` renvoie une administratrice vers le back-office : sans ce
   * paramètre, « Mon compte » la ferait rebondir sur `/admin` et son espace
   * client deviendrait inatteignable. */
  const accountHref = user?.role === "ADMIN" ? "/compte?client=1" : "/compte";

  const handleLogout = async () => {
    setAccountOpen(false);
    setMobile(false);
    await logout();
    window.location.assign("/");
  };

  return (
    <>
      <header className="nav-blur sticky top-0 z-50 border-b border-line">
        <div className="wrap flex h-[68px] items-center justify-between gap-2 sm:gap-4">
          {/* `min-w-0 shrink` : sans lui le logo gardait sa largeur naturelle et
              poussait les trois boutons ronds hors de l'écran sous 360 px — le
              `truncate` interne de `Logo` n'avait jamais l'occasion d'agir. */}
          <Link
            href="/"
            onClick={() => setMobile(false)}
            aria-label="Accueil"
            className="min-w-0 shrink"
          >
            <Logo />
          </Link>

          {/* nav desktop */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
            {LINKS.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-[15px] font-semibold transition ${
                    // `text-primary` sur `bg-primary-soft` plafonne à 2,48:1, sous
                    // le seuil WCAG AA. `text-brick` sur le même fond passe.
                    active ? "bg-primary-soft text-brick" : "text-ink hover:bg-panel-2"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          {/* `shrink-0` : le groupe d'actions est la partie incompressible de la
              barre, c'est le logo qui doit céder de la place, pas l'inverse. */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/carte"
              className="hidden items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[15px] font-bold text-white transition hover:brightness-105 sm:flex"
            >
              Commander
            </Link>

            {/* compte — icône seule sous sm, pilule icône + texte à partir de sm.
                Connecté, la pilule ouvre un menu ; le petit bouton mobile reste
                un simple lien, le menu de déconnexion vivant dans le burger. */}
            <Link
              href="/compte"
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel transition hover:bg-panel-2 sm:hidden"
              aria-label="Mon compte"
            >
              <Icon name="user" size={20} />
            </Link>

            {user ? (
              <div ref={accountRef} className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => setAccountOpen((v) => !v)}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2.5 text-[15px] font-semibold text-ink transition hover:bg-panel-2"
                >
                  <Icon name="user" size={18} />
                  Compte
                  <Icon
                    name="chevDown"
                    size={15}
                    className={`transition ${accountOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {accountOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+8px)] w-64 overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-lg)]"
                  >
                    <p className="truncate border-b border-line px-4 py-3 text-sm text-ink-2">
                      Connecté en tant que
                      <span className="block truncate font-bold text-ink">{user.email}</span>
                    </p>

                    <Link
                      href={accountHref}
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold hover:bg-panel-2"
                    >
                      <Icon name="user" size={17} className="text-primary" /> Mon compte
                    </Link>

                    {user.role === "ADMIN" && (
                      <Link
                        href="/admin"
                        role="menuitem"
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold hover:bg-panel-2"
                      >
                        <Icon name="settings" size={17} className="text-primary" /> Back-office
                      </Link>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-left text-sm font-semibold text-brick hover:bg-brick/10"
                    >
                      <Icon name="lock" size={17} /> Se déconnecter
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/compte"
                className="hidden items-center gap-2 rounded-full border border-line bg-panel px-4 py-2.5 text-[15px] font-semibold text-ink transition hover:bg-panel-2 sm:flex"
              >
                <Icon name="user" size={18} />
                Compte
              </Link>
            )}

            {/* bouton panier */}
            <button
              onClick={() => setOpen(true)}
              className="relative grid h-10 w-10 place-items-center rounded-full bg-primary text-white transition hover:brightness-105 sm:h-11 sm:w-11"
              aria-label="Ouvrir le panier"
            >
              <Icon name="bag" size={20} />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1 text-[11px] font-bold text-white ring-2 ring-panel">
                  {count}
                </span>
              )}
            </button>

            {/* burger mobile */}
            <button
              onClick={() => setMobile((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel md:hidden"
              aria-label="Menu"
              aria-expanded={mobile}
              aria-controls="nav-mobile"
            >
              <Icon name={mobile ? "x" : "menu"} size={20} />
            </button>
          </div>
        </div>

        {/* menu mobile déroulant */}
        {mobile && (
          <nav
            id="nav-mobile"
            className="border-t border-line bg-page px-4 py-3 md:hidden"
            aria-label="Navigation principale"
          >
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobile(false)}
                className="block rounded-lg px-3 py-3 font-semibold hover:bg-panel-2"
              >
                {l.label}
              </Link>
            ))}
            {/* Le bouton « Commander » de la barre est masqué sous 640 px : sans
                ce relais, l'appel à l'action principal du site n'existait nulle
                part sur téléphone. */}
            <Link
              href="/carte"
              onClick={() => setMobile(false)}
              className="mt-2 flex items-center justify-center rounded-full bg-primary px-5 py-3 font-bold text-white sm:hidden"
            >
              Commander
            </Link>

            {/* Le menu compte de la barre n'existe qu'à partir de 640 px : sans
                ce relais, se déconnecter depuis un téléphone obligeait à passer
                par la page « Mon compte ». */}
            {user && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="truncate px-3 pb-1 text-xs text-ink-2">{user.email}</p>
                <Link
                  href={accountHref}
                  onClick={() => setMobile(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-3 font-semibold hover:bg-panel-2"
                >
                  <Icon name="user" size={17} className="text-primary" /> Mon compte
                </Link>
                {user.role === "ADMIN" && (
                  <Link
                    href="/admin"
                    onClick={() => setMobile(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-3 font-semibold hover:bg-panel-2"
                  >
                    <Icon name="settings" size={17} className="text-primary" /> Back-office
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left font-semibold text-brick hover:bg-brick/10"
                >
                  <Icon name="lock" size={17} /> Se déconnecter
                </button>
              </div>
            )}
          </nav>
        )}
      </header>

      <CartDrawer />
    </>
  );
}
