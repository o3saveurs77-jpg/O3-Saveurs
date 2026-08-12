"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { fmtCents, toCents, toEuros } from "@/lib/money";
import { formatKm, sortTiers, type DeliveryTier } from "@/lib/delivery";
import { Icon } from "@/components/Icon";

/**
 * Barème de livraison à la distance.
 *
 * Remplace le rapprochement par code postal, qui facturait au même tarif deux
 * adresses d'une même commune séparées par 7 km de route. Les paliers sont
 * bornés par le haut : une course tombe dans le premier palier dont la borne la
 * couvre, et au-delà du dernier on ne livre pas.
 */
interface TiersResponse {
  tiers: (DeliveryTier & { active: boolean })[];
  mode: string;
  configured: boolean;
  active: boolean;
}

type Notice = { tone: "ok" | "erreur"; text: string } | null;

export function DeliveryTiersAdmin() {
  const [data, setData] = useState<TiersResponse | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const baseId = useId();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/delivery-tiers", { cache: "no-store" });
      if (!res.ok) throw new Error("Chargement impossible");
      setData((await res.json()) as TiersResponse);
    } catch {
      setNotice({ tone: "erreur", text: "Le barème n'a pas pu être chargé." });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tiers = data?.tiers ?? [];

  const setField = (idx: number, patch: Partial<DeliveryTier>) =>
    setData((cur) =>
      cur ? { ...cur, tiers: cur.tiers.map((t) => (t.idx === idx ? { ...t, ...patch } : t)) } : cur,
    );

  const save = async (tier: DeliveryTier) => {
    setSaving(tier.idx);
    setNotice(null);
    try {
      const res = await fetch("/api/delivery-tiers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idx: tier.idx,
          maxKm: tier.maxKm,
          feeCents: tier.feeCents,
          minimumCents: tier.minimumCents,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Enregistrement refusé");
      setNotice({ tone: "ok", text: `Palier « jusqu'à ${formatKm(tier.maxKm)} km » enregistré.` });
      await load();
    } catch (error) {
      setNotice({
        tone: "erreur",
        text: error instanceof Error ? error.message : "Enregistrement impossible.",
      });
    } finally {
      setSaving(null);
    }
  };

  const add = async () => {
    const last = sortTiers(tiers).at(-1);
    setNotice(null);
    setAdding(true);
    try {
      const res = await fetch("/api/delivery-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxKm: (last?.maxKm ?? 0) + 3,
          feeCents: (last?.feeCents ?? 200) + 150,
          minimumCents: last?.minimumCents ?? 1500,
        }),
      });
      if (!res.ok) throw new Error("Ajout refusé");
      await load();
    } catch {
      setNotice({ tone: "erreur", text: "Le palier n'a pas pu être ajouté." });
    } finally {
      setAdding(false);
    }
  };

  const remove = async (tier: DeliveryTier) => {
    // Un palier supprimé par erreur retire aussitôt une tranche de distance de la
    // tarification : comme pour un livreur, on confirme avant d'agir.
    if (!confirm(`Supprimer le palier jusqu'à ${formatKm(tier.maxKm)} km ?`)) return;
    setNotice(null);
    setRemoving(tier.idx);
    try {
      const res = await fetch(`/api/delivery-tiers?idx=${tier.idx}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Suppression refusée");
      await load();
    } catch {
      setNotice({ tone: "erreur", text: "Le palier n'a pas pu être supprimé." });
    } finally {
      setRemoving(null);
    }
  };

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  const sorted = sortTiers(tiers);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Barème de livraison</h1>
        <p className="text-ink-2">
          Frais et minimum de commande selon la <strong>distance routière</strong> entre le
          restaurant et le client. Une course tombe dans le premier palier qui la couvre ; au-delà
          du dernier, la livraison est refusée.
        </p>
      </div>

      {/* État réel de la tarification — un barème réglé mais inactif est le
          piège classique : la cliente croit facturer au kilomètre alors que
          les zones s'appliquent toujours. */}
      {data && !data.active && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-panel-2 p-4 text-sm">
          <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-primary" />
          <span>
            <strong>Ce barème ne s&apos;applique pas encore.</strong>{" "}
            {!data.configured
              ? "La clé Google Maps (GOOGLE_MAPS_API_KEY) n'est pas renseignée : les distances ne peuvent pas être mesurées."
              : data.mode !== "distance"
                ? "Le mode de tarification est réglé sur « zones » dans Réglages."
                : "Aucun palier actif."}{" "}
            Les frais sont donc calculés par <strong>zone de code postal</strong>.
          </span>
        </p>
      )}

      <div aria-live="polite" className="min-h-6">
        {notice && (
          <p
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
              notice.tone === "ok" ? "bg-primary-soft text-brick" : "bg-brick/10 text-brick"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line py-12 text-center text-ink-2">
          Aucun palier défini. Ajoutez-en un pour facturer à la distance.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((t, i) => {
            const from = i > 0 ? sorted[i - 1].maxKm : 0;
            const kmId = `${baseId}-km-${t.idx}`;
            const feeId = `${baseId}-fee-${t.idx}`;
            const minId = `${baseId}-min-${t.idx}`;
            // Un palier dont la borne est sous la précédente n'est jamais
            // atteignable : le signaler plutôt que de laisser un tarif mort.
            const unreachable = i > 0 && t.maxKm <= sorted[i - 1].maxKm;

            return (
              <div
                key={t.idx}
                className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-brick">
                    <Icon name="truck" size={15} /> {formatKm(from)} – {formatKm(t.maxKm)} km
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => save(t)}
                      disabled={saving === t.idx || removing === t.idx}
                      className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving === t.idx ? "Enregistrement…" : "Enregistrer"}
                    </button>
                    <button
                      onClick={() => remove(t)}
                      disabled={removing === t.idx}
                      aria-label={`Supprimer le palier jusqu'à ${formatKm(t.maxKm)} km`}
                      className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition hover:bg-brick/10 hover:text-brick disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={kmId} className="mb-1 block text-xs font-semibold text-ink-2">
                      Jusqu&apos;à (km)
                    </label>
                    <input
                      id={kmId}
                      type="number"
                      step="0.5"
                      min="0.1"
                      value={t.maxKm}
                      onChange={(e) => setField(t.idx, { maxKm: Number(e.target.value) })}
                      aria-invalid={unreachable}
                      className={`w-full rounded-lg border bg-page px-3 py-2 outline-none focus:border-primary ${
                        unreachable ? "border-brick" : "border-line"
                      }`}
                    />
                  </div>
                  <div>
                    <label htmlFor={feeId} className="mb-1 block text-xs font-semibold text-ink-2">
                      Frais (€)
                    </label>
                    <input
                      id={feeId}
                      type="number"
                      step="0.5"
                      min="0"
                      value={toEuros(t.feeCents)}
                      onChange={(e) => setField(t.idx, { feeCents: toCents(e.target.value) ?? 0 })}
                      className="w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor={minId} className="mb-1 block text-xs font-semibold text-ink-2">
                      Minimum (€)
                    </label>
                    <input
                      id={minId}
                      type="number"
                      step="1"
                      min="0"
                      value={toEuros(t.minimumCents)}
                      onChange={(e) =>
                        setField(t.idx, { minimumCents: toCents(e.target.value) ?? 0 })
                      }
                      className="w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <p className="mt-2 text-xs text-ink-2">
                  {unreachable ? (
                    <span className="font-semibold text-brick">
                      Ce palier ne sera jamais atteint : sa borne doit dépasser{" "}
                      {formatKm(sorted[i - 1].maxKm)} km.
                    </span>
                  ) : (
                    <>
                      Course de plus de {formatKm(from)} km et jusqu&apos;à {formatKm(t.maxKm)} km :{" "}
                      {fmtCents(t.feeCents)} de frais, minimum {fmtCents(t.minimumCents)}.
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={add}
        disabled={adding}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line py-4 font-semibold text-ink-2 transition hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="plus" size={18} /> {adding ? "Ajout…" : "Ajouter un palier"}
      </button>
    </div>
  );
}
