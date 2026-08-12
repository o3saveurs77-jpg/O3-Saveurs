"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Icon } from "@/components/Icon";
import { ModelesCampagne } from "./ModelesCampagne";
import { SaisieBoutique } from "./SaisieBoutique";

/**
 * Newsletter : abonnés et campagnes.
 *
 * Les deux routes existaient — `/api/newsletter` avec ses compteurs et son
 * évolution sur douze mois, `/api/campaigns` avec la taille d'audience
 * joignable — mais l'entrée « Newsletter » du menu renvoyait une 404. Les
 * inscriptions arrivaient donc en base sans que personne puisse les consulter,
 * et aucune campagne ne pouvait être rédigée.
 *
 * Le double opt-in est déjà en place côté API : un abonné non confirmé n'est
 * pas joignable. L'écran distingue les deux, sinon on croit avoir une audience
 * qu'on n'a pas.
 */

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  confirmed: boolean;
  confirmedAt: number | null;
  unsubscribedAt: number | null;
  source: string | null;
  createdAt: number;
}

interface Campaign {
  id: string;
  subject: string;
  html: string;
  audience: string;
  status: string;
  scheduledAt: number | null;
  sentAt: number | null;
  sentCount: number;
  failedCount: number;
  createdAt: number;
}

type Filtre = "all" | "confirmed" | "pending" | "unsubscribed";

const FILTRES: { k: Filtre; label: string }[] = [
  { k: "all", label: "Tous" },
  { k: "confirmed", label: "Confirmés" },
  { k: "pending", label: "En attente" },
  { k: "unsubscribed", label: "Désinscrits" },
];

const AUDIENCES = ["tous", "actifs", "inactifs"] as const;

const STATUT_CAMPAGNE: Record<string, string> = {
  brouillon: "bg-panel-2 text-ink-2",
  programmee: "bg-gold/20 text-[#7a5c02]",
  envoyee: "bg-teal/15 text-teal",
  echec: "bg-primary-soft text-brick",
};

function jour(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function NewsletterAdmin() {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState({ confirmed: 0, pending: 0, unsubscribed: 0, total: 0 });
  const [campagnes, setCampagnes] = useState<Campaign[]>([]);
  const [reachable, setReachable] = useState(0);
  const [filtre, setFiltre] = useState<Filtre>("all");
  const [recherche, setRecherche] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "erreur"; text: string } | null>(null);
  const [form, setForm] = useState<{ subject: string; html: string; audience: string } | null>(null);
  const baseId = useId();

  const charger = useCallback(async () => {
    try {
      const params = new URLSearchParams({ take: "200" });
      if (filtre !== "all") params.set("status", filtre);
      if (recherche.trim()) params.set("q", recherche.trim());

      const [rs, rc] = await Promise.all([
        fetch(`/api/newsletter?${params}`, { cache: "no-store" }),
        fetch("/api/campaigns", { cache: "no-store" }),
      ]);
      if (!rs.ok || !rc.ok) throw new Error();

      const ds = (await rs.json()) as {
        subscribers: Subscriber[];
        total: number;
        stats: { confirmed: number; pending: number; unsubscribed: number };
      };
      const dc = (await rc.json()) as { campaigns: Campaign[]; reachable: number };

      setSubs(ds.subscribers);
      setStats({
        total: ds.total,
        confirmed: ds.stats.confirmed,
        pending: ds.stats.pending,
        unsubscribed: ds.stats.unsubscribed,
      });
      setCampagnes(dc.campaigns);
      setReachable(dc.reachable);
    } catch {
      setMessage({ tone: "erreur", text: "Les données newsletter n'ont pas pu être chargées." });
    } finally {
      setReady(true);
    }
  }, [filtre, recherche]);

  useEffect(() => {
    // Petit délai : évite une requête par caractère tapé dans la recherche.
    const id = setTimeout(charger, 250);
    return () => clearTimeout(id);
  }, [charger]);

  const creer = async () => {
    if (!form || form.subject.trim().length < 3 || form.html.trim().length < 10) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.subject.trim(),
          html: form.html.trim(),
          audience: form.audience,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(e?.error ?? "Création refusée");
      }
      setForm(null);
      await charger();
      setMessage({ tone: "ok", text: "Campagne créée en brouillon." });
    } catch (e) {
      setMessage({ tone: "erreur", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const exporter = () => {
    /* Export local, sans passer par le serveur : la liste est déjà chargée et
     * n'a pas à refaire un aller-retour pour être copiée. */
    const lignes = [
      "email,nom,confirme,inscrit_le,source",
      ...subs.map((s) =>
        [
          s.email,
          (s.name ?? "").replace(/,/g, " "),
          s.confirmed ? "oui" : "non",
          new Date(s.createdAt).toISOString().slice(0, 10),
          s.source ?? "",
        ].join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([lignes], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `abonnes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Newsletter</h1>
          <p className="mt-1 text-sm text-ink-2">
            {reachable} abonné{reachable > 1 ? "s" : ""} joignable{reachable > 1 ? "s" : ""} ·{" "}
            {campagnes.length} campagne{campagnes.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exporter}
            disabled={subs.length === 0}
            className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-semibold transition hover:bg-panel-2 disabled:opacity-40"
          >
            <Icon name="download" size={16} /> Exporter (CSV)
          </button>
          <button
            type="button"
            onClick={() => setForm({ subject: "", html: "", audience: "tous" })}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105"
          >
            <Icon name="megaphone" size={17} /> Nouvelle campagne
          </button>
        </div>
      </header>

      {/* Saisie au comptoir : la voie par laquelle entrent les clients qui
          n’ont pas commandé en ligne. */}
      <SaisieBoutique onAjout={charger} />

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

      {/* ── Compteurs ──────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Tuile label="Confirmés" valeur={stats.confirmed} ton="teal" />
        <Tuile
          label="En attente de confirmation"
          valeur={stats.pending}
          ton="gold"
          note="Non joignables tant qu'ils n'ont pas cliqué le lien reçu par email."
        />
        <Tuile label="Désinscrits" valeur={stats.unsubscribed} ton="neutre" />
      </div>

      {/* ── Campagne ───────────────────────────────────── */}
      {form && (
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="text-xl">Nouvelle campagne</h2>
          <p className="mt-1 text-sm text-ink-2">
            Créée en brouillon : rien n&apos;est envoyé tant que vous ne la programmez pas.
          </p>

          {/* Le modèle remplit l'objet et le contenu, puis s'efface : tout
              reste modifiable à la main ensuite. */}
          <div className="mt-4">
            <ModelesCampagne
              onAppliquer={(subject, html) => setForm((f) => (f ? { ...f, subject, html } : f))}
            />
          </div>

          <div className="mt-4 grid gap-4">
            <div>
              <label
                htmlFor={`${baseId}-obj`}
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-2"
              >
                Objet
              </label>
              <input
                id={`${baseId}-obj`}
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Le tajine de la semaine est arrivé"
                className={inputCls}
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-aud`}
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-2"
              >
                Audience
              </label>
              <select
                id={`${baseId}-aud`}
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                className={inputCls}
              >
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={`${baseId}-html`}
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-2"
              >
                Contenu
              </label>
              <textarea
                id={`${baseId}-html`}
                value={form.html}
                onChange={(e) => setForm({ ...form, html: e.target.value })}
                rows={7}
                placeholder="<p>Bonjour,</p><p>Cette semaine chez Ô 3 Saveurs…</p>"
                className={`${inputCls} font-mono text-xs`}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={creer}
              disabled={busy || form.subject.trim().length < 3 || form.html.trim().length < 10}
              className="rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Création…" : "Créer le brouillon"}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-full border border-line px-5 py-2.5 font-semibold transition hover:bg-panel-2"
            >
              Annuler
            </button>
          </div>
        </section>
      )}

      {campagnes.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl">Campagnes</h2>
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-2">
                <tr>
                  <th className="px-4 py-3">Objet</th>
                  <th className="px-4 py-3">Audience</th>
                  <th className="px-4 py-3">État</th>
                  <th className="px-4 py-3">Envoyée</th>
                  <th className="px-4 py-3">Résultat</th>
                </tr>
              </thead>
              <tbody>
                {campagnes.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3 font-semibold">{c.subject}</td>
                    <td className="px-4 py-3 text-ink-2">{c.audience}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          STATUT_CAMPAGNE[c.status] ?? "bg-panel-2 text-ink-2"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{jour(c.sentAt ?? c.scheduledAt)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {c.sentCount > 0 || c.failedCount > 0 ? (
                        <>
                          {c.sentCount} envoyé{c.sentCount > 1 ? "s" : ""}
                          {c.failedCount > 0 && (
                            <span className="text-brick"> · {c.failedCount} échec</span>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-2">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Abonnés ────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-xl">Abonnés</h2>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-line bg-panel px-4">
            <label htmlFor={`${baseId}-q`} className="sr-only">
              Rechercher un abonné
            </label>
            <Icon name="search" size={17} className="text-ink-2" />
            <input
              id={`${baseId}-q`}
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un email…"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
          <div className="flex gap-2">
            {FILTRES.map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setFiltre(f.k)}
                aria-pressed={filtre === f.k}
                className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                  filtre === f.k
                    ? "bg-primary text-white"
                    : "border border-line bg-panel text-ink hover:bg-panel-2"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {!ready ? (
          <p className="py-12 text-center text-ink-2">Chargement…</p>
        ) : subs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-line bg-panel py-14 text-center text-ink-2">
            <Icon name="mail" size={38} className="opacity-30" />
            <p className="text-lg font-bold text-ink">Aucun abonné</p>
            <p className="text-sm">
              Les inscriptions faites depuis le site apparaîtront ici.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-2">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">État</th>
                  <th className="px-4 py-3">Inscrit le</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3 font-semibold">{s.email}</td>
                    <td className="px-4 py-3 text-ink-2">{s.name || "—"}</td>
                    <td className="px-4 py-3">
                      {s.unsubscribedAt ? (
                        <span className="rounded-full bg-panel-2 px-2.5 py-1 text-xs font-bold text-ink-2">
                          Désinscrit
                        </span>
                      ) : s.confirmed ? (
                        <span className="rounded-full bg-teal/15 px-2.5 py-1 text-xs font-bold text-teal">
                          Confirmé
                        </span>
                      ) : (
                        <span className="rounded-full bg-gold/20 px-2.5 py-1 text-xs font-bold text-[#7a5c02]">
                          En attente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{jour(s.createdAt)}</td>
                    <td className="px-4 py-3 text-ink-2">{s.source || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const inputCls =
  "w-full rounded-[var(--radius-soft)] border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-primary";

function Tuile({
  label,
  valeur,
  ton,
  note,
}: {
  label: string;
  valeur: number;
  ton: "teal" | "gold" | "neutre";
  note?: string;
}) {
  const couleur =
    ton === "teal" ? "text-teal" : ton === "gold" ? "text-[#7a5c02]" : "text-ink-2";
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-2">{label}</p>
      <p className={`mt-1 font-display text-3xl ${couleur}`}>{valeur}</p>
      {note && <p className="mt-1 text-[11px] leading-snug text-ink-2">{note}</p>}
    </div>
  );
}
