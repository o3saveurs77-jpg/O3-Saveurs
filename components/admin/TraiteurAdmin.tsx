"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CateringInquiryView, CateringStatus } from "@/lib/types";
import { CATERING_EVENT_TYPE_LABEL, CATERING_STATUSES, CATERING_STATUS_LABEL } from "@/lib/types";
import { Icon } from "@/components/Icon";

/**
 * Demandes de devis traiteur, déposées depuis la page publique `/traiteur`.
 * Même logique que `MessagesAdmin` (lecture directe de la table, l'email de
 * notification n'est qu'un relais) : le statut se change depuis ici, pas
 * depuis la boîte mail.
 */

const STATUS_COLOR: Record<CateringStatus, string> = {
  nouveau: "bg-primary-soft text-brick",
  contacte: "bg-gold/20 text-[#7a5f00]",
  devis_envoye: "bg-teal/15 text-[#0f6b5e]",
  confirme: "bg-[#e9f7f4] text-[#0f6b5e]",
  decline: "bg-panel-2 text-ink-2",
};

function quand(ms: number): string {
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function quandDate(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export function TraiteurAdmin() {
  const [inquiries, setInquiries] = useState<CateringInquiryView[]>([]);
  const [ready, setReady] = useState(false);
  const [filtre, setFiltre] = useState<"actives" | "toutes">("actives");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/traiteur?take=200", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { inquiries: CateringInquiryView[] };
      setInquiries(data.inquiries);
    } catch {
      setErreur("Les demandes n'ont pas pu être chargées.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const visibles = useMemo(() => {
    if (filtre === "toutes") return inquiries;
    return inquiries.filter((i) => i.status !== "confirme" && i.status !== "decline");
  }, [inquiries, filtre]);

  const actives = inquiries.filter((i) => i.status !== "confirme" && i.status !== "decline").length;

  const changerStatut = async (id: string, status: CateringStatus) => {
    setBusyId(id);
    setErreur(null);
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      const res = await fetch(`/api/traiteur/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
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
    { k: "actives", label: "En cours" },
    { k: "toutes", label: "Toutes" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Traiteur</h1>
        <p className="mt-1 text-sm text-ink-2">
          {inquiries.length} au total · {actives} en cours
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
          <Icon name="sparkle" size={40} className="opacity-30" />
          <p className="text-lg font-bold text-ink">
            {inquiries.length === 0 ? "Aucune demande" : "Rien dans ce filtre"}
          </p>
          <p className="text-sm">
            {inquiries.length === 0
              ? "Les demandes de devis déposées depuis la page Traiteur arriveront ici."
              : "Choisissez un autre onglet pour voir les autres demandes."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibles.map((i) => (
            <article
              key={i.id}
              className="rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOR[i.status]}`}>
                      {CATERING_STATUS_LABEL[i.status]}
                    </span>
                    <span className="text-xs text-ink-2">Déposée le {quand(i.createdAt)}</span>
                  </div>
                  <h3 className="mt-1.5 text-base font-bold leading-tight">
                    {CATERING_EVENT_TYPE_LABEL[i.eventType as keyof typeof CATERING_EVENT_TYPE_LABEL] ??
                      i.eventType}
                  </h3>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {i.customerName} ·{" "}
                    <a href={`mailto:${i.customerEmail}`} className="hover:text-brick hover:underline">
                      {i.customerEmail}
                    </a>{" "}
                    ·{" "}
                    <a
                      href={`tel:${i.customerPhone.replace(/\s/g, "")}`}
                      className="hover:text-brick hover:underline"
                    >
                      {i.customerPhone}
                    </a>
                  </p>
                  <p className="mt-1 text-sm text-ink-2">
                    <Icon name="pin" size={14} className="mr-1 inline-block align-[-2px] text-primary" />
                    {i.location}
                    {i.eventDate && <> · {quandDate(i.eventDate)}</>}
                    {i.guestCount && <> · {i.guestCount} convives</>}
                  </p>
                </div>

                <select
                  value={i.status}
                  disabled={busyId === i.id}
                  onChange={(e) => changerStatut(i.id, e.target.value as CateringStatus)}
                  className="shrink-0 rounded-full border border-line bg-panel px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {CATERING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CATERING_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              {i.message && (
                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-panel-2/60 p-3 text-sm text-ink">
                  {i.message}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
