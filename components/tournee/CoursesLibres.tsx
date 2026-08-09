"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtPrice } from "@/lib/menu";

/**
 * Courses libres — le livreur se sert.
 *
 * N'apparaît que pour un livreur **connecté** : la prise en charge engage une
 * personne identifiée, ce qu'un lien privé transmis par SMS ne garantit pas.
 * Le livreur au lien continue de recevoir sa tournée toute faite.
 *
 * Premier arrivé, premier servi : une course prise par un autre disparaît au
 * rafraîchissement, et le message le dit plutôt que de laisser croire à un bug.
 */

interface Course {
  id: string;
  ref: string;
  customerName: string;
  address: string;
  totalCents: number;
  paid: boolean;
  paymentMethod: string;
  status: string;
  slot: string;
  items: number;
}

export function CoursesLibres({ onTaken }: { onTaken: () => void }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [ongoing, setOngoing] = useState(0);
  const [max, setMax] = useState(3);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/livreur/courses", { cache: "no-store" });
      const data = (await res.json()) as {
        courses?: Course[];
        ongoing?: number;
        max?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Courses illisibles");
      setCourses(data.courses ?? []);
      setOngoing(data.ongoing ?? 0);
      setMax(data.max ?? 3);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Courses illisibles");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
    /* Les courses tombent pendant le service : sans rafraîchissement, le
       livreur verrait un écran figé et raterait les nouvelles. */
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const prendre = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/livreur/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Prise en charge refusée");
      await load();
      onTaken();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prise en charge refusée");
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!ready) return null;
  if (error && courses.length === 0 && ongoing === 0) return null;

  const plein = ongoing >= max;

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-lg">Courses libres</h2>
        <span className="text-xs text-ink-2">
          {ongoing}/{max} en cours
        </span>
      </div>

      {error && (
        <p className="mb-2 rounded-xl bg-brick/10 px-3 py-2 text-sm font-semibold text-brick">
          {error}
        </p>
      )}

      {plein ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-2">
          Vous avez {max} courses en cours. Terminez-en une pour en prendre une autre.
        </p>
      ) : courses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-2">
          Aucune course à prendre pour le moment.
        </p>
      ) : (
        <ul className="space-y-2">
          {courses.map((c) => (
            <li
              key={c.id}
              className="rounded-[var(--radius-card)] border border-line bg-panel p-3 shadow-[var(--shadow-soft)]"
            >
              <p className="font-bold">{c.customerName}</p>
              <p className="text-sm text-ink-2">{c.address}</p>
              <p className="mt-1 text-xs text-ink-2">
                {c.ref} · {c.items} article{c.items > 1 ? "s" : ""} ·{" "}
                {c.slot === "asap" ? "dès que possible" : c.slot} ·{" "}
                {c.paid ? (
                  <span className="font-semibold text-teal">réglé</span>
                ) : (
                  <span className="font-semibold text-brick">
                    {fmtPrice(c.totalCents)} à encaisser
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => prendre(c.id)}
                disabled={busy === c.id}
                className="mt-2 w-full rounded-full bg-primary py-3 font-bold text-white transition hover:brightness-105 disabled:opacity-50"
              >
                {busy === c.id ? "…" : "Je prends cette course"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
