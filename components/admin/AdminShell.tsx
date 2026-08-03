"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Emblem } from "@/components/Brand";
import { Icon, type IconName } from "@/components/Icon";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** Regroupé par métier : le quotidien d'abord, la configuration ensuite. */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Pilotage",
    items: [
      { href: "/admin", label: "Vue d'ensemble", icon: "home" },
      { href: "/admin/commandes", label: "Commandes", icon: "list" },
      { href: "/admin/cuisine", label: "Cuisine", icon: "flame" },
      { href: "/admin/livraisons", label: "Livraisons", icon: "truck" },
    ],
  },
  {
    title: "Carte & stocks",
    items: [
      { href: "/admin/plats", label: "Plats", icon: "bag" },
      { href: "/admin/stocks", label: "Stocks", icon: "box" },
      { href: "/admin/mise-en-avant", label: "Mise en avant", icon: "star" },
      { href: "/admin/promotions", label: "Promotions", icon: "tag" },
      { href: "/admin/budget", label: "Courses & budget", icon: "cart" },
    ],
  },
  {
    title: "Relation client",
    items: [
      { href: "/admin/clients", label: "Clients", icon: "user" },
      { href: "/admin/messages", label: "Messages", icon: "mail" },
      { href: "/admin/sav", label: "Réclamations", icon: "chat" },
      { href: "/admin/newsletter", label: "Newsletter", icon: "megaphone" },
    ],
  },
  {
    title: "Gestion",
    items: [
      { href: "/admin/facturation", label: "Facturation", icon: "euro" },
      { href: "/admin/livreurs", label: "Livreurs", icon: "scooter" },
      { href: "/admin/livraison", label: "Barème livraison", icon: "truck" },
      { href: "/admin/zones", label: "Zones (repli)", icon: "pin" },
      { href: "/admin/reglages", label: "Réglages", icon: "settings" },
    ],
  },
];

/**
 * Déclaré hors du composant : défini dans le corps de `AdminShell`, il créait un
 * nouveau type de composant à chaque render, et React remontait donc toute la
 * navigation au moindre changement d'état.
 */
function SideLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="mb-1">
          <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-cream/35">
            {group.title}
          </p>
          {group.items.map((n) => {
            const active =
              n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-primary text-white"
                    : "text-cream/70 hover:bg-white/10 hover:text-cream"
                }`}
              >
                <Icon name={n.icon} size={18} /> {n.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="min-h-dvh bg-page">
      {/* sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-ink p-4 lg:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2.5 px-2 py-2">
          <Emblem size={40} />
          <div className="leading-tight">
            <p className="font-display text-cream">Ô 3 Saveurs</p>
            <p className="text-xs text-gold">Back-office</p>
          </div>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          <SideLinks pathname={pathname} onNavigate={close} />
        </nav>
        <Link
          href="/"
          className="mt-2 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-cream/60 hover:bg-white/10 hover:text-cream"
        >
          <Icon name="chevL" size={16} /> Retour au site
        </Link>
      </aside>

      {/* topbar mobile */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-line bg-ink px-4 py-3 lg:hidden">
        <Link href="/admin" className="flex min-w-0 items-center gap-2">
          <Emblem size={32} />
          <span className="truncate font-display text-cream">Back-office</span>
        </Link>
        {/* Une icône nue de 24 px offrait une cible tactile deux fois trop
            petite ; le carré de 40 px l'entoure sans déplacer le dessin. */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 grid h-10 w-10 shrink-0 place-items-center text-cream"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={open}
          aria-controls="admin-nav-mobile"
        >
          <Icon name={open ? "x" : "menu"} size={24} />
        </button>
      </header>
      {open && (
        /* Quinze entrées réparties en quatre groupes : déroulé en pleine
           hauteur, le menu repoussait le contenu de l'écran et il fallait
           traverser toute la navigation pour revenir à la page. Il défile
           désormais dans sa propre fenêtre. */
        <nav
          id="admin-nav-mobile"
          className="flex max-h-[70dvh] flex-col gap-1 overflow-y-auto border-b border-line bg-ink p-4 lg:hidden"
        >
          <SideLinks pathname={pathname} onNavigate={close} />
          <Link
            href="/"
            onClick={close}
            className="rounded-xl px-4 py-3 text-sm font-semibold text-cream/60 hover:bg-white/10"
          >
            ← Retour au site
          </Link>
        </nav>
      )}

      {/* contenu */}
      <div className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
