"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Brand";
import { Icon } from "./Icon";
import { useCart } from "./cart/CartContext";
import { CartDrawer } from "./cart/CartDrawer";

const LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/carte", label: "La Carte" },
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
];

export function Nav() {
  const pathname = usePathname();
  const { count, setOpen } = useCart();
  const [mobile, setMobile] = useState(false);

  return (
    <>
      <header className="nav-blur sticky top-0 z-50 border-b border-line">
        <div className="wrap flex h-[68px] items-center justify-between gap-4">
          <Link href="/" onClick={() => setMobile(false)} aria-label="Accueil">
            <Logo />
          </Link>

          {/* nav desktop */}
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-full px-4 py-2 text-[15px] font-semibold transition ${
                    active ? "bg-primary-soft text-primary" : "text-ink hover:bg-panel-2"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/carte"
              className="hidden items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[15px] font-bold text-white transition hover:brightness-105 sm:flex"
            >
              Commander
            </Link>

            {/* compte */}
            <Link
              href="/compte"
              className="grid h-11 w-11 place-items-center rounded-full border border-line bg-panel transition hover:bg-panel-2"
              aria-label="Mon compte"
            >
              <Icon name="user" size={20} />
            </Link>

            {/* bouton panier */}
            <button
              onClick={() => setOpen(true)}
              className="relative grid h-11 w-11 place-items-center rounded-full border border-line bg-panel transition hover:bg-panel-2"
              aria-label="Ouvrir le panier"
            >
              <Icon name="bag" size={20} />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1 text-[11px] font-bold text-white">
                  {count}
                </span>
              )}
            </button>

            {/* burger mobile */}
            <button
              onClick={() => setMobile((v) => !v)}
              className="grid h-11 w-11 place-items-center rounded-full border border-line bg-panel md:hidden"
              aria-label="Menu"
            >
              <Icon name={mobile ? "x" : "menu"} size={20} />
            </button>
          </div>
        </div>

        {/* menu mobile déroulant */}
        {mobile && (
          <nav className="border-t border-line bg-page px-5 py-3 md:hidden">
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
          </nav>
        )}
      </header>

      <CartDrawer />
    </>
  );
}
