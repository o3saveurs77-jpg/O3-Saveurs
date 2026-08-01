"use client";

/* Écran « Liste de courses & budget » — prépare un budget d'achat de matières
 * premières pour une période à venir (un événement, une semaine type…).
 *
 * Distinct de l'écran Stocks : ici on planifie *avant* d'acheter, avec un
 * chiffre d'affaires estimé et un nombre de jours, pour connaître le coût
 * matière et le budget quotidien avant même de passer commande au grossiste.
 * Les totaux ne sont jamais saisis à la main : ils sont recalculés à partir
 * des lignes, pour ne jamais diverger d'un prix modifié après coup.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtCents, toCents, toEuros } from "@/lib/money";
import { BUDGET_CATEGORIES, BUDGET_CATEGORY_LABEL } from "@/lib/types";
import type { BudgetCategory, BudgetItemView } from "@/lib/types";
import { Icon } from "@/components/Icon";

interface BudgetPayload {
  items: BudgetItemView[];
  caCents: number;
  days: number;
  totalMatieresCents: number;
  totalEmballagesCents: number;
  totalGeneralCents: number;
  coutMatierePct: number | null;
  budgetParJourCents: number | null;
}

type Notice = { kind: "error" | "info"; text: string } | null;

const INPUT =
  "w-full rounded-[var(--radius-soft)] border border-line bg-page px-3 py-2 text-sm outline-none focus:border-primary";

interface Draft {
  label: string;
  qty: string;
  unit: string;
  unitPrice: string;
}

const EMPTY_DRAFT: Draft = { label: "", qty: "1", unit: "", unitPrice: "" };

/** Un pourcentage, une décimale, virgule française. */
function fmtPct(pct: number): string {
  return `${pct.toFixed(1).replace(".", ",")} %`;
}

export function BudgetAdmin() {
  const [data, setData] = useState<BudgetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [caDraft, setCaDraft] = useState("");
  const [daysDraft, setDaysDraft] = useState("");
  const [drafts, setDrafts] = useState<Record<BudgetCategory, Draft>>(
    () =>
      Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c, { ...EMPTY_DRAFT }])) as Record<
        BudgetCategory,
        Draft
      >,
  );
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/budget", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice({ kind: "error", text: body.error ?? "Lecture du budget impossible." });
        return;
      }
      const payload = (await res.json()) as BudgetPayload;
      setData(payload);
      setCaDraft(toEuros(payload.caCents));
      setDaysDraft(String(payload.days));
    } catch {
      setNotice({ kind: "error", text: "Le serveur n'a pas répondu." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byCategory = useMemo(() => {
    const map = new Map<BudgetCategory, BudgetItemView[]>();
    for (const cat of BUDGET_CATEGORIES) map.set(cat, []);
    for (const item of data?.items ?? []) map.get(item.category)?.push(item);
    return map;
  }, [data]);

  const saveSettings = async () => {
    const caCents = toCents(caDraft);
    const days = Number(daysDraft);
    if (caCents === null || caCents < 0) {
      return setNotice({ kind: "error", text: "Le chiffre d'affaires estimé n'est pas valide." });
    }
    if (!Number.isInteger(days) || days < 1) {
      return setNotice({ kind: "error", text: "Le nombre de jours doit être un entier d'au moins 1." });
    }
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "budget.caCents": caCents, "budget.days": days }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice({ kind: "error", text: body.error ?? "Enregistrement refusé." });
        return;
      }
      setNotice({ kind: "info", text: "Chiffre d'affaires et durée enregistrés." });
      await load();
    } catch {
      setNotice({ kind: "error", text: "Le serveur n'a pas répondu." });
    } finally {
      setSavingSettings(false);
    }
  };

  const addItem = async (category: BudgetCategory) => {
    const d = drafts[category];
    const label = d.label.trim();
    const qty = Number(d.qty.replace(",", "."));
    const unitPriceCents = toCents(d.unitPrice);

    if (!label) return setNotice({ kind: "error", text: "Le nom de l'article est requis." });
    if (!Number.isFinite(qty) || qty <= 0) {
      return setNotice({ kind: "error", text: "La quantité doit être un nombre positif." });
    }
    if (unitPriceCents === null || unitPriceCents < 0) {
      return setNotice({ kind: "error", text: "Le prix unitaire n'est pas valide." });
    }

    try {
      const res = await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, label, qty, unit: d.unit.trim(), unitPriceCents }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice({ kind: "error", text: body.error ?? "Ajout refusé." });
        return;
      }
      setNotice({ kind: "info", text: `« ${label} » ajouté.` });
      setDrafts((s) => ({ ...s, [category]: { ...EMPTY_DRAFT } }));
      await load();
    } catch {
      setNotice({ kind: "error", text: "Le serveur n'a pas répondu." });
    }
  };

  const startEdit = (item: BudgetItemView) => {
    setEditing((s) => ({
      ...s,
      [item.id]: {
        label: item.label,
        qty: String(item.qty),
        unit: item.unit,
        unitPrice: toEuros(item.unitPriceCents),
      },
    }));
  };

  const cancelEdit = (id: string) => {
    setEditing((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  };

  const saveEdit = async (id: string) => {
    const d = editing[id];
    if (!d) return;
    const label = d.label.trim();
    const qty = Number(d.qty.replace(",", "."));
    const unitPriceCents = toCents(d.unitPrice);

    if (!label) return setNotice({ kind: "error", text: "Le nom de l'article est requis." });
    if (!Number.isFinite(qty) || qty <= 0) {
      return setNotice({ kind: "error", text: "La quantité doit être un nombre positif." });
    }
    if (unitPriceCents === null || unitPriceCents < 0) {
      return setNotice({ kind: "error", text: "Le prix unitaire n'est pas valide." });
    }

    setBusyId(id);
    try {
      const res = await fetch(`/api/budget/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, qty, unit: d.unit.trim(), unitPriceCents }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice({ kind: "error", text: body.error ?? "Modification refusée." });
        return;
      }
      cancelEdit(id);
      await load();
    } catch {
      setNotice({ kind: "error", text: "Le serveur n'a pas répondu." });
    } finally {
      setBusyId(null);
    }
  };

  const removeItem = async (item: BudgetItemView) => {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/budget/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice({ kind: "error", text: body.error ?? "Suppression refusée." });
        return;
      }
      setNotice({ kind: "info", text: `« ${item.label} » supprimé.` });
      await load();
    } catch {
      setNotice({ kind: "error", text: "Le serveur n'a pas répondu." });
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) {
    return <p className="py-20 text-center text-ink-2">Chargement du budget…</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Liste de courses & budget</h1>
        <p className="text-ink-2">
          {data.items.length} article{data.items.length > 1 ? "s" : ""} · prévisionnel sur{" "}
          {data.days} jour{data.days > 1 ? "s" : ""}.
        </p>
      </div>

      <div aria-live="polite" role="status" className="empty:hidden">
        {notice && (
          <p
            className={`flex items-start gap-2 rounded-[var(--radius-soft)] border px-4 py-3 text-sm font-semibold ${
              notice.kind === "error"
                ? "border-brick/40 bg-brick/5 text-brick"
                : "border-teal/40 bg-teal/5 text-teal"
            }`}
          >
            <Icon name={notice.kind === "error" ? "warning" : "check"} size={18} />
            {notice.text}
          </p>
        )}
      </div>

      {/* Réglages de la période : le CA estimé et le nombre de jours pilotent
          le coût matière % et le budget/jour ci-dessous. */}
      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-line bg-panel p-4">
        <div className="w-40">
          <label htmlFor="budget-ca" className="mb-1 block text-sm font-semibold text-ink-2">
            CA estimé (€)
          </label>
          <input
            id="budget-ca"
            inputMode="decimal"
            className={INPUT}
            value={caDraft}
            onChange={(e) => setCaDraft(e.target.value)}
          />
        </div>
        <div className="w-32">
          <label htmlFor="budget-days" className="mb-1 block text-sm font-semibold text-ink-2">
            Nombre de jours
          </label>
          <input
            id="budget-days"
            inputMode="numeric"
            className={INPUT}
            value={daysDraft}
            onChange={(e) => setDaysDraft(e.target.value)}
          />
        </div>
        <button
          onClick={saveSettings}
          disabled={savingSettings}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white hover:brightness-105 disabled:opacity-50"
        >
          <Icon name="check" size={16} /> {savingSettings ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {/* Tuiles de synthèse — même lecture que le document imprimé. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="CA estimé" value={fmtCents(data.caCents)} tone="brick" />
        <Tile label="Total matières" value={fmtCents(data.totalMatieresCents)} tone="teal" />
        <Tile
          label="Coût matière"
          value={data.coutMatierePct === null ? "—" : fmtPct(data.coutMatierePct)}
          tone="primary"
        />
        <Tile
          label="Budget moyen / jour"
          value={data.budgetParJourCents === null ? "—" : fmtCents(data.budgetParJourCents)}
          tone="gold"
        />
        <Tile label="Total + emballages" value={fmtCents(data.totalGeneralCents)} tone="ink" />
      </div>

      {/* Une section par catégorie, dans l'ordre du document : postes
          alimentaires d'abord, emballages en dernier. */}
      {BUDGET_CATEGORIES.map((category) => {
        const items = byCategory.get(category) ?? [];
        const subtotal = items.reduce((s, i) => s + i.totalCents, 0);
        const draft = drafts[category];

        return (
          <section
            key={category}
            className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel"
          >
            <div className="flex items-center justify-between bg-panel-2 px-4 py-3">
              <h2 className="text-base font-bold">{BUDGET_CATEGORY_LABEL[category]}</h2>
              <span className="font-bold text-brick">{fmtCents(subtotal)}</span>
            </div>

            {items.length > 0 && (
              <ul className="divide-y divide-line">
                {items.map((item) => {
                  const edit = editing[item.id];
                  if (edit) {
                    return (
                      <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                        <input
                          className={`${INPUT} min-w-[10rem] flex-1`}
                          value={edit.label}
                          onChange={(e) =>
                            setEditing((s) => ({ ...s, [item.id]: { ...edit, label: e.target.value } }))
                          }
                        />
                        <input
                          inputMode="decimal"
                          className={`${INPUT} w-20`}
                          value={edit.qty}
                          onChange={(e) =>
                            setEditing((s) => ({ ...s, [item.id]: { ...edit, qty: e.target.value } }))
                          }
                        />
                        <input
                          className={`${INPUT} w-20`}
                          placeholder="kg"
                          value={edit.unit}
                          onChange={(e) =>
                            setEditing((s) => ({ ...s, [item.id]: { ...edit, unit: e.target.value } }))
                          }
                        />
                        <input
                          inputMode="decimal"
                          className={`${INPUT} w-24`}
                          placeholder="Prix unit. €"
                          value={edit.unitPrice}
                          onChange={(e) =>
                            setEditing((s) => ({
                              ...s,
                              [item.id]: { ...edit, unitPrice: e.target.value },
                            }))
                          }
                        />
                        <button
                          onClick={() => saveEdit(item.id)}
                          disabled={busyId === item.id}
                          className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        >
                          <Icon name="check" size={14} />
                        </button>
                        <button
                          onClick={() => cancelEdit(item.id)}
                          className="rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:bg-panel-2"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </li>
                    );
                  }

                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-[10rem] flex-1">
                        <p className="font-semibold">{item.label}</p>
                        <p className="text-xs text-ink-2">
                          {item.qty} {item.unit || "unité(s)"} × {fmtCents(item.unitPriceCents)}
                        </p>
                      </div>
                      <span className="w-24 text-right font-bold">{fmtCents(item.totalCents)}</span>
                      <button
                        onClick={() => startEdit(item)}
                        className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-panel-2"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => removeItem(item)}
                        disabled={busyId === item.id}
                        className="rounded-full border border-brick/40 px-3 py-1.5 text-xs font-semibold text-brick hover:bg-brick/10 disabled:opacity-50"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Ajout d'une ligne, en bas de chaque catégorie. */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
              <input
                className={`${INPUT} min-w-[10rem] flex-1`}
                placeholder="Article (ex. Poulet entier)"
                value={draft.label}
                onChange={(e) =>
                  setDrafts((s) => ({ ...s, [category]: { ...draft, label: e.target.value } }))
                }
              />
              <input
                inputMode="decimal"
                className={`${INPUT} w-20`}
                placeholder="Qté"
                value={draft.qty}
                onChange={(e) =>
                  setDrafts((s) => ({ ...s, [category]: { ...draft, qty: e.target.value } }))
                }
              />
              <input
                className={`${INPUT} w-20`}
                placeholder="kg, L…"
                value={draft.unit}
                onChange={(e) =>
                  setDrafts((s) => ({ ...s, [category]: { ...draft, unit: e.target.value } }))
                }
              />
              <input
                inputMode="decimal"
                className={`${INPUT} w-28`}
                placeholder="Prix unit. €"
                value={draft.unitPrice}
                onChange={(e) =>
                  setDrafts((s) => ({ ...s, [category]: { ...draft, unitPrice: e.target.value } }))
                }
              />
              <button
                onClick={() => addItem(category)}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white hover:brightness-105"
              >
                <Icon name="plus" size={14} /> Ajouter
              </button>
            </div>
          </section>
        );
      })}

      <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-ink px-5 py-4 text-cream">
        <span className="font-bold">Total général · matières + emballages</span>
        <span className="text-xl font-bold">{fmtCents(data.totalGeneralCents)}</span>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "brick" | "teal" | "primary" | "gold" | "ink";
}) {
  const toneClass: Record<typeof tone, string> = {
    brick: "text-brick",
    teal: "text-teal",
    primary: "text-primary",
    gold: "text-[#8a6d00]",
    ink: "text-ink",
  };
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-panel p-4 text-center shadow-[var(--shadow-soft)]">
      <p className={`text-2xl font-bold ${toneClass[tone]}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-2">{label}</p>
    </div>
  );
}
