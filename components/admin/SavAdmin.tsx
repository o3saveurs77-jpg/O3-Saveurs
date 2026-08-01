"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtCents } from "@/lib/money";
import {
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  TICKET_CATEGORY_LABEL,
} from "@/lib/types";
import type { SupportTicketView, TicketStatus } from "@/lib/types";
import { Icon } from "@/components/Icon";

/**
 * Réclamations clients.
 *
 * Les routes `/api/tickets`, `/api/tickets/[id]` et `.../messages` existaient et
 * le formulaire public sait déjà déposer une réclamation — mais l'entrée
 * « Réclamations » du menu renvoyait une 404. Un client pouvait donc écrire sans
 * que personne, côté restaurant, ait le moyen de lire ni de répondre.
 *
 * L'ordre d'affichage est celui de l'API (dernière activité en premier) : une
 * réclamation qui vient de recevoir un message remonte d'elle-même.
 */

const PRIORITES = ["basse", "normale", "haute"] as const;
type Priorite = (typeof PRIORITES)[number];

const PRIORITE_STYLE: Record<Priorite, string> = {
  basse: "bg-panel-2 text-ink-2",
  normale: "bg-teal/15 text-teal",
  haute: "bg-primary-soft text-brick",
};

const STATUT_STYLE: Record<TicketStatus, string> = {
  ouvert: "bg-primary-soft text-brick",
  en_cours: "bg-gold/20 text-[#7a5c02]",
  resolu: "bg-teal/15 text-teal",
  ferme: "bg-panel-2 text-ink-2",
};

function quand(ms: number): string {
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SavAdmin() {
  const [tickets, setTickets] = useState<SupportTicketView[]>([]);
  const [ready, setReady] = useState(false);
  const [filtre, setFiltre] = useState<TicketStatus | "tous" | "a_traiter">("a_traiter");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [reponse, setReponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "erreur"; text: string } | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets?take=100", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { tickets: SupportTicketView[] };
      setTickets(data.tickets);
    } catch {
      setMessage({ tone: "erreur", text: "Les réclamations n'ont pas pu être chargées." });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const visibles = useMemo(() => {
    if (filtre === "tous") return tickets;
    // « À traiter » regroupe ce qui attend une action du restaurant.
    if (filtre === "a_traiter") {
      return tickets.filter((t) => t.status === "ouvert" || t.status === "en_cours");
    }
    return tickets.filter((t) => t.status === filtre);
  }, [tickets, filtre]);

  const patch = async (id: string, corps: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(e?.error ?? "Modification refusée");
      }
      await charger();
    } catch (e) {
      setMessage({ tone: "erreur", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const repondre = async (id: string) => {
    const texte = reponse.trim();
    if (texte.length < 2) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tickets/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: texte }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(e?.error ?? "Envoi refusé");
      }
      setReponse("");
      await charger();
      setMessage({ tone: "ok", text: "Réponse envoyée." });
    } catch (e) {
      setMessage({ tone: "erreur", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const aTraiter = tickets.filter((t) => t.status === "ouvert" || t.status === "en_cours").length;
  const hautes = tickets.filter((t) => t.priority === "haute" && t.status !== "ferme").length;

  const ONGLETS: { k: typeof filtre; label: string }[] = [
    { k: "a_traiter", label: "À traiter" },
    { k: "tous", label: "Toutes" },
    ...TICKET_STATUSES.map((s) => ({ k: s as typeof filtre, label: TICKET_STATUS_LABEL[s] })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Réclamations</h1>
        <p className="mt-1 text-sm text-ink-2">
          {tickets.length} au total · {aTraiter} à traiter
          {hautes > 0 && <span className="font-bold text-brick"> · {hautes} en priorité haute</span>}
        </p>
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

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {ONGLETS.map((o) => (
          <button
            key={String(o.k)}
            type="button"
            onClick={() => setFiltre(o.k)}
            aria-pressed={filtre === o.k}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              filtre === o.k
                ? "bg-primary text-white"
                : "border border-line bg-panel text-ink hover:bg-panel-2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {!ready ? (
        <p className="py-16 text-center text-ink-2">Chargement…</p>
      ) : visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-line bg-panel py-16 text-center text-ink-2">
          <Icon name="chat" size={40} className="opacity-30" />
          <p className="text-lg font-bold text-ink">
            {tickets.length === 0 ? "Aucune réclamation" : "Rien dans ce filtre"}
          </p>
          <p className="text-sm">
            {tickets.length === 0
              ? "Les réclamations déposées depuis la page Contact arriveront ici."
              : "Choisissez un autre onglet pour voir les autres réclamations."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibles.map((t) => {
            const deplie = ouvert === t.id;
            const dernier = t.messages[t.messages.length - 1];
            return (
              <article
                key={t.id}
                className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    setOuvert(deplie ? null : t.id);
                    setReponse("");
                  }}
                  aria-expanded={deplie}
                  className="flex w-full items-start gap-4 p-4 text-left transition hover:bg-panel-2/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUT_STYLE[t.status]}`}
                      >
                        {TICKET_STATUS_LABEL[t.status]}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITE_STYLE[t.priority]}`}
                      >
                        {t.priority}
                      </span>
                      <span className="text-xs text-ink-2">
                        {TICKET_CATEGORY_LABEL[t.category]}
                      </span>
                      {t.orderRef && (
                        <span className="rounded bg-panel-2 px-2 py-0.5 font-mono text-xs text-ink-2">
                          {t.orderRef}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1.5 truncate text-base leading-tight">{t.subject}</h3>
                    <p className="mt-0.5 truncate text-sm text-ink-2">
                      {t.customerName} · {t.customerEmail} · {quand(t.updatedAt)}
                      {dernier && ` · ${t.messages.length} message${t.messages.length > 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <Icon
                    name="chevDown"
                    size={18}
                    className={`mt-1 shrink-0 text-ink-2 transition ${deplie ? "rotate-180" : ""}`}
                  />
                </button>

                {deplie && (
                  <div className="border-t border-line px-4 py-4">
                    {/* fil de discussion */}
                    <div className="flex flex-col gap-2.5">
                      {t.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                            m.author === "ADMIN"
                              ? "self-end bg-primary text-white"
                              : "self-start bg-panel-2 text-ink"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p
                            className={`mt-1 text-[11px] ${
                              m.author === "ADMIN" ? "text-white/70" : "text-ink-2"
                            }`}
                          >
                            {m.author === "ADMIN" ? "Restaurant" : t.customerName} ·{" "}
                            {quand(m.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {t.refundCents !== null && (
                      <p className="mt-3 rounded-xl border border-gold/40 bg-gold/10 p-2.5 text-sm">
                        Geste commercial accordé : <strong>{fmtCents(t.refundCents)}</strong>
                        {t.gestureCode && (
                          <>
                            {" "}
                            — code{" "}
                            <code className="font-mono font-bold text-brick">{t.gestureCode}</code>
                          </>
                        )}
                      </p>
                    )}

                    {/* réponse */}
                    {t.status !== "ferme" && (
                      <div className="mt-4">
                        <label htmlFor={`rep-${t.id}`} className="sr-only">
                          Répondre à {t.customerName}
                        </label>
                        <textarea
                          id={`rep-${t.id}`}
                          value={reponse}
                          onChange={(e) => setReponse(e.target.value)}
                          rows={3}
                          placeholder="Votre réponse au client…"
                          className="w-full rounded-[var(--radius-soft)] border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => repondre(t.id)}
                            disabled={busy || reponse.trim().length < 2}
                            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? "Envoi…" : "Répondre"}
                          </button>

                          <span className="ml-auto flex items-center gap-2">
                            <label htmlFor={`st-${t.id}`} className="text-xs font-bold text-ink-2">
                              Statut
                            </label>
                            <select
                              id={`st-${t.id}`}
                              value={t.status}
                              onChange={(e) => patch(t.id, { status: e.target.value })}
                              disabled={busy}
                              className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary"
                            >
                              {TICKET_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {TICKET_STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>

                            <label htmlFor={`pr-${t.id}`} className="text-xs font-bold text-ink-2">
                              Priorité
                            </label>
                            <select
                              id={`pr-${t.id}`}
                              value={t.priority}
                              onChange={(e) => patch(t.id, { priority: e.target.value })}
                              disabled={busy}
                              className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary"
                            >
                              {PRIORITES.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
