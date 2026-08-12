"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtCents, toCents, toEuros } from "@/lib/money";
import { checkRefund, refundableCents } from "@/lib/refunds";
import { formatCreditNoteNumber } from "@/lib/refunds";
import type { Order } from "@/lib/types";

/**
 * Remboursement d'une commande, depuis le back-office.
 *
 * Le montant proposé par défaut est ce qu'il **reste** remboursable, jamais le
 * total : sur une commande déjà remboursée en partie, proposer le total mènerait
 * à rendre deux fois la même somme. Le serveur revérifie de toute façon
 * (`/api/orders/[id]/refund`) — ce panneau ne fait qu'éviter la mauvaise
 * surprise à l'écran.
 */
export function RefundOrder({
  order,
  onDone,
}: {
  order: Order;
  onDone: (message: string) => void;
}) {
  const restant = refundableCents(order);
  const uid = useId();

  const [open, setOpen] = useState(false);
  const [euros, setEuros] = useState(() => toEuros(restant));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Commande jamais encaissée : il n'y a rien à rendre.
  if (!order.paid) return null;

  const dejaRendu = order.refundedCents > 0;
  const amountCents = toCents(euros) ?? 0;
  const check = checkRefund(order, amountCents);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, reason: reason.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        creditNoteNumber?: number;
        channel?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Le remboursement a échoué.");

      const numero = formatCreditNoteNumber(data.creditNoteNumber ?? null);
      onDone(
        data.channel === "especes"
          ? `Avoir ${numero} émis pour ${fmtCents(amountCents)}. Pensez à rendre la somme en caisse : aucun virement n'a été déclenché.`
          : `${fmtCents(amountCents)} remboursés. Avoir ${numero} envoyé au client.`,
      );
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Le remboursement a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-page p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {dejaRendu ? (
            <>
              <span className="font-semibold text-brick">
                {fmtCents(order.refundedCents)} déjà remboursés
              </span>
              {restant > 0 ? (
                <span className="text-ink-2"> · {fmtCents(restant)} encore remboursables</span>
              ) : (
                <span className="text-ink-2"> · intégralement remboursée</span>
              )}
              {order.creditNoteNumber !== null && (
                <span className="text-ink-2">
                  {" "}
                  · avoir {formatCreditNoteNumber(order.creditNoteNumber)}
                </span>
              )}
            </>
          ) : (
            <span className="text-ink-2">{fmtCents(restant)} remboursables</span>
          )}
        </p>

        {restant > 0 && !open && (
          <button
            type="button"
            onClick={() => {
              setEuros(toEuros(restant));
              setOpen(true);
            }}
            className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-brick hover:bg-brick/10"
          >
            Rembourser
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
            <div>
              <label htmlFor={`${uid}-montant`} className="mb-1 block text-xs font-semibold text-ink-2">
                Montant (€)
              </label>
              <input
                id={`${uid}-montant`}
                type="number"
                step="0.01"
                min="0"
                max={toEuros(restant)}
                value={euros}
                onChange={(e) => setEuros(e.target.value)}
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-motif`} className="mb-1 block text-xs font-semibold text-ink-2">
                Motif — repris sur l&apos;avoir
              </label>
              <input
                id={`${uid}-motif`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Plat manquant, annulation…"
                maxLength={500}
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-lg bg-panel-2 p-2.5 text-xs text-ink-2">
            <Icon name="warning" size={14} className="mt-0.5 shrink-0 text-primary" />
            {order.paymentMethod.toLowerCase().includes("espèce")
              ? "Réglée en espèces : aucun virement ne partira. L'avoir est émis et envoyé, la somme est à rendre en caisse."
              : "Le remboursement part chez Stripe immédiatement et n'est pas annulable. Un avoir est envoyé au client."}
          </p>

          {(error || !check.ok) && (
            <p className="rounded-lg bg-brick/10 px-3 py-2 text-sm font-semibold text-brick">
              {error ?? (check.ok ? "" : check.error)}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold hover:bg-panel-2"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !check.ok}
              className="rounded-full bg-brick px-4 py-1.5 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {busy ? "Remboursement…" : `Rembourser ${fmtCents(amountCents)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
