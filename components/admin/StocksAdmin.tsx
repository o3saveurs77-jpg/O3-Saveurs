"use client";

/* Écran « Stocks » — le tableau de bord quotidien de la cuisine.
 *
 * Ce que cet écran doit rendre évident, parce que c'est la règle métier qui
 * surprend le plus : **un stock à 0 retire le plat de la vente tout seul, et un
 * réapprovisionnement le remet en vente tout seul**. Sans cette explication à
 * l'écran, la réaction naturelle est de chercher l'interrupteur « Disponible »
 * dans l'écran Plats, qui sera de nouveau écrasé à la commande suivante.
 *
 * Trois choses ne passent volontairement pas par un mouvement de stock :
 *  · basculer un plat en « illimité » (`stock = null`) — ce n'est pas une
 *    quantité mais un changement de mode de suivi, donc un `PATCH` du plat ;
 *  · donner un stock initial à un plat jusqu'ici illimité, pour la même raison ;
 *  · rien d'autre. Toute variation de quantité laisse une trace dans
 *    `StockMovement`, avec son motif et son auteur.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { cats as seedCats } from "@/lib/menu";
import { STOCK_REASONS, STOCK_REASON_LABEL } from "@/lib/types";
import type { StockReason } from "@/lib/types";
import { Icon } from "@/components/Icon";

interface StockDish {
  id: string;
  cat: string;
  name: string;
  stock: number | null;
  stockAlert: number | null;
  available: boolean;
  priceCents: number | null;
  costCents: number | null;
}

interface Movement {
  id: string;
  dishId: string;
  dishName: string;
  delta: number;
  reason: string;
  note: string | null;
  author: string | null;
  orderId: string | null;
  createdAt: number;
}

interface StockPayload {
  dishes: StockDish[];
  lowStock: { id: string; name: string; stock: number; stockAlert: number }[];
  movements: Movement[];
  movementsTotal: number;
}

type Notice = { kind: "error" | "info"; text: string } | null;

type Tab = "entrees" | "sorties" | "inventaire" | "historique";

const TABS: { id: Tab; label: string; icon: "download" | "upload" | "list" | "clock" }[] = [
  { id: "entrees", label: "Entrées du matin", icon: "download" },
  { id: "sorties", label: "Sorties & pertes", icon: "upload" },
  { id: "inventaire", label: "Inventaire", icon: "list" },
  { id: "historique", label: "Historique", icon: "clock" },
];

/** Motifs proposés pour une saisie manuelle : la vente est tracée par la commande. */
const MANUAL_REASONS: StockReason[] = STOCK_REASONS.filter((r) => r !== "inventaire");

const INPUT =
  "w-full rounded-[var(--radius-soft)] border border-line bg-page px-3 py-2 outline-none focus:border-primary";
const LABEL = "mb-1 block text-sm font-semibold text-ink-2";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Un entier positif saisi à la main. `null` si vide, `undefined` si illisible. */
function parseQty(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

/** Épuisés d'abord, puis les alertes, puis le reste : l'urgence remonte en tête. */
function urgency(d: StockDish): number {
  if (d.stock === null) return 3;
  if (d.stock === 0) return 0;
  if (d.stockAlert !== null && d.stock <= d.stockAlert) return 1;
  return 2;
}

export function StocksAdmin() {
  const [data, setData] = useState<StockPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [tab, setTab] = useState<Tab>("entrees");

  // filtres de l'historique
  const [filterDish, setFilterDish] = useState("");
  const [filterReason, setFilterReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDish) params.set("dishId", filterDish);
      if (filterReason) params.set("reason", filterReason);
      const qs = params.toString();
      const res = await fetch(`/api/stock${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice({ kind: "error", text: body.error ?? "Lecture des stocks impossible." });
        return;
      }
      setData((await res.json()) as StockPayload);
    } catch {
      setNotice({ kind: "error", text: "Le serveur n'a pas répondu." });
    } finally {
      setLoading(false);
    }
  }, [filterDish, filterReason]);

  useEffect(() => {
    load();
  }, [load]);

  const dishes = useMemo(
    () =>
      [...(data?.dishes ?? [])].sort(
        (a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name, "fr"),
      ),
    [data],
  );

  /** Un mouvement de stock. Renvoie un message d'erreur, ou `null` si tout va bien. */
  const postMovement = useCallback(
    async (body: {
      dishId: string;
      delta: number;
      reason: StockReason;
      note?: string;
      absolute?: number;
    }): Promise<string | null> => {
      try {
        const res = await fetch("/api/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) return null;
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        return payload.error ?? "Mouvement refusé.";
      } catch {
        return "Le serveur n'a pas répondu.";
      }
    },
    [],
  );

  /** Changement de mode de suivi (illimité ↔ suivi) : ce n'est pas un mouvement. */
  const patchStock = useCallback(async (dishId: string, stock: number | null): Promise<string | null> => {
    try {
      const res = await fetch(`/api/dishes/${dishId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock }),
      });
      if (res.ok) return null;
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      return payload.error ?? "Modification refusée.";
    } catch {
      return "Le serveur n'a pas répondu.";
    }
  }, []);

  const run = useCallback(
    async (action: () => Promise<string | null>, success: string) => {
      const error = await action();
      if (error) setNotice({ kind: "error", text: error });
      else setNotice({ kind: "info", text: success });
      await load();
    },
    [load],
  );

  const alerts = dishes.filter((d) => urgency(d) <= 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Stocks</h1>
          <p className="text-ink-2">
            {data ? `${data.dishes.length} plats suivis` : "Chargement…"}
            {alerts.length > 0 && ` · ${alerts.length} à surveiller`}
          </p>
        </div>
        <button
          onClick={() => {
            setNotice(null);
            load();
          }}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2.5 text-sm font-semibold hover:bg-panel-2"
        >
          <Icon name="refresh" size={16} /> Actualiser
        </button>
      </div>

      {/* Zone d'annonce : montée en permanence pour être annoncée à l'insertion. */}
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

      {/* Règle métier, à l'écran plutôt que dans une documentation que personne
          n'ouvre : c'est l'automatisme qui déroute le plus. */}
      <aside className="rounded-[var(--radius-card)] border border-line bg-panel p-4 text-sm">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
          <Icon name="box" size={18} /> Comment fonctionne le stock
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-ink-2">
          <li>
            Un stock qui tombe à <strong>0</strong> retire le plat de la vente automatiquement : il
            disparaît de la carte, inutile de toucher à l&apos;interrupteur « Disponible ».
          </li>
          <li>
            Un <strong>réapprovisionnement</strong> le remet en vente aussi automatiquement, dès que
            la quantité repasse au-dessus de 0.
          </li>
          <li>
            Un stock <strong>illimité</strong> (boissons, plats préparés à la demande) n&apos;est
            jamais décrémenté : le plat reste commandable tant qu&apos;il est marqué disponible.
          </li>
          <li>
            Chaque entrée, sortie et correction est enregistrée avec son motif et son auteur, pour
            pouvoir répondre plus tard à « où sont passées les 12 parts de mafé ? ».
          </li>
        </ul>
      </aside>

      {/* Alertes en tête : c'est la raison d'être de l'écran. */}
      {alerts.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-gold/60 bg-gold/10 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-[#8a6d00]">
            <Icon name="warning" size={18} /> À réapprovisionner en priorité
          </h2>
          <ul className="flex flex-wrap gap-2">
            {alerts.map((d) => (
              <li
                key={d.id}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${
                  d.stock === 0 ? "bg-brick text-white" : "bg-panel text-[#8a6d00]"
                }`}
              >
                {d.name}
                <span className="font-semibold">
                  {d.stock === 0 ? "épuisé" : `reste ${d.stock}`}
                </span>
                {d.stock !== null && d.stock > 0 && (
                  <button
                    onClick={() =>
                      run(
                        () => postMovement({ dishId: d.id, delta: 5, reason: "reappro" }),
                        `+5 ${d.name} enregistré.`,
                      )
                    }
                    className="rounded-full bg-teal px-2 py-0.5 text-xs text-white"
                    aria-label={`Ajouter 5 ${d.name}`}
                  >
                    +5
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* onglets */}
      <div role="tablist" aria-label="Opérations de stock" className="no-scrollbar flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`stock-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`stock-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === t.id ? "bg-brick text-white" : "bg-panel-2 text-ink-2 hover:text-ink"
            }`}
          >
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <p className="py-20 text-center text-ink-2">Chargement des stocks…</p>
      ) : (
        <div
          role="tabpanel"
          id={`stock-panel-${tab}`}
          aria-labelledby={`stock-tab-${tab}`}
          tabIndex={-1}
        >
          {tab === "entrees" && (
            <EntriesPanel
              dishes={dishes}
              onMovement={postMovement}
              onPatchStock={patchStock}
              onDone={(n) => {
                setNotice({ kind: "info", text: n });
                load();
              }}
              onError={(text) => setNotice({ kind: "error", text })}
              quick={(action, success) => run(action, success)}
            />
          )}
          {tab === "sorties" && (
            <ExitPanel
              dishes={dishes}
              onSubmit={postMovement}
              onDone={(n) => {
                setNotice({ kind: "info", text: n });
                load();
              }}
              onError={(text) => setNotice({ kind: "error", text })}
            />
          )}
          {tab === "inventaire" && (
            <InventoryPanel
              dishes={dishes}
              onMovement={postMovement}
              onDone={(n) => {
                setNotice({ kind: "info", text: n });
                load();
              }}
              onError={(text) => setNotice({ kind: "error", text })}
            />
          )}
          {tab === "historique" && (
            <HistoryPanel
              movements={data?.movements ?? []}
              total={data?.movementsTotal ?? 0}
              dishes={data?.dishes ?? []}
              filterDish={filterDish}
              filterReason={filterReason}
              onFilterDish={setFilterDish}
              onFilterReason={setFilterReason}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Libellé de catégorie, depuis les données de seed (repli suffisant ici : ce
 *  n'est qu'un regroupement d'affichage, jamais une donnée enregistrée). */
const catLabel = (slug: string) => seedCats.find((c) => c.id === slug)?.label ?? slug;

function StockBadge({ dish }: { dish: StockDish }) {
  if (dish.stock === null) {
    return (
      <span className="inline-flex rounded-full bg-panel-2 px-2.5 py-1 text-xs font-bold text-ink-2">
        Illimité
      </span>
    );
  }
  const low = dish.stockAlert !== null && dish.stock <= dish.stockAlert;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        dish.stock === 0
          ? "bg-brick/10 text-brick"
          : low
            ? "bg-gold/25 text-[#8a6d00]"
            : "bg-teal/10 text-teal"
      }`}
    >
      {dish.stock === 0 ? "Épuisé — retiré de la vente" : `${dish.stock} en stock`}
      {dish.stockAlert !== null && dish.stock > 0 && (
        <span className="ml-1 font-semibold opacity-70">/ seuil {dish.stockAlert}</span>
      )}
    </span>
  );
}

// ─── Onglet « Entrées du matin » ──────────────────────────────

function EntriesPanel({
  dishes,
  onMovement,
  onPatchStock,
  onDone,
  onError,
  quick,
}: {
  dishes: StockDish[];
  onMovement: (b: { dishId: string; delta: number; reason: StockReason; note?: string; absolute?: number }) => Promise<string | null>;
  onPatchStock: (dishId: string, stock: number | null) => Promise<string | null>;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  quick: (action: () => Promise<string | null>, success: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filled = Object.entries(draft).filter(([, v]) => v.trim() !== "");

  /**
   * Validation groupée : la saisie du matin se fait plat par plat, mais elle
   * s'enregistre en une fois. Chaque mouvement reste une transaction distincte —
   * si l'un échoue, les autres sont bien passés, et le message le dit.
   */
  const submitAll = async () => {
    if (filled.length === 0) return onError("Aucune quantité saisie.");

    for (const [, raw] of filled) {
      if (parseQty(raw) === undefined) {
        return onError("Les quantités doivent être des nombres entiers positifs.");
      }
    }

    setSaving(true);
    const errors: string[] = [];
    let done = 0;

    for (const [dishId, raw] of filled) {
      const qty = parseQty(raw);
      if (qty === null || qty === undefined) continue;
      const dish = dishes.find((d) => d.id === dishId);
      if (!dish) continue;

      // Un plat illimité n'a pas de quantité à incrémenter : la saisie signifie
      // « passer en stock suivi, à cette valeur ».
      const error =
        dish.stock === null
          ? await onPatchStock(dishId, qty)
          : await onMovement({ dishId, delta: qty, reason: "reappro" });

      if (error) errors.push(`${dish.name} : ${error}`);
      else done += 1;
    }

    setSaving(false);
    setDraft({});
    if (errors.length) onError(`${done} entrée(s) enregistrée(s). Échecs — ${errors.join(" ; ")}`);
    else onDone(`${done} entrée(s) de stock enregistrée(s).`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-panel p-4">
        <p className="text-sm text-ink-2">
          Saisir les quantités préparées ce matin, puis valider en une fois. Les boutons rapides,
          eux, s&apos;appliquent immédiatement.
        </p>
        <button
          onClick={submitAll}
          disabled={saving || filled.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white hover:brightness-105 disabled:opacity-50"
        >
          <Icon name="check" size={16} />
          {saving ? "Enregistrement…" : `Valider ${filled.length || ""} entrée${filled.length > 1 ? "s" : ""}`}
        </button>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel">
        <ul className="divide-y divide-line">
          {dishes.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-[12rem] flex-1">
                <p className="font-semibold">{d.name}</p>
                <p className="text-xs text-ink-2">{catLabel(d.cat)}</p>
              </div>

              <StockBadge dish={d} />

              {d.stock !== null ? (
                <>
                  <div className="flex gap-1">
                    {[1, 5, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() =>
                          quick(
                            () => onMovement({ dishId: d.id, delta: n, reason: "reappro" }),
                            `+${n} ${d.name} enregistré.`,
                          )
                        }
                        className="rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:bg-panel-2"
                        aria-label={`Ajouter ${n} ${d.name}`}
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                  <div className="w-28">
                    <label htmlFor={`entry-${d.id}`} className="sr-only">
                      Quantité préparée de {d.name}
                    </label>
                    <input
                      id={`entry-${d.id}`}
                      inputMode="numeric"
                      className={INPUT}
                      placeholder="Entrée"
                      value={draft[d.id] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [d.id]: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() =>
                        quick(
                          () =>
                            onMovement({
                              dishId: d.id,
                              delta: 0,
                              reason: "inventaire",
                              absolute: 0,
                              note: "Rupture constatée en service",
                            }),
                          `« ${d.name} » est passé en rupture et retiré de la vente.`,
                        )
                      }
                      className="rounded-full border border-brick/40 px-3 py-1.5 text-xs font-bold text-brick hover:bg-brick/10"
                    >
                      Rupture
                    </button>
                    <button
                      onClick={() =>
                        quick(
                          () => onPatchStock(d.id, null),
                          `« ${d.name} » passe en stock illimité.`,
                        )
                      }
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:bg-panel-2"
                    >
                      Illimité
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-32">
                    <label htmlFor={`entry-${d.id}`} className="sr-only">
                      Stock initial de {d.name}
                    </label>
                    <input
                      id={`entry-${d.id}`}
                      inputMode="numeric"
                      className={INPUT}
                      placeholder="Stock initial"
                      value={draft[d.id] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [d.id]: e.target.value })}
                    />
                  </div>
                  <p className="text-xs text-ink-2">
                    Saisir une quantité pour commencer à suivre ce plat.
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Onglet « Sorties & pertes » ──────────────────────────────

function ExitPanel({
  dishes,
  onSubmit,
  onDone,
  onError,
}: {
  dishes: StockDish[];
  onSubmit: (b: { dishId: string; delta: number; reason: StockReason; note?: string }) => Promise<string | null>;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const tracked = dishes.filter((d) => d.stock !== null);
  const [dishId, setDishId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<StockReason>("perte");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const dish = tracked.find((d) => d.id === dishId);
    if (!dish) return onError("Choisir le plat concerné.");
    const n = parseQty(qty);
    if (n === undefined || n === null || n === 0) {
      return onError("Indiquer une quantité entière supérieure à zéro.");
    }
    // Le motif est obligatoire côté serveur aussi : une sortie sans explication
    // rend le journal inutilisable le jour où il faut comprendre un écart.
    if (note.trim().length < 3) {
      return onError("Une sortie ou une perte demande une explication (3 caractères minimum).");
    }

    setSaving(true);
    const error = await onSubmit({ dishId, delta: -n, reason, note: note.trim() });
    setSaving(false);
    if (error) return onError(error);
    onDone(`Sortie de ${n} × « ${dish.name} » enregistrée (${STOCK_REASON_LABEL[reason]}).`);
    setQty("");
    setNote("");
  };

  return (
    <div className="max-w-2xl space-y-4 rounded-[var(--radius-card)] border border-line bg-panel p-5">
      <div>
        <h2 className="text-lg">Enregistrer une sortie ou une perte</h2>
        <p className="text-sm text-ink-2">
          Casse, invendu jeté, plat offert, erreur de saisie : le <strong>motif et
          l&apos;explication sont obligatoires</strong>. Les ventes, elles, sont décomptées
          automatiquement par les commandes — il ne faut pas les ressaisir ici.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="exit-dish" className={LABEL}>
            Plat
          </label>
          <select id="exit-dish" className={INPUT} value={dishId} onChange={(e) => setDishId(e.target.value)}>
            <option value="">— Choisir —</option>
            {tracked.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.stock} en stock)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="exit-qty" className={LABEL}>
            Quantité sortie
          </label>
          <input
            id="exit-qty"
            inputMode="numeric"
            className={INPUT}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="2"
          />
        </div>
        <div>
          <label htmlFor="exit-reason" className={LABEL}>
            Motif
          </label>
          <select
            id="exit-reason"
            className={INPUT}
            value={reason}
            onChange={(e) => setReason(e.target.value as StockReason)}
          >
            {MANUAL_REASONS.map((r) => (
              <option key={r} value={r}>
                {STOCK_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="exit-note" className={LABEL}>
            Explication (obligatoire)
          </label>
          <input
            id="exit-note"
            className={INPUT}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="3 parts tombées au sol"
          />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white hover:brightness-105 disabled:opacity-50"
      >
        <Icon name="check" size={16} /> {saving ? "Enregistrement…" : "Enregistrer la sortie"}
      </button>

      {tracked.length === 0 && (
        <p className="text-sm text-ink-2">
          Aucun plat n&apos;est en stock suivi : une sortie n&apos;a pas de sens sur un stock
          illimité.
        </p>
      )}
    </div>
  );
}

// ─── Onglet « Inventaire » ────────────────────────────────────

function InventoryPanel({
  dishes,
  onMovement,
  onDone,
  onError,
}: {
  dishes: StockDish[];
  onMovement: (b: { dishId: string; delta: number; reason: StockReason; note?: string; absolute?: number }) => Promise<string | null>;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const tracked = useMemo(() => dishes.filter((d) => d.stock !== null), [dishes]);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const rows = tracked.map((d) => {
    const raw = counted[d.id] ?? "";
    const value = parseQty(raw);
    const gap = value === null || value === undefined ? null : value - (d.stock ?? 0);
    return { dish: d, raw, value, gap, invalid: value === undefined };
  });

  const filled = rows.filter((r) => r.value !== null && r.value !== undefined);

  const submit = async () => {
    if (rows.some((r) => r.invalid)) {
      return onError("Les quantités constatées doivent être des nombres entiers positifs.");
    }
    if (filled.length === 0) return onError("Aucun stock constaté saisi.");

    setSaving(true);
    const errors: string[] = [];
    let done = 0;

    for (const r of filled) {
      const error = await onMovement({
        dishId: r.dish.id,
        delta: 0,
        reason: "inventaire",
        absolute: r.value as number,
        note: `Inventaire : constaté ${r.value}, théorique ${r.dish.stock} (écart ${(r.gap ?? 0) > 0 ? "+" : ""}${r.gap})`,
      });
      if (error) errors.push(`${r.dish.name} : ${error}`);
      else done += 1;
    }

    setSaving(false);
    setCounted({});
    if (errors.length) onError(`${done} ligne(s) enregistrée(s). Échecs — ${errors.join(" ; ")}`);
    else onDone(`Inventaire enregistré sur ${done} plat(s).`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-panel p-4">
        <p className="max-w-xl text-sm text-ink-2">
          Saisir le stock <strong>réellement compté</strong> en cuisine. L&apos;écart avec le stock
          théorique est calculé pour vous et enregistré tel quel dans le journal : c&apos;est lui qui
          révèle les sorties oubliées. Les plats en stock illimité ne sont pas comptés.
        </p>
        <button
          onClick={submit}
          disabled={saving || filled.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white hover:brightness-105 disabled:opacity-50"
        >
          <Icon name="check" size={16} />
          {saving ? "Enregistrement…" : "Valider l'inventaire"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-panel-2 text-left text-ink-2">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Plat</th>
              <th scope="col" className="px-4 py-2 font-semibold">Stock théorique</th>
              <th scope="col" className="px-4 py-2 font-semibold">Stock constaté</th>
              <th scope="col" className="px-4 py-2 font-semibold">Écart</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ dish, raw, gap, invalid }) => (
              <tr key={dish.id} className="border-t border-line">
                <td className="px-4 py-2 font-semibold">{dish.name}</td>
                <td className="px-4 py-2 text-ink-2">{dish.stock}</td>
                <td className="px-4 py-2">
                  <label htmlFor={`inv-${dish.id}`} className="sr-only">
                    Stock constaté de {dish.name}
                  </label>
                  <input
                    id={`inv-${dish.id}`}
                    inputMode="numeric"
                    className={`w-24 rounded-lg border bg-page px-2 py-1.5 outline-none focus:border-primary ${
                      invalid ? "border-brick" : "border-line"
                    }`}
                    value={raw}
                    onChange={(e) => setCounted({ ...counted, [dish.id]: e.target.value })}
                    aria-invalid={invalid || undefined}
                  />
                </td>
                <td className="px-4 py-2">
                  {gap === null ? (
                    <span className="text-ink-2">—</span>
                  ) : (
                    <span
                      className={`font-bold ${gap === 0 ? "text-ink-2" : gap > 0 ? "text-teal" : "text-brick"}`}
                    >
                      {gap > 0 ? `+${gap}` : gap}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tracked.length === 0 && (
        <p className="text-sm text-ink-2">Aucun plat en stock suivi : rien à inventorier.</p>
      )}
    </div>
  );
}

// ─── Onglet « Historique » ────────────────────────────────────

function HistoryPanel({
  movements,
  total,
  dishes,
  filterDish,
  filterReason,
  onFilterDish,
  onFilterReason,
}: {
  movements: Movement[];
  total: number;
  dishes: StockDish[];
  filterDish: string;
  filterReason: string;
  onFilterDish: (v: string) => void;
  onFilterReason: (v: string) => void;
}) {
  const sorted = useMemo(
    () => [...dishes].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [dishes],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-[var(--radius-card)] border border-line bg-panel p-4">
        <div className="min-w-[12rem]">
          <label htmlFor="hist-dish" className={LABEL}>
            Filtrer par plat
          </label>
          <select
            id="hist-dish"
            className={INPUT}
            value={filterDish}
            onChange={(e) => onFilterDish(e.target.value)}
          >
            <option value="">Tous les plats</option>
            {sorted.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[12rem]">
          <label htmlFor="hist-reason" className={LABEL}>
            Filtrer par motif
          </label>
          <select
            id="hist-reason"
            className={INPUT}
            value={filterReason}
            onChange={(e) => onFilterReason(e.target.value)}
          >
            <option value="">Tous les motifs</option>
            {STOCK_REASONS.map((r) => (
              <option key={r} value={r}>
                {STOCK_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="px-4 py-2 text-left text-xs text-ink-2">
            {movements.length} mouvement(s) affiché(s) sur {total}
          </caption>
          <thead className="bg-panel-2 text-left text-ink-2">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Date</th>
              <th scope="col" className="px-4 py-2 font-semibold">Plat</th>
              <th scope="col" className="px-4 py-2 font-semibold">Variation</th>
              <th scope="col" className="px-4 py-2 font-semibold">Motif</th>
              <th scope="col" className="px-4 py-2 font-semibold">Détail</th>
              <th scope="col" className="px-4 py-2 font-semibold">Auteur</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="whitespace-nowrap px-4 py-2 text-ink-2">
                  {dateFmt.format(new Date(m.createdAt))}
                </td>
                <td className="px-4 py-2 font-semibold">{m.dishName}</td>
                <td className="px-4 py-2">
                  <span className={`font-bold ${m.delta < 0 ? "text-brick" : "text-teal"}`}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {STOCK_REASON_LABEL[m.reason as StockReason] ?? m.reason}
                </td>
                <td className="px-4 py-2 text-ink-2">{m.note ?? (m.orderId ? "Commande" : "—")}</td>
                <td className="px-4 py-2 text-ink-2">{m.author ?? "Automatique"}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-2">
                  Aucun mouvement pour ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
