"use client";

import { useEffect, useState } from "react";
import { fmtPrice } from "@/lib/menu";
import type { Zone } from "@/lib/menu";
import { Icon } from "@/components/Icon";

export function ZonesAdmin() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/zones", { cache: "no-store" });
        if (res.ok) setZones(await res.json());
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setField = (i: number, patch: Partial<Zone>) => {
    setZones((cur) => cur.map((z, idx) => (idx === i ? { ...z, ...patch } : z)));
  };

  const save = (i: number) => {
    const z = zones[i];
    fetch("/api/zones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idx: i, fee: z.fee, min: z.min, villes: z.villes }),
    }).catch(() => {});
  };

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Zones de livraison</h1>
        <p className="text-ink-2">Frais, minimum de commande et communes couvertes.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {zones.map((z, i) => (
          <div key={i} className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary">
                <Icon name="pin" size={15} /> Zone {i + 1}
              </span>
              <button
                onClick={() => save(i)}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-white hover:brightness-105"
              >
                Enregistrer
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-2">Frais de livraison (€)</label>
                <input
                  type="number"
                  step="0.5"
                  value={z.fee}
                  onChange={(e) => setField(i, { fee: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-2">Minimum (€)</label>
                <input
                  type="number"
                  step="1"
                  value={z.min}
                  onChange={(e) => setField(i, { min: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-ink-2">Communes (séparées par des virgules)</label>
              <textarea
                rows={2}
                value={z.villes.join(", ")}
                onChange={(e) => setField(i, { villes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                className="w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <p className="mt-2 text-xs text-ink-2">
              {z.villes.length} commune(s) · frais {fmtPrice(z.fee)} · min {fmtPrice(z.min)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
