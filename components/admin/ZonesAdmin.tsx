"use client";

import { useEffect, useId, useState } from "react";
import { fmtCents, toCents, toEuros } from "@/lib/money";
import type { Zone } from "@/lib/menu";
import { Icon } from "@/components/Icon";

/**
 * Zones de livraison.
 *
 * Cet écran écrivait bien en base, mais le tunnel de commande lisait un tableau
 * codé en dur dans `lib/menu.ts` : modifier les frais ici ne changeait donc
 * strictement rien pour le client, qui continuait de payer l'ancien tarif
 * indéfiniment. Le checkout consomme désormais `/api/zones`, et le serveur
 * recalcule les frais à partir de cette table.
 *
 * Les codes postaux sont la clé de rapprochement : c'est par eux que le serveur
 * détermine la zone facturée, et non plus par un choix du client.
 */
export function ZonesAdmin() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "erreur"; text: string } | null>(null);
  const baseId = useId();

  useEffect(() => {
    let annulé = false;
    (async () => {
      try {
        const res = await fetch("/api/zones", { cache: "no-store" });
        if (!res.ok) throw new Error("Chargement impossible");
        const data = (await res.json()) as Zone[];
        if (!annulé) setZones(data);
      } catch {
        if (!annulé) {
          setMessage({ tone: "erreur", text: "Les zones n'ont pas pu être chargées." });
        }
      } finally {
        if (!annulé) setReady(true);
      }
    })();
    return () => {
      annulé = true;
    };
  }, []);

  const setField = (idx: number, patch: Partial<Zone>) =>
    setZones((cur) => cur.map((z) => (z.idx === idx ? { ...z, ...patch } : z)));

  const save = async (zone: Zone) => {
    setSaving(zone.idx);
    setMessage(null);
    try {
      const res = await fetch("/api/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idx: zone.idx,
          feeCents: zone.feeCents,
          minimumCents: zone.minimumCents,
          villes: zone.villes,
          zips: zone.zips,
        }),
      });
      const data = (await res.json()) as Zone | { error?: string };
      if (!res.ok) throw new Error(("error" in data && data.error) || "Enregistrement refusé");
      setMessage({ tone: "ok", text: `Zone ${zone.idx + 1} enregistrée.` });
    } catch (error) {
      setMessage({
        tone: "erreur",
        text: error instanceof Error ? error.message : "Enregistrement impossible.",
      });
    } finally {
      setSaving(null);
    }
  };

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Zones de livraison</h1>
        <p className="text-ink-2">
          Frais, minimum de commande, communes et codes postaux couverts. Le serveur détermine la
          zone d&apos;une commande à partir du <strong>code postal</strong> saisi par le client.
        </p>
      </div>

      {/* Zone d'annonce : les erreurs étaient auparavant avalées en silence. */}
      <div aria-live="polite" className="min-h-6">
        {message && (
          <p
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
              message.tone === "ok"
                ? "bg-primary-soft text-brick"
                : "bg-brick/10 text-brick"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {zones.map((z) => {
          const feeId = `${baseId}-fee-${z.idx}`;
          const minId = `${baseId}-min-${z.idx}`;
          const citiesId = `${baseId}-cities-${z.idx}`;
          const zipsId = `${baseId}-zips-${z.idx}`;
          const invalidZip = z.zips.find((code) => code && !/^\d{5}$/.test(code));

          return (
            <div
              key={z.idx}
              className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-brick">
                  <Icon name="pin" size={15} /> Zone {z.idx + 1}
                </span>
                <button
                  onClick={() => save(z)}
                  disabled={saving === z.idx || !!invalidZip}
                  className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving === z.idx ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={feeId} className="mb-1 block text-xs font-semibold text-ink-2">
                    Frais de livraison (€)
                  </label>
                  <input
                    id={feeId}
                    type="number"
                    step="0.5"
                    min="0"
                    value={toEuros(z.feeCents)}
                    onChange={(e) => setField(z.idx, { feeCents: toCents(e.target.value) ?? 0 })}
                    className="w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor={minId} className="mb-1 block text-xs font-semibold text-ink-2">
                    Minimum de commande (€)
                  </label>
                  <input
                    id={minId}
                    type="number"
                    step="1"
                    min="0"
                    value={toEuros(z.minimumCents)}
                    onChange={(e) =>
                      setField(z.idx, { minimumCents: toCents(e.target.value) ?? 0 })
                    }
                    className="w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label htmlFor={citiesId} className="mb-1 block text-xs font-semibold text-ink-2">
                  Communes (séparées par des virgules)
                </label>
                <textarea
                  id={citiesId}
                  rows={2}
                  value={z.villes.join(", ")}
                  onChange={(e) =>
                    setField(z.idx, {
                      villes: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="mt-3">
                <label htmlFor={zipsId} className="mb-1 block text-xs font-semibold text-ink-2">
                  Codes postaux (séparés par des virgules)
                </label>
                <textarea
                  id={zipsId}
                  rows={2}
                  value={z.zips.join(", ")}
                  onChange={(e) =>
                    setField(z.idx, {
                      zips: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  aria-describedby={`${zipsId}-aide`}
                  aria-invalid={!!invalidZip}
                  className={`w-full rounded-lg border bg-page px-3 py-2 text-sm outline-none focus:border-primary ${
                    invalidZip ? "border-brick" : "border-line"
                  }`}
                />
                <p id={`${zipsId}-aide`} className="mt-1 text-xs text-ink-2">
                  {invalidZip
                    ? `« ${invalidZip} » n'est pas un code postal à 5 chiffres.`
                    : "C'est par le code postal que la zone d'une commande est déterminée."}
                </p>
              </div>

              <p className="mt-2 text-xs text-ink-2">
                {z.villes.length} commune{z.villes.length > 1 ? "s" : ""} · {z.zips.length} code
                {z.zips.length > 1 ? "s" : ""} postal{z.zips.length > 1 ? "aux" : ""} · frais{" "}
                {fmtCents(z.feeCents)} · minimum {fmtCents(z.minimumCents)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
