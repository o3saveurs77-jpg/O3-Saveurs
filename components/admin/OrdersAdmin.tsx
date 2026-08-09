"use client";

import { useMemo, useState } from "react";
import { useOrders } from "@/components/providers/OrdersContext";
import { STATUS_LABEL, STATUS_NEXT, PAYMENT_STATUS_LABEL } from "@/lib/types";
import type { Order, OrderLine, OrderStatus } from "@/lib/types";
import { fmtPrice } from "@/lib/menu";
import { Icon } from "@/components/Icon";
import { StatusPill } from "./StatusPill";
import { RefundOrder } from "./RefundOrder";

const FILTERS: { k: OrderStatus | "all" | "actives" | "impayees"; label: string }[] = [
  { k: "actives", label: "En cours" },
  { k: "impayees", label: "Non payées" },
  { k: "all", label: "Toutes" },
  { k: "en_attente_paiement", label: "Attente paiement" },
  { k: "confirmee", label: "Confirmées" },
  { k: "cuisine", label: "En cuisine" },
  { k: "route", label: "En route" },
  { k: "livree", label: "Livrées" },
  { k: "annulee", label: "Annulées" },
];

const ACTIVE: OrderStatus[] = ["confirmee", "cuisine", "route"];

/** Les lignes de commande n'ont pas de `key` : elle est dérivée du contenu. */
const lineKey = (l: OrderLine) => `${l.dishId}-${l.formule ?? ""}-${JSON.stringify(l.opts)}`;

/**
 * Commandes du back-office.
 *
 * Deux corrections de fond :
 *
 *  · Les mutations passaient par le contexte client, lequel exposait un
 *    `setStatus` accessible depuis n'importe quelle page — la page de suivi
 *    client s'en servait pour faire avancer le statut toute seule. Elles passent
 *    désormais par `PATCH /api/orders/{id}`, réservé à l'administration, et les
 *    transitions proposées suivent `STATUS_NEXT` : on ne revient pas d'une
 *    commande livrée à « en cuisine ».
 *
 *  · L'état de paiement n'était affiché nulle part : rien ne distinguait une
 *    commande réglée d'un panier abandonné, et Laila cuisinait des commandes
 *    jamais payées. Les commandes en espèces disposent d'un bouton
 *    « Encaissé », sans lequel tout ce chiffre d'affaires restait invisible en
 *    facturation.
 */
export function OrdersAdmin() {
  const { orders, ready, refresh } = useOrders();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["k"]>("actives");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Un remboursement réussi mérite mieux qu'un rafraîchissement silencieux :
     rien à l'écran ne dirait si l'argent est bien parti. */
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "actives") return orders.filter((o) => ACTIVE.includes(o.status));
    if (filter === "impayees") return orders.filter((o) => !o.paid && o.status !== "annulee");
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Modification refusée");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification impossible.");
    } finally {
      setBusyId(null);
    }
  };

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  const unpaid = orders.filter((o) => !o.paid && o.status !== "annulee").length;

  return (
    <div className="space-y-5 print:hidden">
      <div>
        <h1 className="text-3xl">Commandes</h1>
        <p className="text-ink-2">
          {filtered.length} commande{filtered.length > 1 ? "s" : ""} affichée
          {filtered.length > 1 ? "s" : ""}
          {unpaid > 0 && (
            <>
              {" · "}
              <strong className="text-brick">
                {unpaid} non payée{unpaid > 1 ? "s" : ""}
              </strong>
            </>
          )}
        </p>
      </div>

      <div aria-live="polite" className="min-h-6 space-y-2">
        {error && (
          <p className="rounded-xl bg-brick/10 px-4 py-2.5 text-sm font-semibold text-brick">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-xl bg-teal/10 px-4 py-2.5 text-sm font-semibold text-teal">
            {notice}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les commandes">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            aria-pressed={filter === f.k}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              filter === f.k
                ? "bg-primary text-white"
                : "border border-line bg-panel hover:bg-panel-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            open={openId === o.id}
            busy={busyId === o.id}
            onToggle={() => setOpenId((id) => (id === o.id ? null : o.id))}
            onStatus={(status) => patch(o.id, { status })}
            onCollect={() => patch(o.id, { paid: true })}
            onDeclineCancel={() => patch(o.id, { declineCancel: true })}
            /* Le remboursement passe par sa propre route : on recharge la liste
               pour que le montant restant affiché soit celui de la base. */
            onRefunded={(message) => {
              setNotice(message);
              void refresh();
            }}
          />
        ))}
        {filtered.length === 0 && (
          <p className="rounded-[var(--radius-card)] border border-line bg-panel py-16 text-center text-ink-2">
            Aucune commande dans cette catégorie.
          </p>
        )}
      </div>
    </div>
  );
}

function OrderRow({
  order,
  open,
  busy,
  onToggle,
  onStatus,
  onCollect,
  onRefunded,
  onDeclineCancel,
}: {
  order: Order;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onStatus: (s: OrderStatus) => void;
  onCollect: () => void;
  onRefunded: (message: string) => void;
  onDeclineCancel: () => void;
}) {
  // Seules les transitions déclarées sont proposées, et la première est mise en
  // avant comme action principale.
  const allowed = STATUS_NEXT[order.status] ?? [];
  const forward = allowed.filter((s) => s !== "annulee");
  const canCancel = allowed.includes("annulee");

  const time = new Date(order.createdAt).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const cash = order.paymentMethod.toLowerCase().includes("espèce");

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel-2 text-brick">
          <Icon name={order.mode === "livraison" ? "truck" : "bag"} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{order.ref}</span>
            <StatusPill status={order.status} />
            {!order.paid && order.status !== "annulee" && (
              <span className="rounded-full bg-brick/10 px-2.5 py-0.5 text-xs font-bold text-brick">
                {PAYMENT_STATUS_LABEL[order.paymentStatus]} · non payée
              </span>
            )}
            {order.refundedCents > 0 && (
              <span className="rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-bold text-teal">
                {PAYMENT_STATUS_LABEL[order.paymentStatus]} · {fmtPrice(order.refundedCents)}
              </span>
            )}
            {/* Une demande d'annulation attend une réponse humaine : elle doit
                se voir sans avoir à déplier la commande. */}
            {order.cancelRequestedAt !== null && order.status !== "annulee" && (
              <span className="rounded-full bg-gold/25 px-2.5 py-0.5 text-xs font-bold text-[#7a5f00]">
                Annulation demandée
              </span>
            )}
          </div>
          <p className="truncate text-sm text-ink-2">
            {order.customer.name} · {time} ·{" "}
            {order.lines.reduce((s, l) => s + l.qty, 0)} articles
          </p>
        </div>
        <span className="shrink-0 font-bold text-brick">{fmtPrice(order.totalCents)}</span>
        <Icon name={open ? "chevDown" : "chevron"} size={18} className="shrink-0 text-ink-2" />
      </button>

      {open && (
        <div className="border-t border-line bg-page/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-bold text-ink-2">Articles</h3>
              <ul className="space-y-1 text-sm">
                {order.lines.map((l) => (
                  <li key={lineKey(l)} className="flex justify-between gap-2">
                    <span>
                      {l.qty}× {l.name}
                      {l.formule && <span className="text-ink-2"> · {l.formule}</span>}
                      {Object.values(l.opts).length > 0 && (
                        <span className="text-ink-2"> · {Object.values(l.opts).join(", ")}</span>
                      )}
                    </span>
                    <span>{fmtPrice(l.lineTotalCents)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-2 space-y-0.5 border-t border-line pt-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-2">Sous-total</dt>
                  <dd>{fmtPrice(order.subtotalCents)}</dd>
                </div>
                {order.discountCents > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-2">
                      Remise{order.promoCode ? ` (${order.promoCode})` : ""}
                    </dt>
                    <dd>− {fmtPrice(order.discountCents)}</dd>
                  </div>
                )}
                {order.feeCents > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-2">Livraison</dt>
                    <dd>{fmtPrice(order.feeCents)}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-ink-2">Client</h3>
              <p className="text-sm">{order.customer.name}</p>
              <p className="text-sm text-ink-2">
                <a href={`tel:${order.customer.phone}`} className="hover:text-brick">
                  {order.customer.phone}
                </a>
              </p>
              <p className="text-sm text-ink-2">{order.customer.email}</p>
              {order.customer.address && (
                <p className="text-sm text-ink-2">
                  {order.customer.address}, {order.customer.zip} {order.customer.city}
                </p>
              )}
              <p className="mt-1 text-sm text-ink-2">
                Créneau : {order.slot === "asap" ? "dès que possible" : order.slot}
              </p>
              <p className="text-sm text-ink-2">
                Paiement : {order.paymentMethod} —{" "}
                <strong className={order.paid ? "text-ink" : "text-brick"}>
                  {order.paid ? "réglé" : "à encaisser"}
                </strong>
              </p>
              {order.driverName && (
                <p className="mt-1 text-sm">
                  Livreur : <strong>{order.driverName}</strong>
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {forward.map((s, i) => (
              <button
                key={s}
                onClick={() => onStatus(s)}
                disabled={busy}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition disabled:opacity-50 ${
                  i === 0
                    ? "bg-primary text-white hover:brightness-105"
                    : "border border-line bg-panel hover:bg-panel-2"
                }`}
              >
                <Icon name="check" size={16} /> {STATUS_LABEL[s]}
              </button>
            ))}

            {cash && !order.paid && order.status !== "annulee" && (
              <button
                onClick={onCollect}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-5 py-2.5 text-sm font-bold hover:bg-panel-2 disabled:opacity-50"
              >
                <Icon name="euro" size={16} /> Encaissé ({fmtPrice(order.totalCents)})
              </button>
            )}

            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:bg-panel-2"
            >
              <Icon name="print" size={16} /> Imprimer le ticket
            </button>

            {canCancel && (
              <button
                onClick={() => onStatus("annulee")}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-brick hover:bg-brick/10 disabled:opacity-50"
              >
                <Icon name="x" size={16} /> Annuler
              </button>
            )}
          </div>

          {/* Ce que le client a écrit en demandant l'annulation : la décision
              revient au restaurant, encore faut-il lui donner le motif. */}
          {order.cancelRequestedAt !== null && order.status !== "annulee" && (
            <div className="mt-3 rounded-xl bg-gold/15 p-3 text-sm print:hidden">
              <p>
                <strong>Annulation demandée par le client.</strong>{" "}
                {order.cancelReason || "Aucun motif précisé."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onStatus("annulee")}
                  disabled={busy}
                  className="rounded-full bg-brick px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  Accepter et annuler
                </button>
                {/* Refuser sans le dire laisserait le client attendre une
                    annulation qui ne vient pas, puis recevoir sa commande. */}
                <button
                  onClick={onDeclineCancel}
                  disabled={busy}
                  className="rounded-full border border-line bg-panel px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Refuser — prévenir le client
                </button>
                <span className="text-xs text-ink-2">
                  {order.paid ? "Commande payée : pensez à rembourser si vous acceptez." : ""}
                </span>
              </div>
            </div>
          )}

          {/* Remboursement — le panneau se retire de lui-même sur une commande
              jamais encaissée. */}
          <div className="print:hidden">
            <RefundOrder order={order} onDone={onRefunded} />
          </div>

          {/*
            Ticket de cuisine. `window.print()` imprimait toute la page
            d'administration — sidebar, filtres et commandes ouvertes comprises.
            Ce bloc est le seul visible à l'impression, l'interface étant masquée
            par le `print:hidden` de la racine.
          */}
          <div className="hidden print:block print:p-0">
            <h2 className="text-xl font-bold">Ô 3 Saveurs — {order.ref}</h2>
            <p className="text-sm">
              {time} · {order.mode === "livraison" ? "Livraison" : "À emporter"} ·{" "}
              {order.slot === "asap" ? "dès que possible" : order.slot}
            </p>
            <ul className="mt-3 space-y-1">
              {order.lines.map((l) => (
                <li key={lineKey(l)}>
                  <strong>
                    {l.qty}× {l.name}
                  </strong>
                  {l.formule && ` — ${l.formule}`}
                  {Object.values(l.opts).length > 0 && ` — ${Object.values(l.opts).join(", ")}`}
                  {l.note && ` — NOTE : ${l.note}`}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-bold">
              Total {fmtPrice(order.totalCents)} — {order.paid ? "PAYÉ" : "À ENCAISSER"}
            </p>
            {order.customer.address && (
              <p className="mt-2 text-sm">
                {order.customer.name} · {order.customer.phone}
                <br />
                {order.customer.address}, {order.customer.zip} {order.customer.city}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
