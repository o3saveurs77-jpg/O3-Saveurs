"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Emblem } from "@/components/Brand";
import { Icon } from "@/components/Icon";

const NAV = [
  { href: "/admin", label: "Vue d'ensemble", icon: "home" },
  { href: "/admin/commandes", label: "Commandes", icon: "list" },
  { href: "/admin/plats", label: "Gestion des plats", icon: "bag" },
  { href: "/admin/livraisons", label: "Livraisons", icon: "truck" },
  { href: "/admin/clients", label: "Clients", icon: "user" },
  { href: "/admin/zones", label: "Zones", icon: "pin" },
  { href: "/admin/facturation", label: "Facturation", icon: "euro" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const SideLinks = () => (
    <>
      {NAV.map((n) => {
        const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 font-semibold transition ${
              active ? "bg-primary text-white" : "text-cream/70 hover:bg-white/10 hover:text-cream"
            }`}
          >
            <Icon name={n.icon} size={19} /> {n.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-page">
      {/* sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-ink p-4 lg:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2.5 px-2 py-2">
          <Emblem size={40} />
          <div className="leading-tight">
            <p className="font-display text-cream">Ô 3 Saveurs</p>
            <p className="text-xs text-gold">Back-office</p>
          </div>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          <SideLinks />
        </nav>
        <Link
          href="/"
          className="mt-2 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-cream/60 hover:bg-white/10 hover:text-cream"
        >
          <Icon name="chevL" size={16} /> Retour au site
        </Link>
      </aside>

      {/* topbar mobile */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-ink px-4 py-3 lg:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          <Emblem size={32} />
          <span className="font-display text-cream">Back-office</span>
        </Link>
        <button onClick={() => setOpen((v) => !v)} className="text-cream" aria-label="Menu">
          <Icon name={open ? "x" : "menu"} size={24} />
        </button>
      </header>
      {open && (
        <nav className="flex flex-col gap-1 border-b border-line bg-ink p-4 lg:hidden">
          <SideLinks />
          <Link href="/" className="rounded-xl px-4 py-3 text-sm font-semibold text-cream/60 hover:bg-white/10">
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
