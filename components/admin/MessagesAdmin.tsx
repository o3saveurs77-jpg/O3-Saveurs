"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContactMessageView } from "@/lib/types";
import { Icon } from "@/components/Icon";

/**
 * Messages du formulaire de contact public.
 *
 * `POST /api/contact` enregistrait déjà chaque message et prévenait le
 * restaurant par email — mais rien ne les rendait visibles dans le
 * back-office. Un email de notification raté, filtré en spam ou supprimé
 * faisait perdre le message pour de bon, sans que Laila puisse s'en rendre
 * compte. Cet écran lit directement la table, l'email n'est plus le seul
 * filet.
 */

function quand(ms: number): string {
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessagesAdmin() {
  const [messages, setMessages] = useState<ContactMessageView[]>([]);
  const [ready, setReady] = useState(false);
  const [filtre, setFiltre] = useState<"a_traiter" | "traites" | "tous">("a_traiter");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/contact?take=200", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { messages: ContactMessageView[] };
      setMessages(data.messages);
    } catch {
      setErreur("Les messages n'ont pas pu être chargés.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const visibles = useMemo(() => {
    if (filtre === "tous") return messages;
    return messages.filter((m) => (filtre === "traites" ? m.handled : !m.handled));
  }, [messages, filtre]);

  const aTraiter = messages.filter((m) => !m.handled).length;

  const marquer = async (id: string, handled: boolean) => {
    setBusyId(id);
    setErreur(null);
    // Optimiste : basculer un message ne devrait jamais paraître lent.
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, handled } : m)));
    try {
      const res = await fetch(`/api/contact/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setErreur("La mise à jour a échoué, réessayez.");
      await charger();
    } finally {
      setBusyId(null);
    }
  };

  const ONGLETS: { k: typeof filtre; label: string }[] = [
    { k: "a_traiter", label: "À traiter" },
    { k: "traites", label: "Traités" },
    { k: "tous", label: "Tous" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Messages</h1>
        <p className="mt-1 text-sm text-ink-2">
          {messages.length} au total · {aTraiter} à traiter
        </p>
      </header>

      {erreur && (
        <p role="alert" className="rounded-xl border border-brick/30 bg-primary-soft p-3 text-sm text-brick">
          {erreur}
        </p>
      )}

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {ONGLETS.map((o) => (
          <button
            key={o.k}
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
          <Icon name="mail" size={40} className="opacity-30" />
          <p className="text-lg font-bold text-ink">
            {messages.length === 0 ? "Aucun message" : "Rien dans ce filtre"}
          </p>
          <p className="text-sm">
            {messages.length === 0
              ? "Les messages déposés depuis la page Contact arriveront ici."
              : "Choisissez un autre onglet pour voir les autres messages."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibles.map((m) => (
            <article
              key={m.id}
              className="rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        m.handled ? "bg-teal/15 text-teal" : "bg-primary-soft text-brick"
                      }`}
                    >
                      {m.handled ? "Traité" : "À traiter"}
                    </span>
                    <span className="text-xs text-ink-2">{quand(m.createdAt)}</span>
                  </div>
                  <h3 className="mt-1.5 text-base font-bold leading-tight">
                    {m.subject || "Sans objet"}
                  </h3>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {m.name} ·{" "}
                    <a href={`mailto:${m.email}`} className="hover:text-brick hover:underline">
                      {m.email}
                    </a>
                    {m.phone && (
                      <>
                        {" "}
                        ·{" "}
                        <a href={`tel:${m.phone.replace(/\s/g, "")}`} className="hover:text-brick hover:underline">
                          {m.phone}
                        </a>
                      </>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => marquer(m.id, !m.handled)}
                  disabled={busyId === m.id}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    m.handled
                      ? "border border-line bg-panel text-ink hover:bg-panel-2"
                      : "bg-primary text-white hover:brightness-105"
                  }`}
                >
                  {m.handled ? "Rouvrir" : "Marquer traité"}
                </button>
              </div>

              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-panel-2/60 p-3 text-sm text-ink">
                {m.message}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
