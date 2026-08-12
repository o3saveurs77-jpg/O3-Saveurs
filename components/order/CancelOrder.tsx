"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtPrice } from "@/lib/menu";
import { cancelAbility } from "@/lib/refunds";
import type { Order } from "@/lib/types";

/**
 * Annuler sa commande, depuis la page de suivi.
 *
 * Le bouton change de nature selon l'avancement, et le dit : tant que la
 * cuisine n'a rien commencé, l'annulation est immédiate ; ensuite, ce n'est
 * plus qu'une demande. Afficher le même bouton dans les deux cas laisserait
 * croire à une annulation acquise alors que les plats sont déjà en train de
 * cuire — c'est la déception qu'on veut éviter.
 *
 * Le serveur revérifie tout (`/api/orders/[id]/cancel`) : ce composant ne fait
 * qu'exposer lisiblement une décision qui ne lui appartient pas.
 */
export function CancelOrder({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const ability = cancelAbility(order.status);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "erreur"; text: string } | null>(null);

  // Rien à proposer : commande livrée, ou déjà annulée.
  if (ability.kind === "none") return null;

  const demande = ability.kind === "request";
  const dejaDemande = order.cancelRequestedAt !== null && order.status !== "annulee";

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "L'annulation n'a pas pu être enregistrée.");
      setResult({ tone: "ok", text: data.message ?? "C'est fait." });
      setOpen(false);
      onChanged();
    } catch (e) {
      setResult({
        tone: "erreur",
        text: e instanceof Error ? e.message : "L'annulation n'a pas pu être enregistrée.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
      <div aria-live="polite">
        {result && (
          <p
            className={`mb-3 rounded-xl px-4 py-2.5 text-sm font-semibold ${
              result.tone === "ok" ? "bg-teal/10 text-teal" : "bg-brick/10 text-brick"
            }`}
          >
            {result.text}
          </p>
        )}
      </div>

      {dejaDemande ? (
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <Icon name="clock" size={17} className="mt-0.5 shrink-0 text-primary" />
          Votre demande d&apos;annulation a été transmise au restaurant. Vous serez prévenu par
          email de la suite donnée.
        </p>
      ) : !open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">
            {demande
              ? "Votre commande est déjà en préparation. Vous pouvez demander son annulation au restaurant."
              : "Vous pouvez encore annuler cette commande sans frais."}
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-brick transition hover:bg-brick/10"
          >
            {demande ? "Demander l'annulation" : "Annuler ma commande"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold">
            {demande ? "Demander l'annulation de cette commande ?" : "Annuler cette commande ?"}
          </p>

          {/* Un remboursement n'est pas instantané et n'est pas automatique :
              le dire ici évite l'attente inquiète, puis la réclamation. */}
          {order.paid && (
            <p className="rounded-xl bg-primary-soft p-3 text-sm text-brick">
              Vous avez réglé {fmtPrice(order.totalCents)}. Le remboursement est traité par le
              restaurant, puis crédité par votre banque sous quelques jours. Vous recevrez un avoir
              par email.
            </p>
          )}

          <label htmlFor="cancel-reason" className="block text-xs font-semibold text-ink-2">
            Motif (facultatif)
          </label>
          <textarea
            id="cancel-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Erreur dans ma commande, contretemps…"
            className="w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-primary"
          />

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel-2"
            >
              Revenir
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="rounded-full bg-brick px-5 py-2 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {busy ? "Envoi…" : demande ? "Envoyer la demande" : "Confirmer l'annulation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
