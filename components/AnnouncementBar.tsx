"use client";

/* Bandeau d'annonce en haut du site (« Fermé le 15 août », « Nouveau : … »).
 *
 * Lit `GET /api/announcements`, qui ne renvoie que les annonces actives et dans
 * leur fenêtre de diffusion : le composant n'a aucune règle de date à appliquer.
 *
 * Refermable, avec mémorisation en `localStorage` par identifiant — sans quoi le
 * bandeau réapparaîtrait à chaque changement de page et deviendrait un
 * irritant. Une nouvelle annonce a un nouvel identifiant, elle réapparaît donc
 * bien pour tout le monde.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { AnnouncementTone, AnnouncementView } from "@/lib/promotionValidation";

const STORAGE_KEY = "o3.announcements.dismissed";

const TONE_CLASS: Record<AnnouncementTone, string> = {
  info: "bg-teal text-white",
  promo: "bg-primary text-white",
  alerte: "bg-brick text-white",
};

const TONE_ICON: Record<AnnouncementTone, "sparkle" | "megaphone" | "warning"> = {
  info: "sparkle",
  promo: "megaphone",
  alerte: "warning",
};

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function AnnouncementBar() {
  const [items, setItems] = useState<AnnouncementView[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(readDismissed());

    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/announcements", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const data: unknown = await res.json();
        if (Array.isArray(data)) setItems(data as AnnouncementView[]);
      } catch {
        /* une annonce indisponible ne doit pas casser la page */
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setDismissed((current) => {
        const next = [...new Set([...current, id])];
        try {
          // On ne conserve que les identifiants encore diffusés : la clé de
          // stockage ne grossit pas indéfiniment au fil des saisons.
          const live = new Set(items.map((a) => a.id));
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(next.filter((v) => live.has(v))),
          );
        } catch {
          /* mode privé / quota : le bandeau réapparaîtra, sans casse */
        }
        return next;
      });
    },
    [items],
  );

  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div>
      {visible.map((a) => (
        <div key={a.id} className={`${TONE_CLASS[a.tone] ?? TONE_CLASS.info} print:hidden`}>
          <div className="wrap flex items-center gap-3 py-2 text-sm font-semibold">
            <Icon name={TONE_ICON[a.tone] ?? "sparkle"} size={17} className="shrink-0" />
            <p className="flex-1">
              {a.message}
              {a.link ? (
                a.link.startsWith("/") ? (
                  <Link href={a.link} className="ml-2 underline underline-offset-2">
                    En savoir plus
                  </Link>
                ) : (
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 underline underline-offset-2"
                  >
                    En savoir plus
                  </a>
                )
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => dismiss(a.id)}
              aria-label="Masquer cette annonce"
              className="shrink-0 rounded-full p-1 transition hover:bg-white/20"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
