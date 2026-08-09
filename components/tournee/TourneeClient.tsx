"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtPrice } from "@/lib/menu";

/**
 * Tournée du livreur, sur son téléphone.
 *
 * Conçu pour une main, dehors, souvent au soleil : de gros boutons, un arrêt
 * à la fois mis en avant, et aucune action destructrice à portée de pouce.
 * Pas de compte ni de mot de passe — le lien reçu par SMS fait l'autorisation.
 *
 * Le code de remise n'est jamais affiché ici : le livreur doit l'entendre du
 * client. L'afficher viderait la preuve de tout son sens.
 */

interface Stop {
  id: string;
  ref: string;
  status: string;
  customerName: string;
  customerPhone: string;
  address: string;
  totalCents: number;
  paid: boolean;
  paymentMethod: string;
  hasCode: boolean;
  deliveredWithoutCode: boolean;
  driverNote: string;
  items: { qty: number; name: string }[];
}

interface Run {
  runId: string;
  driverName: string;
  date: string;
  status: string;
  stops: Stop[];
  cashToCollectCents: number;
}

type Notice = { tone: "ok" | "erreur"; text: string } | null;

export function TourneeClient({ token }: { token: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournee/${token}`, { cache: "no-store" });
      const data = (await res.json()) as Run | { error?: string };
      if (!res.ok) throw new Error(("error" in data && data.error) || "Tournée illisible");
      setRun(data as Run);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tournée illisible");
    } finally {
      setReady(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (orderId: string, action: string, payload: Record<string, string> = {}) => {
    setBusy(orderId);
    setNotice(null);
    try {
      const res = await fetch(`/api/tournee/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action, ...payload }),
      });
      const data = (await res.json()) as { error?: string; withoutCode?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Action refusée");

      setNotice({
        tone: "ok",
        text:
          action === "livree"
            ? data.withoutCode
              ? "Livrée, sans code — le restaurant est informé."
              : "Livrée. Le client reçoit sa confirmation."
            : action === "encaisse"
              ? "Encaissement enregistré."
              : "Signalement transmis au restaurant.",
      });
      setOpenId(null);
      setCode("");
      setReason("");
      await load();
    } catch (e) {
      setNotice({ tone: "erreur", text: e instanceof Error ? e.message : "Action refusée" });
    } finally {
      setBusy(null);
    }
  };

  if (!ready) return <p className="p-8 text-center text-ink-2">Chargement de la tournée…</p>;

  if (error || !run) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <Icon name="warning" size={40} className="mx-auto text-brick" />
        <h1 className="mt-4 text-2xl">Lien indisponible</h1>
        <p className="mt-2 text-ink-2">{error}</p>
      </div>
    );
  }

  const restants = run.stops.filter((s) => s.status !== "livree" && s.status !== "annulee");
  const faits = run.stops.filter((s) => s.status === "livree");

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-5">
      <header className="mb-4">
        <p className="text-sm text-ink-2">Bonjour {run.driverName}</p>
        <h1 className="text-2xl">
          {restants.length === 0
            ? "Tournée terminée 🎉"
            : `${restants.length} arrêt${restants.length > 1 ? "s" : ""} à faire`}
        </h1>
        {run.cashToCollectCents > 0 && (
          <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-sm font-bold text-brick">
            <Icon name="euro" size={15} /> {fmtPrice(run.cashToCollectCents)} à encaisser
          </p>
        )}
      </header>

      <div aria-live="polite" className="min-h-6">
        {notice && (
          <p
            className={`mb-3 rounded-xl px-4 py-3 text-sm font-semibold ${
              notice.tone === "ok" ? "bg-teal/10 text-teal" : "bg-brick/10 text-brick"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      <ul className="space-y-3">
        {[...restants, ...faits].map((s, i) => {
          const done = s.status === "livree";
          const open = openId === s.id;
          const especes = s.paymentMethod.toLowerCase().includes("espèce");

          return (
            <li
              key={s.id}
              className={`rounded-[var(--radius-card)] border bg-panel p-4 shadow-[var(--shadow-soft)] ${
                done ? "border-line opacity-60" : "border-line"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-bold ${
                    done ? "bg-teal/15 text-teal" : "bg-primary text-white"
                  }`}
                >
                  {done ? <Icon name="check" size={17} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{s.customerName}</p>
                  <p className="text-sm text-ink-2">{s.address}</p>
                  <p className="mt-1 text-xs text-ink-2">
                    {s.ref} · {s.items.reduce((n, it) => n + it.qty, 0)} article
                    {s.items.reduce((n, it) => n + it.qty, 0) > 1 ? "s" : ""} ·{" "}
                    {s.paid ? (
                      <span className="font-semibold text-teal">réglé</span>
                    ) : (
                      <span className="font-semibold text-brick">
                        {fmtPrice(s.totalCents)} à encaisser
                      </span>
                    )}
                  </p>
                  {s.deliveredWithoutCode && (
                    <p className="mt-1 text-xs font-semibold text-brick">Livrée sans code</p>
                  )}
                </div>
              </div>

              {!done && (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${s.customerPhone.replace(/\s/g, "")}`}
                      className="flex items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold"
                    >
                      <Icon name="phone" size={16} /> Appeler
                    </a>
                    {/* `geo:` n'est pas géré partout : le lien Google Maps
                        universel ouvre l'application installée sur Android
                        comme sur iPhone. */}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold"
                    >
                      <Icon name="pin" size={16} /> Y aller
                    </a>
                  </div>

                  {open ? (
                    <div className="mt-3 space-y-3 rounded-xl bg-panel-2 p-3">
                      <div>
                        <label
                          htmlFor={`code-${s.id}`}
                          className="mb-1 block text-xs font-semibold text-ink-2"
                        >
                          Code donné par le client
                        </label>
                        <input
                          id={`code-${s.id}`}
                          inputMode="numeric"
                          maxLength={4}
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                          placeholder="0000"
                          className="w-full rounded-xl border border-line bg-page px-4 py-4 text-center font-display text-3xl tracking-[0.4em] outline-none focus:border-primary"
                        />
                      </div>

                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-ink-2">
                          Le client n&apos;a pas son code ?
                        </summary>
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Client sans téléphone, code oublié…"
                          maxLength={300}
                          className="mt-2 w-full rounded-lg border border-line bg-page px-3 py-2.5 text-sm outline-none focus:border-primary"
                        />
                      </details>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenId(null)}
                          className="rounded-full border border-line py-3 text-sm font-semibold"
                        >
                          Revenir
                        </button>
                        <button
                          type="button"
                          onClick={() => act(s.id, "livree", { code, reason })}
                          disabled={busy === s.id}
                          className="rounded-full bg-primary py-3 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {busy === s.id ? "…" : "Valider"}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => act(s.id, "incident", { reason })}
                        disabled={busy === s.id || reason.trim().length < 3}
                        className="w-full rounded-full border border-line py-2.5 text-sm font-semibold text-brick disabled:opacity-40"
                      >
                        Signaler un problème
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 grid gap-2">
                      {especes && !s.paid && (
                        <button
                          type="button"
                          onClick={() => act(s.id, "encaisse")}
                          disabled={busy === s.id}
                          className="rounded-full border border-line py-3 text-sm font-bold disabled:opacity-50"
                        >
                          <Icon name="euro" size={15} /> Encaissé {fmtPrice(s.totalCents)}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(s.id);
                          setCode("");
                          setReason("");
                        }}
                        className="rounded-full bg-primary py-4 font-bold text-white"
                      >
                        Marquer livrée
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {run.stops.length === 0 && (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line p-10 text-center text-ink-2">
          Aucun arrêt sur cette tournée.
        </p>
      )}
    </div>
  );
}
