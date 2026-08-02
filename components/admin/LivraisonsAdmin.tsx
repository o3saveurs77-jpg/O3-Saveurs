"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtCents } from "@/lib/money";
import { STATUS_LABEL, STATUS_NEXT, type Order, type OrderStatus } from "@/lib/types";
import { StatusPill } from "./StatusPill";

/* Écran « Livraisons » — tournées du jour (lot 4.2).
 *
 * Cet écran affectait ses courses à `DRIVERS`, un tableau de quatre prénoms
 * codés en dur dans `lib/mockOrders.ts` : Laila ne pouvait affecter une
 * livraison qu'à des livreurs fictifs, sans ordre de passage, et rien ne
 * survivait au rechargement. Tout vient désormais de la base :
 * `/api/drivers`, `/api/delivery-runs`, `/api/orders`.
 *
 * Les montants sont des centimes (`totalCents`) — voir `lib/money.ts`.
 */

/** Vue livreur de `GET /api/drivers`. Redéclarée ici : un fichier de route
 *  Next.js ne peut exporter que des handlers, pas ses types. */
interface DriverView {
  id: string;
  name: string;
  phone: string;
  vehicle: string | null;
  active: boolean;
}

/** Vue tournée de `GET /api/delivery-runs`. */
interface RunView {
  id: string;
  driverId: string;
  driverName: string | null;
  date: number;
  slot: string;
  status: string;
  notes: string | null;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
  orders: Order[];
}

const RUN_STATUS_LABEL: Record<string, string> = {
  preparee: "Préparée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

const RUN_STATUS_COLOR: Record<string, string> = {
  preparee: "bg-gold/20 text-[#8a6d00]",
  en_cours: "bg-teal/15 text-teal",
  terminee: "bg-[#e9f7f4] text-[#0f6b5e]",
  annulee: "bg-brick/10 text-brick",
};

/** Commandes qui attendent d'être mises en tournée. */
const POOL_STATUSES: OrderStatus[] = ["confirmee", "cuisine", "route"];

/** Aujourd'hui au format AAAA-MM-JJ, **en heure de Paris** : sur un serveur ou
 *  un poste en UTC, le service du soir basculait sinon au lendemain. */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const dayLabel = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00.000Z`));

const clock = (ms: number | null) =>
  ms === null
    ? "—"
    : new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
      }).format(new Date(ms));

const slotLabel = (slot: string) => (slot === "asap" ? "Dès que possible" : slot);

/** Récapitulatif d'une tournée : arrêts, espèces à ramener, communes desservies. */
function recap(run: RunView) {
  const live = run.orders.filter((o) => o.status !== "annulee");
  return {
    stops: live.length,
    delivered: live.filter((o) => o.status === "livree").length,
    cashCents: live.filter((o) => !o.paid).reduce((s, o) => s + o.totalCents, 0),
    collectedCents: live.filter((o) => o.paid).reduce((s, o) => s + o.totalCents, 0),
    cities: [...new Set(live.map((o) => o.customer.city).filter(Boolean))] as string[],
  };
}

export function LivraisonsAdmin() {
  const [day, setDay] = useState(todayKey);
  const [drivers, setDrivers] = useState<DriverView[]>([]);
  const [runs, setRuns] = useState<RunView[]>([]);
  const [pool, setPool] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Création de tournée
  const [newDriver, setNewDriver] = useState("");
  const [newSlot, setNewSlot] = useState("");

  // Feuille de route à imprimer (une seule à la fois)
  const [printRunId, setPrintRunId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [dRes, rRes, oRes] = await Promise.all([
        fetch(`/api/drivers?date=${day}`, { cache: "no-store" }),
        fetch(`/api/delivery-runs?date=${day}`, { cache: "no-store" }),
        fetch("/api/orders?take=200", { cache: "no-store" }),
      ]);

      if (!dRes.ok || !rRes.ok || !oRes.ok) {
        setMessage({ tone: "err", text: "Chargement impossible — vérifiez votre connexion." });
        return;
      }

      setDrivers(await dRes.json());
      setRuns(((await rRes.json()) as { runs: RunView[] }).runs);

      // `GET /api/orders` renvoie { orders, total, take, skip } — pas un tableau.
      const payload = (await oRes.json()) as { orders: Order[] };
      setPool(
        payload.orders.filter(
          (o) =>
            o.mode === "livraison" &&
            !o.deliveryRunId &&
            POOL_STATUSES.includes(o.status),
        ),
      );
    } catch {
      setMessage({ tone: "err", text: "Chargement impossible — vérifiez votre connexion." });
    } finally {
      setReady(true);
    }
  }, [day]);

  useEffect(() => {
    void load();
  }, [load]);

  // La feuille de route reste montée après l'impression (elle est masquée à
  // l'écran) : la démonter pendant que la boîte de dialogue est ouverte
  // produisait une page blanche dans l'aperçu.
  useEffect(() => {
    const done = () => setPrintRunId(null);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);

  /** Appel écrivain : remonte le message d'erreur de l'API et recharge. */
  const send = useCallback(
    async (url: string, init: RequestInit, okText?: string): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await fetch(url, {
          ...init,
          headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
        });
        const data = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        if (!res.ok) {
          setMessage({ tone: "err", text: data?.error ?? "L'opération a échoué." });
          return false;
        }
        setMessage({ tone: "ok", text: data?.message ?? okText ?? "Modification enregistrée." });
        await load();
        return true;
      } catch {
        setMessage({ tone: "err", text: "Le serveur n'a pas répondu." });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const activeDrivers = useMemo(() => drivers.filter((d) => d.active), [drivers]);

  const createRun = async () => {
    if (!newDriver) {
      setMessage({ tone: "err", text: "Choisissez d'abord un livreur." });
      return;
    }
    const ok = await send(
      "/api/delivery-runs",
      {
        method: "POST",
        body: JSON.stringify({ driverId: newDriver, date: day, slot: newSlot || "asap" }),
      },
      "Tournée créée.",
    );
    if (ok) setNewSlot("");
  };

  /** `orderIds` est la liste ordonnée définitive : affectation, retrait et
   *  réordonnancement passent tous par là. */
  const setRunOrders = (run: RunView, ids: string[], okText: string) =>
    send(
      `/api/delivery-runs/${run.id}`,
      { method: "PATCH", body: JSON.stringify({ orderIds: ids }) },
      okText,
    );

  const assign = (orderId: string, runId: string) => {
    const run = runs.find((r) => r.id === runId);
    if (!run) return;
    void setRunOrders(run, [...run.orders.map((o) => o.id), orderId], "Commande affectée.");
  };

  const detach = (run: RunView, orderId: string) =>
    void setRunOrders(
      run,
      run.orders.filter((o) => o.id !== orderId).map((o) => o.id),
      "Commande retirée de la tournée.",
    );

  const move = (run: RunView, index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= run.orders.length) return;
    const ids = run.orders.map((o) => o.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    // Réordonnancement optimiste : l'ordre de passage se règle par petits
    // mouvements successifs, attendre l'aller-retour réseau à chaque clic
    // rendait la liste inutilisable.
    setRuns((cur) =>
      cur.map((r) =>
        r.id === run.id
          ? { ...r, orders: ids.map((id) => r.orders.find((o) => o.id === id)!) }
          : r,
      ),
    );
    void setRunOrders(run, ids, "Ordre de passage mis à jour.");
  };

  const setRunStatus = (run: RunView, status: string) =>
    void send(
      `/api/delivery-runs/${run.id}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
      `Tournée ${RUN_STATUS_LABEL[status]?.toLowerCase() ?? status}.`,
    );

  const removeRun = (run: RunView) =>
    void send(`/api/delivery-runs/${run.id}`, { method: "DELETE" }, "Tournée supprimée.");

  const advanceOrder = (orderId: string, status: OrderStatus) =>
    void send(
      `/api/orders/${orderId}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
      `Commande passée en « ${STATUS_LABEL[status]} ».`,
    );

  const markPaid = (orderId: string) =>
    void send(
      `/api/orders/${orderId}`,
      { method: "PATCH", body: JSON.stringify({ paid: true }) },
      "Encaissement enregistré.",
    );

  const printRun = (run: RunView) => {
    setPrintRunId(run.id);
    // Laisser React peindre la feuille avant d'ouvrir la boîte d'impression.
    window.setTimeout(() => window.print(), 60);
  };

  const sheet = runs.find((r) => r.id === printRunId) ?? null;

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  return (
    <>
      {/* Impression : masque l'ensemble du back-office (barre latérale comprise)
          et ne laisse visible que la feuille de route. Sans cette règle, le
          bouton « Imprimer » sortait toute l'interface d'administration. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #feuille-de-route, #feuille-de-route * { visibility: visible !important; }
          #feuille-de-route { position: absolute; top: 0; left: 0; width: 100%; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="space-y-5 print:hidden">
        {/* ── En-tête ── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl">Livraisons</h1>
            <p className="text-ink-2">
              {dayLabel(day)} · {runs.length} tournée(s) · {pool.length} commande(s) à affecter
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="livraisons-jour" className="mb-1 block text-xs font-semibold text-ink-2">
                Jour
              </label>
              <input
                id="livraisons-jour"
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value || todayKey())}
                className="rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold hover:border-primary"
            >
              <Icon name="refresh" size={15} /> Rafraîchir
            </button>
          </div>
        </div>

        {/* ── Messages ── */}
        <div aria-live="polite" role="status">
          {message && (
            <p
              className={`rounded-xl border px-4 py-3 text-sm ${
                message.tone === "ok"
                  ? "border-teal/40 bg-teal/10 text-teal"
                  : "border-brick/40 bg-brick/5 text-brick"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>

        {drivers.length === 0 && (
          <p className="flex items-center gap-2 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm">
            <Icon name="warning" size={16} />
            Aucun livreur enregistré : créez-en un dans « Livreurs » avant de composer une tournée.
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* ── Commandes à affecter ── */}
          <section aria-labelledby="titre-a-affecter" className="space-y-3">
            <h2 id="titre-a-affecter" className="text-xl">
              À affecter <span className="text-ink-2">({pool.length})</span>
            </h2>

            {pool.length === 0 && (
              <p className="rounded-xl border border-line bg-panel px-4 py-8 text-center text-sm text-ink-2">
                Toutes les livraisons sont affectées.
              </p>
            )}

            {pool.map((o) => (
              <article
                key={o.id}
                className="rounded-xl border border-line bg-panel p-4 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{o.ref}</p>
                    <p className="text-sm text-ink-2">{o.customer.name}</p>
                  </div>
                  <StatusPill status={o.status} />
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-2">
                  <Icon name="pin" size={14} className="mt-0.5 shrink-0" />
                  <span>
                    {o.customer.address}
                    {o.customer.zip ? `, ${o.customer.zip}` : ""} {o.customer.city}
                  </span>
                </p>
                <p className="mt-1 flex items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1 text-ink-2">
                    <Icon name="clock" size={14} /> {slotLabel(o.slot)}
                  </span>
                  <span className="font-bold text-brick">{fmtCents(o.totalCents)}</span>
                  {!o.paid && (
                    <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold text-[#8a6d00]">
                      à encaisser
                    </span>
                  )}
                </p>

                <label htmlFor={`affecter-${o.id}`} className="sr-only">
                  Affecter la commande {o.ref} à une tournée
                </label>
                <select
                  id={`affecter-${o.id}`}
                  value=""
                  disabled={busy || runs.length === 0}
                  onChange={(e) => e.target.value && assign(o.id, e.target.value)}
                  className="mt-3 w-full rounded-full border border-line bg-page px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="">
                    {runs.length === 0 ? "Créez d'abord une tournée" : "Affecter à une tournée…"}
                  </option>
                  {runs
                    .filter((r) => r.status === "preparee" || r.status === "en_cours")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.driverName ?? "Livreur"} · {slotLabel(r.slot)} ({r.orders.length})
                      </option>
                    ))}
                </select>
              </article>
            ))}
          </section>

          {/* ── Tournées ── */}
          <section aria-labelledby="titre-tournees" className="space-y-4">
            <h2 id="titre-tournees" className="text-xl">
              Tournées du jour <span className="text-ink-2">({runs.length})</span>
            </h2>

            {/* Nouvelle tournée */}
            <div className="rounded-xl border border-dashed border-line bg-panel-2 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-40">
                  <label htmlFor="run-livreur" className="mb-1 block text-xs font-semibold text-ink-2">
                    Livreur
                  </label>
                  <select
                    id="run-livreur"
                    value={newDriver}
                    onChange={(e) => setNewDriver(e.target.value)}
                    className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Choisir…</option>
                    {activeDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.vehicle ? ` · ${d.vehicle}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="run-creneau" className="mb-1 block text-xs font-semibold text-ink-2">
                    Créneau (vide = dès que possible)
                  </label>
                  <input
                    id="run-creneau"
                    type="time"
                    value={newSlot}
                    onChange={(e) => setNewSlot(e.target.value)}
                    className="rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void createRun()}
                  disabled={busy || activeDrivers.length === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white hover:brightness-105 disabled:opacity-50"
                >
                  <Icon name="plus" size={15} /> Nouvelle tournée
                </button>
              </div>
            </div>

            {runs.length === 0 && (
              <p className="rounded-xl border border-line bg-panel px-4 py-10 text-center text-sm text-ink-2">
                Aucune tournée pour ce jour.
              </p>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              {runs.map((run) => {
                const r = recap(run);
                return (
                  <article
                    key={run.id}
                    className="flex flex-col rounded-xl border border-line bg-panel p-4 shadow-[var(--shadow-soft)]"
                  >
                    {/* en-tête de tournée */}
                    <header className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
                          <Icon name="scooter" size={18} />
                        </span>
                        <div>
                          <p className="font-bold">{run.driverName ?? "Livreur supprimé"}</p>
                          <p className="text-xs text-ink-2">
                            <Icon name="clock" size={12} className="inline" /> {slotLabel(run.slot)}
                            {run.startedAt !== null && ` · départ ${clock(run.startedAt)}`}
                            {run.endedAt !== null && ` · retour ${clock(run.endedAt)}`}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          RUN_STATUS_COLOR[run.status] ?? "bg-panel-2 text-ink-2"
                        }`}
                      >
                        {RUN_STATUS_LABEL[run.status] ?? run.status}
                      </span>
                    </header>

                    {/* récapitulatif — sous ~420 px un montant à 4 chiffres passait sur
                        deux lignes en grid-cols-3 fixe et désalignait les trois blocs. */}
                    <dl className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-panel-2 p-3 text-center min-[420px]:grid-cols-3">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                          Arrêts
                        </dt>
                        <dd className="text-lg font-bold">
                          {r.delivered}/{r.stops}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                          À encaisser
                        </dt>
                        <dd className="text-lg font-bold text-brick">{fmtCents(r.cashCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                          Encaissé
                        </dt>
                        <dd className="text-lg font-bold text-teal">
                          {fmtCents(r.collectedCents)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-2">
                      <Icon name="pin" size={13} className="mt-0.5 shrink-0" />
                      {r.cities.length ? r.cities.join(" · ") : "Aucune commune desservie"}
                    </p>

                    {/* arrêts ordonnés */}
                    <ol className="mt-3 flex-1 space-y-2">
                      {run.orders.map((o, i) => {
                        const nexts = STATUS_NEXT[o.status] ?? [];
                        return (
                          <li
                            key={o.id}
                            className="rounded-xl border border-line bg-page p-3"
                          >
                            <div className="flex items-start gap-2">
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-cream">
                                {i + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold">{o.ref}</span>
                                  <StatusPill status={o.status} />
                                </p>
                                <p className="text-sm text-ink-2">
                                  {o.customer.name} · {o.customer.phone}
                                </p>
                                <p className="text-sm text-ink-2">
                                  {o.customer.address}
                                  {o.customer.zip ? `, ${o.customer.zip}` : ""} {o.customer.city}
                                </p>
                                <p className="mt-1 text-sm font-bold text-brick">
                                  {fmtCents(o.totalCents)}
                                  {o.paid ? (
                                    <span className="ml-2 text-xs font-semibold text-teal">
                                      payée
                                    </span>
                                  ) : (
                                    <span className="ml-2 text-xs font-semibold text-[#8a6d00]">
                                      espèces à encaisser
                                    </span>
                                  )}
                                </p>
                              </div>
                              {/* `h-7 w-7` (28 px) avec 4 px d'écart rapprochait trop les
                                  boutons monter/descendre du bouton retirer — destructif — au
                                  point qu'un doigt visant « descendre » pouvait détacher la
                                  commande par erreur. Cibles à 40 px + bouton retirer séparé
                                  par une bordure. */}
                              <div className="flex shrink-0 flex-col gap-1">
                                <button
                                  type="button"
                                  onClick={() => move(run, i, -1)}
                                  disabled={busy || i === 0}
                                  aria-label={`Monter la commande ${o.ref}`}
                                  className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-panel hover:border-primary disabled:opacity-30"
                                >
                                  <Icon name="chevron" size={14} className="-rotate-90" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => move(run, i, 1)}
                                  disabled={busy || i === run.orders.length - 1}
                                  aria-label={`Descendre la commande ${o.ref}`}
                                  className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-panel hover:border-primary disabled:opacity-30"
                                >
                                  <Icon name="chevron" size={14} className="rotate-90" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => detach(run, o.id)}
                                  disabled={busy}
                                  aria-label={`Retirer la commande ${o.ref} de la tournée`}
                                  className="mt-1 grid h-10 w-10 place-items-center rounded-lg border border-line bg-panel text-brick hover:border-brick disabled:opacity-30"
                                >
                                  <Icon name="x" size={14} />
                                </button>
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {nexts.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => advanceOrder(o.id, s)}
                                  disabled={busy}
                                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                                    s === "annulee"
                                      ? "border border-brick/40 text-brick hover:bg-brick/5"
                                      : "bg-teal text-white hover:brightness-105"
                                  }`}
                                >
                                  <Icon name={s === "annulee" ? "x" : "check"} size={13} />
                                  {STATUS_LABEL[s]}
                                </button>
                              ))}
                              {!o.paid && o.status !== "annulee" && (
                                <button
                                  type="button"
                                  onClick={() => markPaid(o.id)}
                                  disabled={busy}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-primary disabled:opacity-50"
                                >
                                  <Icon name="euro" size={13} /> Encaissé
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                      {run.orders.length === 0 && (
                        <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-ink-2">
                          Tournée vide — affectez des commandes depuis la colonne de gauche.
                        </li>
                      )}
                    </ol>

                    {/* actions de tournée */}
                    <footer className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                      {run.status === "preparee" && (
                        <button
                          type="button"
                          onClick={() => setRunStatus(run, "en_cours")}
                          disabled={busy || run.orders.length === 0}
                          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-105 disabled:opacity-50"
                        >
                          <Icon name="truck" size={15} /> Départ
                        </button>
                      )}
                      {run.status === "en_cours" && (
                        <button
                          type="button"
                          onClick={() => setRunStatus(run, "terminee")}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-full bg-teal px-4 py-2 text-sm font-bold text-white hover:brightness-105 disabled:opacity-50"
                        >
                          <Icon name="check" size={15} /> Tournée terminée
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => printRun(run)}
                        className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-primary"
                      >
                        <Icon name="print" size={15} /> Feuille de route
                      </button>
                      {(run.status === "preparee" || run.status === "en_cours") && (
                        <button
                          type="button"
                          onClick={() => setRunStatus(run, "annulee")}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-full border border-brick/40 px-4 py-2 text-sm font-semibold text-brick hover:bg-brick/5 disabled:opacity-50"
                        >
                          <Icon name="x" size={15} /> Annuler
                        </button>
                      )}
                      {run.orders.length === 0 && run.status === "preparee" && (
                        <button
                          type="button"
                          onClick={() => removeRun(run)}
                          disabled={busy}
                          className="ml-auto inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-brick hover:border-brick disabled:opacity-50"
                        >
                          <Icon name="trash" size={15} /> Supprimer
                        </button>
                      )}
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* ── Feuille de route imprimable ── */}
      {sheet && (
        <div id="feuille-de-route" className="hidden bg-white text-black print:block">
          <h1 className="text-2xl font-bold">Feuille de route</h1>
          <p className="mt-1 text-sm">
            Ô 3 Saveurs — Chez Laila · {dayLabel(day)} · créneau {slotLabel(sheet.slot)}
          </p>
          <p className="mt-1 text-lg font-bold">Livreur : {sheet.driverName ?? "—"}</p>

          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Commande</th>
                <th className="py-1 pr-2">Client</th>
                <th className="py-1 pr-2">Téléphone</th>
                <th className="py-1 pr-2">Adresse</th>
                <th className="py-1 pr-2 text-right">À encaisser</th>
              </tr>
            </thead>
            <tbody>
              {sheet.orders.map((o, i) => (
                <tr key={o.id} className="border-b border-black/30 align-top">
                  <td className="py-1.5 pr-2 font-bold">{i + 1}</td>
                  <td className="py-1.5 pr-2">
                    {o.ref}
                    <br />
                    <span className="text-xs">{slotLabel(o.slot)}</span>
                  </td>
                  <td className="py-1.5 pr-2">{o.customer.name}</td>
                  <td className="py-1.5 pr-2">{o.customer.phone}</td>
                  <td className="py-1.5 pr-2">
                    {o.customer.address}
                    {o.customer.zip ? `, ${o.customer.zip}` : ""} {o.customer.city}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-bold">
                    {o.paid ? "payée" : fmtCents(o.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black">
                <td colSpan={5} className="py-2 font-bold">
                  Total espèces à ramener — {recap(sheet).stops} arrêt(s)
                </td>
                <td className="py-2 text-right text-lg font-bold">
                  {fmtCents(recap(sheet).cashCents)}
                </td>
              </tr>
            </tfoot>
          </table>

          {sheet.notes && <p className="mt-3 text-sm">Note : {sheet.notes}</p>}
          <p className="mt-8 text-sm">Départ : ................  Retour : ................</p>
          <p className="mt-4 text-sm">Signature du livreur : ..............................</p>
        </div>
      )}
    </>
  );
}
