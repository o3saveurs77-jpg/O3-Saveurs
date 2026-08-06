"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { fmtCents, toCents, toEuros } from "@/lib/money";
import { PROMOTION_KINDS, PROMOTION_KIND_LABEL } from "@/lib/types";
import type { PromotionKind } from "@/lib/types";
import { WEEKDAY_LABEL } from "@/lib/hours";
import { Icon } from "@/components/Icon";

/**
 * Codes promotionnels.
 *
 * L'API, la validation (`lib/promotionValidation.ts`) et l'application au
 * panier existaient déjà ; il manquait uniquement l'écran. Le menu du
 * back-office pointait donc vers `/admin/promotions`, qui renvoyait une 404 :
 * aucune remise n'était administrable autrement qu'en base.
 *
 * Deux règles du validateur sont reprises telles quelles dans le formulaire,
 * pour que l'erreur se voie avant l'envoi plutôt qu'au retour du serveur :
 *  - une promotion sans code doit être automatique, et inversement ;
 *  - une remise en montant fixe ne peut pas dépasser le minimum de commande,
 *    sans quoi le panier tomberait à zéro.
 */

interface PromotionView {
  id: string;
  code: string | null;
  label: string;
  kind: PromotionKind;
  value: number;
  minSubtotalCents: number;
  startsAt: number | null;
  endsAt: number | null;
  maxUses: number | null;
  usedCount: number;
  oncePerCustomer: boolean;
  weekday: number | null;
  auto: boolean;
  active: boolean;
  description: string;
  remainingUses: number | null;
  orderCount: number;
  revenueCents: number;
}

interface Form {
  label: string;
  kind: PromotionKind;
  /** Pourcentage (1–100) ou euros saisis, selon `kind`. */
  valeur: string;
  code: string;
  minSubtotal: string;
  startsAt: string;
  endsAt: string;
  maxUses: string;
  weekday: string;
  oncePerCustomer: boolean;
  auto: boolean;
  active: boolean;
}

const VIDE: Form = {
  label: "",
  kind: "percent",
  valeur: "10",
  code: "",
  minSubtotal: "0",
  startsAt: "",
  endsAt: "",
  maxUses: "",
  weekday: "",
  oncePerCustomer: false,
  auto: false,
  active: true,
};

/** `datetime-local` attend `YYYY-MM-DDTHH:mm` en heure locale. */
function versInput(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function versForm(p: PromotionView): Form {
  return {
    label: p.label,
    kind: p.kind,
    valeur: p.kind === "amount" ? String(toEuros(p.value)) : String(p.value),
    code: p.code ?? "",
    minSubtotal: String(toEuros(p.minSubtotalCents)),
    startsAt: versInput(p.startsAt),
    endsAt: versInput(p.endsAt),
    maxUses: p.maxUses === null ? "" : String(p.maxUses),
    weekday: p.weekday === null ? "" : String(p.weekday),
    oncePerCustomer: p.oncePerCustomer,
    auto: p.auto,
    active: p.active,
  };
}

export function PromotionsAdmin() {
  const [promos, setPromos] = useState<PromotionView[]>([]);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "erreur"; text: string } | null>(null);
  const baseId = useId();

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/promotions", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { promotions: PromotionView[] };
      setPromos(data.promotions);
    } catch {
      setMessage({ tone: "erreur", text: "Les promotions n'ont pas pu être chargées." });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  /* Même contrôle que le serveur, joué à la frappe : le validateur refuse une
   * promotion sans code non automatique, et l'inverse. */
  const incoherence = useMemo(() => {
    if (!form) return null;
    const aCode = form.code.trim().length > 0;
    if (!aCode && !form.auto) {
      return "Sans code, la promotion doit être automatique — ajoutez un code ou cochez « appliquée automatiquement ».";
    }
    if (aCode && form.auto) {
      return "Une promotion automatique ne peut pas exiger la saisie d'un code.";
    }
    if (form.kind === "amount") {
      // `toCents` renvoie `null` sur une saisie inexploitable : on ne bloque
      // pas là-dessus, le serveur rendra un message précis.
      const remise = toCents(Number(form.valeur) || 0) ?? 0;
      const mini = toCents(Number(form.minSubtotal) || 0) ?? 0;
      if (remise > mini) {
        return "Une remise en montant fixe ne peut pas dépasser le minimum de commande : le panier tomberait à zéro.";
      }
    }
    return null;
  }, [form]);

  const enregistrer = async () => {
    if (!form || incoherence) return;
    setBusy(true);
    setMessage(null);

    const corps = {
      label: form.label.trim(),
      kind: form.kind,
      value:
        form.kind === "amount"
          ? (toCents(Number(form.valeur) || 0) ?? 0)
          : form.kind === "percent"
            ? Number(form.valeur) || 0
            : 0,
      code: form.code.trim() ? form.code.trim().toUpperCase() : null,
      minSubtotalCents: toCents(Number(form.minSubtotal) || 0) ?? 0,
      // L'API attend une date ISO (`isoDate()` dans lib/validate.ts fait
      // `new Date(String(v))`, qui échoue sur un timestamp numérique) : envoyer
      // les millisecondes ici faisait échouer l'enregistrement de toute
      // promotion à laquelle on donnait un début ou une fin.
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
      weekday: form.weekday === "" ? null : Number(form.weekday),
      oncePerCustomer: form.oncePerCustomer,
      auto: form.auto,
      active: form.active,
    };

    try {
      const res = await fetch(editId ? `/api/promotions/${editId}` : "/api/promotions", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Enregistrement refusé");
      }
      setForm(null);
      setEditId(null);
      await charger();
      setMessage({ tone: "ok", text: editId ? "Promotion mise à jour." : "Promotion créée." });
    } catch (e) {
      setMessage({ tone: "erreur", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const basculer = async (p: PromotionView) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/promotions/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      if (!res.ok) throw new Error();
      await charger();
    } catch {
      setMessage({ tone: "erreur", text: "Changement d'état impossible." });
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (p: PromotionView) => {
    /* Une promotion déjà utilisée est rattachée à des commandes : la désactiver
     * conserve l'historique de facturation, la supprimer le romprait. */
    if (p.usedCount > 0) {
      setMessage({
        tone: "erreur",
        text: `« ${p.label} » a déjà servi ${p.usedCount} fois : désactivez-la plutôt que de la supprimer, sinon l'historique des commandes perd sa référence.`,
      });
      return;
    }
    if (!confirm(`Supprimer définitivement « ${p.label} » ?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/promotions/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await charger();
      setMessage({ tone: "ok", text: "Promotion supprimée." });
    } catch {
      setMessage({ tone: "erreur", text: "Suppression impossible." });
    } finally {
      setBusy(false);
    }
  };

  const actives = promos.filter((p) => p.active).length;
  const caTotal = promos.reduce((s, p) => s + p.revenueCents, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Promotions</h1>
          <p className="mt-1 text-sm text-ink-2">
            {promos.length} promotion{promos.length > 1 ? "s" : ""} · {actives} active
            {actives > 1 ? "s" : ""} · {fmtCents(caTotal)} de commandes générées
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(VIDE);
            setEditId(null);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105"
        >
          <Icon name="plus" size={17} /> Nouvelle promotion
        </button>
      </header>

      {message && (
        <p
          role={message.tone === "erreur" ? "alert" : "status"}
          className={`rounded-xl border p-3 text-sm ${
            message.tone === "erreur"
              ? "border-brick/30 bg-primary-soft text-brick"
              : "border-teal/30 bg-teal/10 text-teal"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* ── Formulaire ─────────────────────────────────── */}
      {form && (
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="text-xl">{editId ? "Modifier la promotion" : "Nouvelle promotion"}</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ id={`${baseId}-label`} label="Libellé" className="sm:col-span-2">
              <input
                id={`${baseId}-label`}
                value={form.label}
                onChange={(e) => set({ label: e.target.value })}
                placeholder="Bienvenue -10 %"
                className={inputCls}
              />
            </Champ>

            <Champ id={`${baseId}-kind`} label="Type">
              <select
                id={`${baseId}-kind`}
                value={form.kind}
                onChange={(e) => set({ kind: e.target.value as PromotionKind })}
                className={inputCls}
              >
                {PROMOTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PROMOTION_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Champ>

            {form.kind !== "free_delivery" && (
              <Champ
                id={`${baseId}-val`}
                label={form.kind === "percent" ? "Remise (%)" : "Remise (€)"}
              >
                <input
                  id={`${baseId}-val`}
                  type="number"
                  min={form.kind === "percent" ? 1 : 0.01}
                  max={form.kind === "percent" ? 100 : undefined}
                  step={form.kind === "percent" ? 1 : 0.5}
                  value={form.valeur}
                  onChange={(e) => set({ valeur: e.target.value })}
                  className={inputCls}
                />
              </Champ>
            )}

            <Champ id={`${baseId}-code`} label="Code (vide = automatique)">
              <input
                id={`${baseId}-code`}
                value={form.code}
                onChange={(e) => set({ code: e.target.value.toUpperCase(), auto: false })}
                placeholder="BIENVENUE"
                className={`${inputCls} font-mono uppercase`}
              />
            </Champ>

            <Champ id={`${baseId}-min`} label="Minimum de commande (€)">
              <input
                id={`${baseId}-min`}
                type="number"
                min={0}
                step={0.5}
                value={form.minSubtotal}
                onChange={(e) => set({ minSubtotal: e.target.value })}
                className={inputCls}
              />
            </Champ>

            <Champ id={`${baseId}-max`} label="Utilisations max (vide = illimité)">
              <input
                id={`${baseId}-max`}
                type="number"
                min={1}
                value={form.maxUses}
                onChange={(e) => set({ maxUses: e.target.value })}
                className={inputCls}
              />
            </Champ>

            <Champ id={`${baseId}-jour`} label="Jour de la semaine">
              <select
                id={`${baseId}-jour`}
                value={form.weekday}
                onChange={(e) => set({ weekday: e.target.value })}
                className={inputCls}
              >
                <option value="">Tous les jours</option>
                {WEEKDAY_LABEL.map((l, i) => (
                  <option key={l} value={i}>
                    {l}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ id={`${baseId}-debut`} label="Début (facultatif)">
              <input
                id={`${baseId}-debut`}
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => set({ startsAt: e.target.value })}
                className={inputCls}
              />
            </Champ>

            <Champ id={`${baseId}-fin`} label="Fin (facultatif)">
              <input
                id={`${baseId}-fin`}
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => set({ endsAt: e.target.value })}
                className={inputCls}
              />
            </Champ>
          </div>

          <div className="mt-4 flex flex-wrap gap-5">
            <Case
              checked={form.auto}
              onChange={(v) => set({ auto: v, code: v ? "" : form.code })}
              label="Appliquée automatiquement (sans code)"
            />
            <Case
              checked={form.oncePerCustomer}
              onChange={(v) => set({ oncePerCustomer: v })}
              label="Une seule fois par client"
            />
            <Case checked={form.active} onChange={(v) => set({ active: v })} label="Active" />
          </div>

          {incoherence && (
            <p role="alert" className="mt-4 rounded-xl border border-brick/30 bg-primary-soft p-3 text-sm text-brick">
              {incoherence}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={enregistrer}
              disabled={busy || !!incoherence || form.label.trim().length < 3}
              className="rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Enregistrement…" : editId ? "Enregistrer" : "Créer"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setEditId(null);
              }}
              className="rounded-full border border-line px-5 py-2.5 font-semibold transition hover:bg-panel-2"
            >
              Annuler
            </button>
          </div>
        </section>
      )}

      {/* ── Liste ──────────────────────────────────────── */}
      {!ready ? (
        <p className="py-16 text-center text-ink-2">Chargement…</p>
      ) : promos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-line bg-panel py-16 text-center text-ink-2">
          <Icon name="tag" size={40} className="opacity-30" />
          <p className="text-lg font-bold text-ink">Aucune promotion</p>
          <p className="text-sm">Créez-en une pour l&apos;appliquer au panier de vos clients.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-2">
              <tr>
                <th className="px-4 py-3">Promotion</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Utilisations</th>
                <th className="px-4 py-3">Commandes</th>
                <th className="px-4 py-3">État</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-bold text-ink">{p.label}</p>
                    <p className="text-xs text-ink-2">{p.description}</p>
                  </td>
                  <td className="px-4 py-3">
                    {p.code ? (
                      <code className="rounded bg-panel-2 px-2 py-1 font-mono text-xs font-bold text-brick">
                        {p.code}
                      </code>
                    ) : (
                      <span className="text-xs text-ink-2">automatique</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {p.usedCount}
                    {p.maxUses !== null && <span className="text-ink-2"> / {p.maxUses}</span>}
                    {p.remainingUses === 0 && (
                      <span className="ml-1 text-xs font-bold text-brick">épuisée</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {p.orderCount}
                    {p.revenueCents > 0 && (
                      <span className="block text-xs text-ink-2">{fmtCents(p.revenueCents)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        p.active ? "bg-teal/15 text-teal" : "bg-panel-2 text-ink-2"
                      }`}
                    >
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <BoutonIcone
                        titre={p.active ? "Désactiver" : "Activer"}
                        onClick={() => basculer(p)}
                        disabled={busy}
                        icone={p.active ? "x" : "check"}
                      />
                      <BoutonIcone
                        titre="Modifier"
                        onClick={() => {
                          setForm(versForm(p));
                          setEditId(p.id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        disabled={busy}
                        icone="edit"
                      />
                      <BoutonIcone
                        titre="Supprimer"
                        onClick={() => supprimer(p)}
                        disabled={busy}
                        icone="trash"
                        danger
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-[var(--radius-soft)] border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-primary";

function Champ({
  id,
  label,
  children,
  className = "",
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function Case({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--color-primary)]"
      />
      {label}
    </label>
  );
}

function BoutonIcone({
  titre,
  onClick,
  disabled,
  icone,
  danger = false,
}: {
  titre: string;
  onClick: () => void;
  disabled?: boolean;
  icone: "x" | "check" | "edit" | "trash";
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titre}
      aria-label={titre}
      className={`grid h-8 w-8 place-items-center rounded-full transition disabled:opacity-40 ${
        danger ? "text-brick hover:bg-primary-soft" : "text-ink-2 hover:bg-panel-2 hover:text-ink"
      }`}
    >
      <Icon name={icone} size={16} />
    </button>
  );
}
