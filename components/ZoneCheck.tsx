"use client";

import { useEffect, useState } from "react";
import { fmtPrice } from "@/lib/menu";
import type { Zone } from "@/lib/menu";
import { resolveZone, suggestCities } from "@/lib/zones";
import { Icon } from "./Icon";

type Outcome =
  | { kind: "in"; zone: Zone; city: string }
  | { kind: "out"; suggestions: string[] }
  | null;

/**
 * « On vous livre ? » — les zones viennent de `/api/zones`, donc de la base.
 * Ce composant lisait la constante `zones` de `lib/menu.ts` et annonçait donc
 * des frais obsolètes dès que la cliente les modifiait dans l'administration,
 * ce qui est un risque de litige sur le prix annoncé (art. L112-1 C. conso).
 */
export function ZoneCheck() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Outcome>(null);
  const [freeDeliveryThresholdCents, setFreeDeliveryThresholdCents] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/zones", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("zones"))))
      .then((data: Zone[]) => alive && setZones(data))
      .catch(() => alive && setZones([]));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/delivery-info", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("delivery-info"))))
      .then((data: { freeDeliveryThresholdCents: number | null }) => {
        if (alive) setFreeDeliveryThresholdCents(data.freeDeliveryThresholdCents);
      })
      .catch(() => alive && setFreeDeliveryThresholdCents(null));
    return () => {
      alive = false;
    };
  }, []);

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !zones) return;
    // Code postal d'abord, nom de commune ensuite — même règle que le serveur.
    const match = resolveZone(zones, { zip: query, city: query });
    if (!match) {
      setResult({ kind: "out", suggestions: suggestCities(zones, query) });
      return;
    }
    const zone = zones.find((z) => z.idx === match.zoneIdx);
    setResult(zone ? { kind: "in", zone, city: match.city } : { kind: "out", suggestions: [] });
  };

  // Pastilles de villes rapides, dérivées des zones déjà chargées (5 max,
  // dédupliquées) — un clic remplit simplement le champ, la vérification
  // reste un geste volontaire de la cliente.
  const quickCities = zones ? Array.from(new Set(zones.flatMap((z) => z.villes))).slice(0, 5) : [];

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 text-ink shadow-[var(--shadow-soft)]">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="truck" size={22} className="text-primary" />
        <h3 className="text-lg font-display">On livre chez vous ?</h3>
      </div>
      <p className="mb-3 text-sm text-ink-2">
        Code postal ou ville : frais et minimum affichés en un clic.
      </p>

      <form onSubmit={check} className="flex gap-2">
        {/* `min-w-0` : sans ça l'input garde sa largeur minimale de contenu
            (~180 px) au lieu de suivre `w-full`, et pousse « Vérifier » hors
            champ sous ~375 px. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-panel-2 px-4">
          <label htmlFor="zone-check" className="sr-only">
            Code postal ou ville de livraison
          </label>
          <Icon name="pin" size={18} className="text-ink-2" />
          <input
            id="zone-check"
            name="zone-check"
            autoComplete="postal-code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex. 77340, Pontault-Combault, Roissy…"
            className="w-full bg-transparent py-3 text-[15px] text-ink outline-none placeholder:text-ink-2/70"
          />
        </div>
        <button
          type="submit"
          disabled={!zones}
          className="rounded-full bg-primary px-5 py-3 font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-60"
        >
          Vérifier
        </button>
      </form>

      {quickCities.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {quickCities.map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => setQuery(city)}
              className="rounded-full border border-line bg-panel-2 px-3 py-1 text-xs font-semibold text-ink-2 transition hover:border-primary hover:text-primary"
            >
              {city}
            </button>
          ))}
        </div>
      )}

      <div aria-live="polite">
        {result?.kind === "in" && (
          <div className="mt-4 flex items-start gap-3 rounded-xl bg-teal/10 p-4 text-teal">
            <Icon name="check" size={20} className="mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold">Oui, on livre à {result.city} ! 🎉</p>
              <p className="mt-0.5">
                Frais de livraison <strong>{fmtPrice(result.zone.feeCents)}</strong> · minimum de
                commande <strong>{fmtPrice(result.zone.minimumCents)}</strong>.
                {freeDeliveryThresholdCents !== null && (
                  <> Offerte dès <strong>{fmtPrice(freeDeliveryThresholdCents)}</strong> d'achat.</>
                )}
              </p>
            </div>
          </div>
        )}

        {result?.kind === "out" && (
          <div className="mt-4 flex items-start gap-3 rounded-xl bg-primary-soft p-4 text-brick">
            <Icon name="warning" size={20} className="mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold">Cette adresse n'est pas dans notre zone directe.</p>
              {result.suggestions.length > 0 ? (
                <p className="mt-0.5">
                  Vouliez-vous dire <strong>{result.suggestions.join(", ")}</strong> ?
                </p>
              ) : (
                <p className="mt-0.5">
                  Pensez à <strong>l'à emporter</strong> ou commandez via <strong>Uber Eats</strong>.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
