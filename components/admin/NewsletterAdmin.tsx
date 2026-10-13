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
 *
 * **L'envoi manquait.** `POST /api/campaigns/[id]/send` était écrit, gardé et
 * complet — envoi en masse, envoi d'essai, idempotence, lien de désinscription
 * par destinataire — et n'était appelé par aucun composant. Cet écran ne savait
 * que créer un brouillon : la cliente rédigeait sa campagne, lisait « Campagne
 * créée en brouillon », et n'avait plus aucun moyen de l'expédier.
 *
 * Le tableau des campagnes porte donc maintenant l'action, en deux temps
 * assumés : un bouton ouvre un panneau qui dit à qui l'email va partir, puis
 * un second clic l'envoie. Entre les deux, l'envoi d'essai — celui que la
 * route gère déjà — permet de relire l'email pour de vrai, liens compris.
 * Un envoi de masse ne se rattrape pas : il n'y a pas de bouton « Annuler »
 * possible, seulement un bouton difficile à pousser par erreur.
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

/** Trois tons : c'est parti, c'est parti à moitié, rien n'est parti. */
type Ton = "ok" | "attention" | "erreur";

const TON_BANDEAU: Record<Ton, string> = {
  ok: "border-teal/30 bg-teal/10 text-teal",
  attention: "border-gold/50 bg-gold/10 text-[#7a5c02]",
  erreur: "border-brick/30 bg-primary-soft text-brick",
};

const pluriel = (n: number) => (n > 1 ? "s" : "");

/**
 * À qui cette campagne va partir, en français, avant de pousser le bouton.
 *
 * `reachable` est le nombre d'abonnés **joignables** au sens de
 * `lib/prospection.ts` : consentement confirmé, ou client dont l'adresse a été
 * recueillie au comptoir, et jamais une adresse désinscrite. Pour les audiences
 * « actifs » et « inactifs », la route recoupe ensuite avec les commandes des
 * 90 derniers jours : le chiffre exact n'est connu qu'à l'envoi, et l'écran dit
 * « au plus » plutôt que d'annoncer un volume qu'il ne connaît pas.
 */
export function resumeAudience(audience: string, reachable: number): string {
  const n = `${reachable} adresse${pluriel(reachable)}`;
  if (audience === "actifs") {
    return `Aux abonnés joignables ayant commandé dans les 90 derniers jours : au plus ${n}, le compte exact étant établi au moment de l'envoi.`;
  }
  if (audience === "inactifs") {
    return `Aux abonnés joignables n'ayant pas commandé depuis plus de 90 jours : au plus ${n}, le compte exact étant établi au moment de l'envoi.`;
  }
  return `À tous les abonnés joignables : ${n}. Sont joignables les inscrits ayant confirmé leur inscription et les clients dont l'adresse a été recueillie au comptoir — jamais une adresse désinscrite.`;
}

/** Ce que la route d'envoi renvoie, en test comme en réel. */
export interface ResultatEnvoi {
  ok?: boolean;
  test?: boolean;
  total?: number;
  sentCount?: number;
  failedCount?: number;
  message?: string;
}

/**
 * Ce que l'écran annonce après un envoi.
 *
 * Un envoi partiel n'est ni un succès ni un échec : les destinataires en échec
 * n'ont rien reçu et la campagne, déjà marquée envoyée, ne peut plus être
 * relancée. Le dire en vert serait exactement le travers qu'on corrige
 * ailleurs dans cet écran.
 */
export function messageEnvoi(r: ResultatEnvoi): { tone: Ton; text: string } {
  if (r.test) {
    return r.ok === false
      ? { tone: "erreur", text: r.message ?? "L'email de test n'a pas pu être envoyé." }
      : { tone: "ok", text: r.message ?? "Email de test envoyé." };
  }

  const envoyes = r.sentCount ?? 0;
  const echecs = r.failedCount ?? 0;

  if (envoyes === 0) {
    return {
      tone: "erreur",
      text: `Aucun email n'est parti${echecs > 0 ? ` : les ${echecs} envois ont tous été refusés` : ""}. La campagne est marquée en échec et ne peut plus être relancée : corrigez la cause, puis créez une nouvelle campagne.`,
    };
  }

  if (echecs > 0) {
    return {
      tone: "attention",
      text: `${envoyes} email${pluriel(envoyes)} envoyé${pluriel(envoyes)}, ${echecs} refusé${pluriel(echecs)} : ${echecs === 1 ? "cette personne n'a" : "ces personnes n'ont"} rien reçu, et la campagne ne peut plus être relancée. Le motif de chaque refus est enregistré dans le journal des emails.`,
    };
  }

  return {
    tone: "ok",
    text: `${envoyes} email${pluriel(envoyes)} envoyé${pluriel(envoyes)}.`,
  };
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
  const [message, setMessage] = useState<{ tone: Ton; text: string } | null>(null);
  const [form, setForm] = useState<{ subject: string; html: string; audience: string } | null>(null);
  /** Campagne pour laquelle le panneau de confirmation d'envoi est ouvert. */
  const [aEnvoyer, setAEnvoyer] = useState<Campaign | null>(null);
  /** Identifiant de la campagne dont l'essai est bien parti, pour le rappeler. */
  const [essaiParti, setEssaiParti] = useState<string | null>(null);
  /** Lequel des deux envois est en cours : un envoi de masse peut durer. */
  const [enCours, setEnCours] = useState<"essai" | "reel" | null>(null);
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
      setMessage({
        tone: "ok",
        text: "Campagne créée en brouillon. Elle apparaît dans le tableau des campagnes, avec son bouton « Envoyer » — rien ne part avant.",
      });
    } catch (e) {
      setMessage({ tone: "erreur", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Envoi d'une campagne — d'essai ou réel.
   *
   * La route sait tout faire et se protège elle-même : elle réserve la campagne
   * par un `updateMany` conditionné à `sentAt: null`, si bien qu'un double clic
   * ou un second onglet repart en 409 au lieu d'expédier deux fois. Cet écran
   * n'a donc pas à garder d'état d'envoi — seulement à poser la question avant,
   * et à rapporter fidèlement ce qui s'est passé après.
   */
  const envoyer = async (campagne: Campaign, test: boolean) => {
    setBusy(true);
    setEnCours(test ? "essai" : "reel");
    setMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${campagne.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test }),
      });
      const data = (await res.json().catch(() => null)) as
        | ({ error?: string } & ResultatEnvoi)
        | null;
      /* 409 (déjà envoyée), 400 (audience vide) : la route explique, on répète.
       * Un message inventé ici masquerait la seule information utile. */
      if (!res.ok) throw new Error(data?.error ?? "L'envoi a été refusé.");

      if (test) {
        /* Un test refusé par Resend revient en 200 avec `ok: false` : il ne
         * vaut pas relecture, et ne doit pas rassurer. */
        if (data?.ok !== false) setEssaiParti(campagne.id);
        setMessage(messageEnvoi({ ...data, test: true }));
        return;
      }

      setAEnvoyer(null);
      setEssaiParti(null);
      await charger();
      setMessage(messageEnvoi({ ...data, test: false }));
    } catch (e) {
      setMessage({ tone: "erreur", text: (e as Error).message });
    } finally {
      setBusy(false);
      setEnCours(null);
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
        /* `alert` dès que l'envoi n'est pas pleinement réussi : c'est une
            information qu'on ne doit pas pouvoir manquer. */
        <p
          role={message.tone === "ok" ? "status" : "alert"}
          className={`rounded-xl border p-3 text-sm ${TON_BANDEAU[message.tone]}`}
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
            Créée en brouillon : rien ne part avant que vous ne l&apos;envoyiez depuis le tableau
            des campagnes, et jamais sans confirmation.
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

          {/* ── Confirmation d'envoi ─────────────────────────
              Deux clics séparés par ce panneau : il nomme la campagne, dit à
              qui elle va partir et rappelle qu'on ne revient pas en arrière.
              L'essai est posé juste à côté du bouton réel, parce que c'est là
              qu'on y pense — pas dans une page d'aide. */}
          {aEnvoyer && (
            <div
              role="group"
              aria-labelledby={`${baseId}-envoi`}
              className="mb-3 rounded-[var(--radius-card)] border border-brick/40 bg-primary-soft p-5"
            >
              <h3 id={`${baseId}-envoi`} className="text-lg font-bold text-brick">
                Envoyer « {aEnvoyer.subject} » ?
              </h3>
              <p className="mt-2 text-sm text-ink">{resumeAudience(aEnvoyer.audience, reachable)}</p>
              <p className="mt-2 text-sm font-semibold text-brick">
                Un envoi en masse ne se rattrape pas : une fois parti, l&apos;email est dans les
                boîtes. La campagne ne pourra plus être modifiée, ni renvoyée.
              </p>
              <p className="mt-2 text-sm text-ink-2">
                Chaque destinataire reçoit son propre lien de désinscription, valable en un clic.
              </p>

              {essaiParti === aEnvoyer.id ? (
                <p className="mt-3 rounded-xl border border-teal/30 bg-teal/10 p-2.5 text-sm text-teal">
                  Essai parti : relisez-le dans votre boîte — mise en page et liens compris — avant
                  d&apos;envoyer pour de vrai.
                </p>
              ) : (
                <p className="mt-3 rounded-xl border border-gold/50 bg-gold/10 p-2.5 text-sm text-[#7a5c02]">
                  Aucun essai envoyé pour cette campagne. L&apos;essai ne part qu&apos;à votre
                  adresse et ne consomme rien.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => envoyer(aEnvoyer, true)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-5 py-2.5 text-sm font-semibold transition hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="mail" size={16} />{" "}
                  {enCours === "essai" ? "Envoi de l'essai…" : "M'envoyer un essai"}
                </button>
                <button
                  type="button"
                  onClick={() => envoyer(aEnvoyer, false)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="megaphone" size={17} />{" "}
                  {enCours === "reel" ? "Envoi en cours…" : "Oui, envoyer la campagne"}
                </button>
                <button
                  type="button"
                  onClick={() => setAEnvoyer(null)}
                  disabled={busy}
                  className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition hover:bg-panel-2 disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-2">
                <tr>
                  <th className="px-4 py-3">Objet</th>
                  <th className="px-4 py-3">Audience</th>
                  <th className="px-4 py-3">État</th>
                  <th className="px-4 py-3">Envoyée</th>
                  <th className="px-4 py-3">Résultat</th>
                  <th className="px-4 py-3">Envoi</th>
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
                    <td className="px-4 py-3">
                      {/* `sentAt` et non le statut : c'est lui que la route
                          regarde pour refuser un second envoi. Une campagne
                          partie reste affichée comme trace, sans action. */}
                      {c.sentAt ? (
                        <span className="text-xs text-ink-2">Déjà envoyée</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAEnvoyer(c);
                            setEssaiParti(null);
                            setMessage(null);
                          }}
                          disabled={busy}
                          aria-expanded={aEnvoyer?.id === c.id}
                          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-sm font-semibold transition hover:bg-panel-2 disabled:opacity-50"
                        >
                          <Icon name="megaphone" size={15} /> Envoyer…
                        </button>
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
