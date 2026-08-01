"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCartActions } from "@/components/cart/CartContext";
import { useAuth } from "@/components/providers/AuthContext";
import { fmtPrice } from "@/lib/menu";
import { STATUS_FLOW, STATUS_LABEL } from "@/lib/types";
import type { Order, OrderLine, OrderStatus } from "@/lib/types";
import { Icon, type IconName } from "@/components/Icon";

/** Doit rester aligné sur la clé écrite par `CheckoutClient` avant la redirection. */
const PENDING_ORDER_KEY = "ots_pending_order";

/** Doit rester aligné sur la clé écrite par `CheckoutClient` avant la redirection. */
const WANTS_ACCOUNT_KEY = "ots_wants_account";

/** Intervalle de rafraîchissement du suivi, en lecture seule. */
const POLL_MS = 20_000;

const STEP_ICON: Record<(typeof STATUS_FLOW)[number], IconName> = {
  confirmee: "check",
  cuisine: "flame",
  route: "truck",
  livree: "home",
};

/** Les lignes de commande n'ont pas de `key` : elle est dérivée du contenu. */
const lineKey = (l: OrderLine) => `${l.dishId}-${l.formule ?? ""}-${JSON.stringify(l.opts)}`;

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});

type State =
  | { kind: "loading" }
  | { kind: "ok"; order: Order }
  | { kind: "unauthorized" }
  | { kind: "missing" }
  | { kind: "error" };

/**
 * Suivi de commande — **en lecture seule**.
 *
 * Un `useEffect` faisait ici avancer le statut toutes les 12 secondes via un
 * vrai `PATCH /api/orders/[id]` : le navigateur du client faisait passer sa
 * propre commande de « Confirmée » à « Livrée » en 36 secondes, l'écran des
 * livraisons se vidait tout seul et le taux de livraison du tableau de bord
 * était fictif. Les transitions sont désormais réservées à l'administration ;
 * cette page ne fait que relire l'état réel.
 */
export function OrderTracker({ id }: { id: string }) {
  const { clear } = useCartActions();
  const { login } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });
  const cleared = useRef(false);

  // Lu une seule fois : reflète le choix fait au tunnel de commande, pour cette
  // commande précise. Sert à personnaliser l'écran « connexion requise » que
  // rencontre systématiquement un invité juste après avoir payé.
  const [wantsAccount, setWantsAccount] = useState(false);
  useEffect(() => {
    try {
      setWantsAccount(sessionStorage.getItem(WANTS_ACCOUNT_KEY) === id);
    } catch {
      setWantsAccount(false);
    }
  }, [id]);

  const load = useCallback(async (): Promise<OrderStatus | null> => {
    try {
      const res = await fetch(`/api/orders/${id}`, { cache: "no-store" });
      if (res.status === 401) {
        setState({ kind: "unauthorized" });
        return null;
      }
      if (res.status === 404) {
        setState({ kind: "missing" });
        return null;
      }
      if (!res.ok) {
        setState((s) => (s.kind === "ok" ? s : { kind: "error" }));
        return null;
      }
      const order = (await res.json()) as Order;
      setState({ kind: "ok", order });
      return order.status;
    } catch {
      setState((s) => (s.kind === "ok" ? s : { kind: "error" }));
      return null;
    }
  }, [id]);

  /* Le panier n'est vidé qu'ici, **au retour confirmé** : `clear()` était appelé
   * avant la redirection vers Stripe, si bien qu'un client qui renonçait au
   * paiement revenait sur un panier vide. */
  useEffect(() => {
    if (state.kind !== "ok" || cleared.current) return;
    try {
      if (sessionStorage.getItem(PENDING_ORDER_KEY) === state.order.id) {
        sessionStorage.removeItem(PENDING_ORDER_KEY);
        cleared.current = true;
        clear();
      }
      sessionStorage.removeItem(WANTS_ACCOUNT_KEY);
    } catch {
      /* stockage indisponible : le panier sera vidé au prochain ajout */
    }
  }, [state, clear]);

  // Rafraîchissement périodique, arrêté dès que la commande est dans un état final.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let alive = true;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    load().then((status) => {
      if (!alive || status === "livree" || status === "annulee") return;
      timer = setInterval(async () => {
        const next = await load();
        if (next === "livree" || next === "annulee") stop();
      }, POLL_MS);
    });

    return () => {
      alive = false;
      stop();
    };
  }, [load]);

  if (state.kind === "loading") {
    return (
      <div className="wrap py-24 text-center text-ink-2" aria-live="polite">
        Chargement de votre commande…
      </div>
    );
  }

  if (state.kind === "unauthorized") {
    // Ramène directement sur cette page une fois connecté (plutôt que sur
    // `/compte`) : un compte créé avec la même adresse email que la commande
    // y est automatiquement rattaché (voir `GET /api/orders/[id]`).
    const backHere = () => login(window.location.pathname + window.location.search);
    return (
      <div className="wrap flex flex-col items-center gap-4 py-24 text-center">
        <Icon name="lock" size={48} className="text-ink-2 opacity-40" />
        <h1 className="text-2xl">Connexion requise</h1>
        <p className="max-w-md text-ink-2">
          {wantsAccount
            ? "Vous avez choisi de créer un compte pour cette commande : connectez-vous avec l'adresse email indiquée à la commande, il sera créé automatiquement et rattaché à celle-ci."
            : "Le suivi d'une commande est réservé à son destinataire. Connectez-vous avec l'adresse email utilisée lors de la commande pour y accéder."}
        </p>
        <button
          onClick={backHere}
          className="rounded-full bg-primary px-6 py-3 font-bold text-white hover:brightness-105"
        >
          {wantsAccount ? "Créer mon compte" : "Se connecter"}
        </button>
      </div>
    );
  }

  if (state.kind === "missing" || state.kind === "error") {
    return (
      <div className="wrap flex flex-col items-center gap-4 py-24 text-center">
        <Icon name="search" size={48} className="text-ink-2 opacity-30" />
        <h1 className="text-2xl">
          {state.kind === "missing" ? "Commande introuvable" : "Suivi momentanément indisponible"}
        </h1>
        <p className="max-w-md text-ink-2">
          {state.kind === "missing"
            ? "Cette commande n'existe pas ou n'est pas rattachée à votre compte."
            : "Réessayez dans un instant, ou appelez-nous pour connaître l'avancement."}
        </p>
        <Link href="/carte" className="rounded-full bg-primary px-6 py-3 font-bold text-white">
          Retour à la carte
        </Link>
      </div>
    );
  }

  const { order } = state;
  // `STATUS_FLOW` ne couvre que la progression normale : les statuts hors flux
  // (« en attente de paiement », « annulée ») donnent volontairement -1 et sont
  // traités par les deux drapeaux ci-dessous.
  const currentIdx = (STATUS_FLOW as readonly OrderStatus[]).indexOf(order.status);
  const cancelled = order.status === "annulee";
  const awaitingPayment = order.status === "en_attente_paiement";
  const lastLabel = order.mode === "emporter" ? "Prête !" : "Livrée";

  const steps: { status: (typeof STATUS_FLOW)[number]; at: number | null }[] = [
    { status: "confirmee", at: order.timeline.confirmedAt },
    { status: "cuisine", at: order.timeline.cookingAt },
    { status: "route", at: order.timeline.routeAt },
    { status: "livree", at: order.timeline.deliveredAt },
  ];

  return (
    <div className="wrap max-w-3xl py-10">
      {/* confirmation */}
      <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 text-center shadow-[var(--shadow-soft)] sm:p-6">
        <div
          className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${
            awaitingPayment
              ? "bg-primary-soft text-brick"
              : cancelled
                ? "bg-primary-soft text-brick"
                : "bg-[#e9f7f4] text-teal"
          }`}
        >
          <Icon name={awaitingPayment ? "clock" : cancelled ? "x" : "check"} size={34} />
        </div>
        <h1 className="mt-4 text-2xl sm:text-3xl">
          {awaitingPayment
            ? "Paiement en cours de confirmation"
            : cancelled
              ? "Commande annulée"
              : "Merci pour votre commande !"}
        </h1>
        <p className="mt-1 text-ink-2">
          Commande <strong className="text-ink">{order.ref}</strong>
          {awaitingPayment ? (
            <> — nous attendons la confirmation de votre paiement. Cette page se met à jour seule.</>
          ) : cancelled ? (
            <> — aucun montant ne vous sera débité pour cette commande.</>
          ) : (
            <> — un email de confirmation vous a été envoyé.</>
          )}
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-panel-2 px-3 py-1 text-sm font-semibold">
          {order.paid ? (
            <>
              <Icon name="check" size={15} className="text-teal" /> Payée
            </>
          ) : (
            <>
              <Icon name="clock" size={15} className="text-primary" /> Reste à payer{" "}
              {fmtPrice(order.totalCents)}
            </>
          )}
        </p>
      </div>

      {/* suivi */}
      {!cancelled && !awaitingPayment && (
        <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)] sm:p-6">
          <h2 className="mb-6 text-lg">Suivi de préparation</h2>
          <ol className="relative flex justify-between">
            {/* ligne de progression */}
            <div
              className="absolute left-0 top-5 h-1 w-full -translate-y-1/2 rounded bg-line"
              aria-hidden="true"
            />
            <div
              className="absolute left-0 top-5 h-1 -translate-y-1/2 rounded bg-teal transition-all duration-700"
              style={{
                width: `${(Math.max(0, currentIdx) / (STATUS_FLOW.length - 1)) * 100}%`,
              }}
              aria-hidden="true"
            />
            {steps.map(({ status, at }, i) => {
              const done = i <= currentIdx;
              const active = i === currentIdx;
              const label = i === STATUS_FLOW.length - 1 ? lastLabel : STATUS_LABEL[status];
              return (
                /* `min-w-0` : sans lui, l'intitulé le plus long (« En
                   préparation ») imposait sa largeur à sa colonne, les quatre
                   étapes ne tenaient plus dans la carte et la frise débordait
                   sous 380 px. */
                <li
                  key={status}
                  className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-2"
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition ${
                      done ? "border-teal bg-teal text-white" : "border-line bg-panel text-ink-2"
                    } ${active ? "ring-4 ring-teal/20" : ""}`}
                  >
                    <Icon name={STEP_ICON[status]} size={18} />
                  </span>
                  <span
                    className={`text-center text-[11px] font-semibold leading-tight sm:text-xs ${
                      done ? "text-ink" : "text-ink-2"
                    }`}
                  >
                    {label}
                  </span>
                  {/* horodatage réel de l'étape, quand elle a eu lieu */}
                  <span className="text-center text-[11px] text-ink-2">
                    {at ? timeFmt.format(new Date(at)) : "—"}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-5 text-center text-sm text-ink-2" aria-live="polite">
            {order.status === "livree"
              ? "Bon appétit ! 🍽️"
              : "Cette page se met à jour automatiquement. Vous recevez aussi un email à chaque étape."}
          </p>
        </div>
      )}

      {/* journal horodaté */}
      <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
        <h2 className="mb-3 font-bold">Historique</h2>
        <ol className="space-y-2 text-sm">
          <li className="flex justify-between gap-3">
            <span className="text-ink-2">Commande passée</span>
            <span className="font-semibold">{dateFmt.format(new Date(order.createdAt))}</span>
          </li>
          {steps
            .filter((s) => s.at !== null)
            .map(({ status, at }) => (
              <li key={status} className="flex justify-between gap-3">
                <span className="text-ink-2">{STATUS_LABEL[status]}</span>
                <span className="font-semibold">{dateFmt.format(new Date(at!))}</span>
              </li>
            ))}
          {order.timeline.canceledAt !== null && (
            <li className="flex justify-between gap-3 text-brick">
              <span>Annulée</span>
              <span className="font-semibold">
                {dateFmt.format(new Date(order.timeline.canceledAt))}
              </span>
            </li>
          )}
        </ol>
      </div>

      {/* détails */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-3 font-bold">Détails</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-2">Mode</dt>
              <dd className="font-semibold capitalize">{order.mode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Créneau</dt>
              <dd className="font-semibold">
                {order.slot === "asap" ? "Au plus vite" : order.slot}
              </dd>
            </div>
            {order.mode === "livraison" && order.zoneIdx !== null && (
              <div className="flex justify-between">
                <dt className="text-ink-2">Zone</dt>
                <dd className="font-semibold">Zone {order.zoneIdx + 1}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-2">Paiement</dt>
              <dd className="font-semibold">{order.paymentMethod}</dd>
            </div>
            {order.driverName && (
              <div className="flex justify-between">
                <dt className="text-ink-2">Livreur</dt>
                <dd className="font-semibold">{order.driverName}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-3 font-bold">Votre commande</h2>
          <ul className="space-y-2 text-sm">
            {order.lines.map((l) => (
              <li key={lineKey(l)} className="flex justify-between gap-2">
                <span>
                  {l.qty}× {l.name}
                  {l.formule && <span className="block text-xs text-ink-2">{l.formule}</span>}
                </span>
                <span className="font-semibold">{fmtPrice(l.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <div className="my-3 h-px bg-line" />
          <div className="flex justify-between text-sm">
            <span className="text-ink-2">Sous-total</span>
            <span>{fmtPrice(order.subtotalCents)}</span>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between text-sm text-teal">
              <span>Remise{order.promoCode ? ` (${order.promoCode})` : ""}</span>
              <span>−{fmtPrice(order.discountCents)}</span>
            </div>
          )}
          {order.feeCents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-2">Livraison</span>
              <span>{fmtPrice(order.feeCents)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between font-bold">
            <span>Total TTC</span>
            <span className="text-brick">{fmtPrice(order.totalCents)}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/compte"
          className="rounded-full border border-line bg-panel px-6 py-3 font-semibold hover:bg-panel-2"
        >
          Mes commandes
        </Link>
        <Link
          href="/carte"
          className="rounded-full bg-primary px-6 py-3 font-bold text-white hover:brightness-105"
        >
          Commander à nouveau
        </Link>
      </div>
    </div>
  );
}
