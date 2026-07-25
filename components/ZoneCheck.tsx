"use client";

import { useState } from "react";
import { zones, fmtPrice } from "@/lib/menu";
import { findZoneForCity } from "@/lib/zones";
import { Icon } from "./Icon";

type Result =
  | { kind: "in"; zoneIdx: number; city: string }
  | { kind: "out" }
  | null;

export function ZoneCheck() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result>(null);

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    const match = findZoneForCity(zones, query);
    if (!query.trim()) return;
    setResult(match ? { kind: "in", zoneIdx: match.zoneIdx, city: match.city } : { kind: "out" });
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="truck" size={22} className="text-primary" />
        <h3 className="text-lg">On vous livre ?</h3>
      </div>
      <p className="mb-3 text-sm text-ink-2">
        Entrez votre ville pour voir les frais et le minimum de commande.
      </p>

      <form onSubmit={check} className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-line bg-page px-4">
          <Icon name="pin" size={18} className="text-ink-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex. Lognes, Torcy, Noisy-le-Grand…"
            className="w-full bg-transparent py-3 text-[15px] outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-full bg-primary px-5 py-3 font-bold text-white transition hover:brightness-105"
        >
          Vérifier
        </button>
      </form>

      {result?.kind === "in" && (
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#e9f7f4] p-4 text-[#0f6b5e]">
          <Icon name="check" size={20} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Oui, on livre à {result.city} ! 🎉</p>
            <p className="mt-0.5">
              Frais de livraison{" "}
              <strong>{fmtPrice(zones[result.zoneIdx].fee)}</strong> · minimum de commande{" "}
              <strong>{fmtPrice(zones[result.zoneIdx].min)}</strong>.
            </p>
          </div>
        </div>
      )}

      {result?.kind === "out" && (
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-primary-soft p-4 text-brick">
          <Icon name="info" size={20} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Cette ville n'est pas dans notre zone directe.</p>
            <p className="mt-0.5">
              Pensez à <strong>l'à emporter</strong> ou commandez via <strong>Uber Eats</strong>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
