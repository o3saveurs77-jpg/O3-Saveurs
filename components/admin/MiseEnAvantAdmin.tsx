"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { fmtCents, toCents, toEuros } from "@/lib/money";
import {
  ANNOUNCEMENT_TONES,
  ANNOUNCEMENT_TONE_LABEL,
  BANNER_PLACEMENTS,
  BANNER_PLACEMENT_LABEL,
} from "@/lib/promotionValidation";
import type { AnnouncementTone, BannerPlacement } from "@/lib/promotionValidation";
import { WEEKDAY_LABEL } from "@/lib/hours";
import { Icon } from "@/components/Icon";
import { PlatDuJourCalendrier } from "./PlatDuJourCalendrier";

/**
 * Mise en avant : annonces, bandeaux et plats du jour.
 *
 * Trois APIs existaient déjà (`/api/announcements`, `/api/banners`,
 * `/api/daily-specials`) et le site consomme les trois — le bandeau d'annonce
 * s'affiche en haut des pages, le plat du jour sur l'accueil et la Carte. Mais
 * l'entrée « Mise en avant » du menu renvoyait une 404 : ces contenus ne
 * pouvaient être modifiés qu'en base.
 *
 * Les trois vivent sur le même écran parce qu'ils répondent à la même question
 * — « qu'est-ce qu'on met en avant cette semaine ? » — et qu'on les arbitre
 * ensemble.
 */

type Onglet = "annonces" | "bandeaux" | "plats-du-jour";

interface AnnouncementView {
  id: string;
  message: string;
  link: string | null;
  tone: AnnouncementTone;
  startsAt: number | null;
  endsAt: number | null;
  active: boolean;
  position: number;
}

interface BannerView {
  id: string;
  title: string;
  image: string;
  link: string | null;
  placement: BannerPlacement;
  startsAt: number | null;
  endsAt: number | null;
  active: boolean;
  position: number;
  clicks: number;
}

interface SpecialView {
  id: string;
  dishId: string | null;
  name: string;
  priceCents: number | null;
  weekday: number | null;
  date: number | null;
  active: boolean;
  position: number;
  dishName?: string | null;
}

const TON_STYLE: Record<AnnouncementTone, string> = {
  info: "bg-teal/15 text-teal",
  promo: "bg-gold/20 text-[#7a5c02]",
  alerte: "bg-primary-soft text-brick",
};

function jour(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** `<input type="date">` attend `YYYY-MM-DD`. */
function versDate(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function MiseEnAvantAdmin() {
  const [onglet, setOnglet] = useState<Onglet>("annonces");
  const [annonces, setAnnonces] = useState<AnnouncementView[]>([]);
  const [bandeaux, setBandeaux] = useState<BannerView[]>([]);
  const [specials, setSpecials] = useState<SpecialView[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "erreur"; text: string } | null>(null);

  const [formA, setFormA] = useState<{
    id: string | null;
    message: string;
    link: string;
    tone: AnnouncementTone;
    active: boolean;
  } | null>(null);
  const [formB, setFormB] = useState<{
    id: string | null;
    title: string;
    image: string;
    link: string;
    placement: BannerPlacement;
    active: boolean;
  } | null>(null);
  const [formS, setFormS] = useState<{
    id: string | null;
    name: string;
    prix: string;
    /** "" = récurrence hebdomadaire, sinon date précise */
    date: string;
    weekday: string;
    active: boolean;
  } | null>(null);

  const baseId = useId();

  const charger = useCallback(async () => {
    try {
      const [ra, rb, rs] = await Promise.all([
        fetch("/api/announcements?all=true", { cache: "no-store" }),
        fetch("/api/banners?all=true", { cache: "no-store" }),
        fetch("/api/daily-specials?all=true", { cache: "no-store" }),
      ]);
      if (ra.ok) setAnnonces((await ra.json()) as AnnouncementView[]);
      if (rb.ok) setBandeaux((await rb.json()) as BannerView[]);
      if (rs.ok) setSpecials((await rs.json()) as SpecialView[]);
    } catch {
      setMessage({ tone: "erreur", text: "Le contenu n'a pas pu être chargé." });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const envoyer = async (url: string, methode: string, corps?: unknown) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: methode,
        headers: corps ? { "Content-Type": "application/json" } : undefined,
        body: corps ? JSON.stringify(corps) : undefined,
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(e?.error ?? "Opération refusée");
      }
      await charger();
      return true;
    } catch (e) {
      setMessage({ tone: "erreur", text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const ONGLETS: { k: Onglet; label: string; n: number }[] = [
    { k: "annonces", label: "Annonces", n: annonces.length },
    { k: "bandeaux", label: "Bandeaux", n: bandeaux.length },
    { k: "plats-du-jour", label: "Plats du jour", n: specials.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Mise en avant</h1>
        <p className="mt-1 text-sm text-ink-2">
          Ce que voient vos clients en haut du site, sur l&apos;accueil et sur la Carte.
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

      <div className="flex gap-2">
        {ONGLETS.map((o) => (
          <button
            key={o.k}
            type="button"
            onClick={() => setOnglet(o.k)}
            aria-pressed={onglet === o.k}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              onglet === o.k
                ? "bg-primary text-white"
                : "border border-line bg-panel text-ink hover:bg-panel-2"
            }`}
          >
            {o.label}
            <span
              className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs ${
                onglet === o.k ? "bg-white/25" : "bg-panel-2 text-ink-2"
              }`}
            >
              {o.n}
            </span>
          </button>
        ))}
      </div>

      {!ready ? (
        <p className="py-16 text-center text-ink-2">Chargement…</p>
      ) : onglet === "annonces" ? (
        /* ── Annonces ─────────────────────────────────── */
        <section className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setFormA({ id: null, message: "", link: "", tone: "info", active: true })
              }
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105"
            >
              <Icon name="plus" size={17} /> Nouvelle annonce
            </button>
          </div>

          {formA && (
            <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor={`${baseId}-am`} className={labelCls}>
                    Message
                  </label>
                  <input
                    id={`${baseId}-am`}
                    value={formA.message}
                    onChange={(e) => setFormA({ ...formA, message: e.target.value })}
                    placeholder="Livraison offerte ce week-end dès 25 €"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor={`${baseId}-al`} className={labelCls}>
                    Lien (facultatif)
                  </label>
                  <input
                    id={`${baseId}-al`}
                    value={formA.link}
                    onChange={(e) => setFormA({ ...formA, link: e.target.value })}
                    placeholder="/carte"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor={`${baseId}-at`} className={labelCls}>
                    Ton
                  </label>
                  <select
                    id={`${baseId}-at`}
                    value={formA.tone}
                    onChange={(e) => setFormA({ ...formA, tone: e.target.value as AnnouncementTone })}
                    className={inputCls}
                  >
                    {ANNOUNCEMENT_TONES.map((t) => (
                      <option key={t} value={t}>
                        {ANNOUNCEMENT_TONE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  disabled={busy || formA.message.trim().length < 3}
                  onClick={async () => {
                    const ok = await envoyer(
                      formA.id ? `/api/announcements/${formA.id}` : "/api/announcements",
                      formA.id ? "PATCH" : "POST",
                      {
                        message: formA.message.trim(),
                        link: formA.link.trim() || null,
                        tone: formA.tone,
                        active: formA.active,
                      },
                    );
                    if (ok) setFormA(null);
                  }}
                  className={btnPrim}
                >
                  {busy ? "…" : formA.id ? "Enregistrer" : "Créer"}
                </button>
                <button type="button" onClick={() => setFormA(null)} className={btnSec}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {annonces.length === 0 ? (
            <Vide
              icone="megaphone"
              titre="Aucune annonce"
              texte="Une annonce s'affiche en bandeau en haut de toutes les pages."
            />
          ) : (
            annonces.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]"
              >
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TON_STYLE[a.tone]}`}>
                  {ANNOUNCEMENT_TONE_LABEL[a.tone]}
                </span>
                <p className="min-w-0 flex-1 font-semibold">{a.message}</p>
                {a.link && <code className="text-xs text-ink-2">{a.link}</code>}
                <Etat actif={a.active} />
                <Actions
                  busy={busy}
                  onToggle={() =>
                    envoyer(`/api/announcements/${a.id}`, "PATCH", { active: !a.active })
                  }
                  actif={a.active}
                  onEdit={() =>
                    setFormA({
                      id: a.id,
                      message: a.message,
                      link: a.link ?? "",
                      tone: a.tone,
                      active: a.active,
                    })
                  }
                  onDelete={() => {
                    if (confirm("Supprimer cette annonce ?")) {
                      envoyer(`/api/announcements/${a.id}`, "DELETE");
                    }
                  }}
                />
              </div>
            ))
          )}
        </section>
      ) : onglet === "bandeaux" ? (
        /* ── Bandeaux ─────────────────────────────────── */
        <section className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setFormB({
                  id: null,
                  title: "",
                  image: "",
                  link: "",
                  placement: "accueil",
                  active: true,
                })
              }
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105"
            >
              <Icon name="plus" size={17} /> Nouveau bandeau
            </button>
          </div>

          {formB && (
            <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${baseId}-bt`} className={labelCls}>
                    Titre
                  </label>
                  <input
                    id={`${baseId}-bt`}
                    value={formB.title}
                    onChange={(e) => setFormB({ ...formB, title: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor={`${baseId}-bp`} className={labelCls}>
                    Emplacement
                  </label>
                  <select
                    id={`${baseId}-bp`}
                    value={formB.placement}
                    onChange={(e) =>
                      setFormB({ ...formB, placement: e.target.value as BannerPlacement })
                    }
                    className={inputCls}
                  >
                    {BANNER_PLACEMENTS.map((p) => (
                      <option key={p} value={p}>
                        {BANNER_PLACEMENT_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${baseId}-bi`} className={labelCls}>
                    Image (chemin ou URL)
                  </label>
                  <input
                    id={`${baseId}-bi`}
                    value={formB.image}
                    onChange={(e) => setFormB({ ...formB, image: e.target.value })}
                    placeholder="/photos/p03.jpg"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor={`${baseId}-bl`} className={labelCls}>
                    Lien (facultatif)
                  </label>
                  <input
                    id={`${baseId}-bl`}
                    value={formB.link}
                    onChange={(e) => setFormB({ ...formB, link: e.target.value })}
                    placeholder="/carte"
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  disabled={busy || formB.title.trim().length < 2 || formB.image.trim().length < 2}
                  onClick={async () => {
                    const ok = await envoyer(
                      formB.id ? `/api/banners/${formB.id}` : "/api/banners",
                      formB.id ? "PATCH" : "POST",
                      {
                        title: formB.title.trim(),
                        image: formB.image.trim(),
                        link: formB.link.trim() || null,
                        placement: formB.placement,
                        active: formB.active,
                      },
                    );
                    if (ok) setFormB(null);
                  }}
                  className={btnPrim}
                >
                  {busy ? "…" : formB.id ? "Enregistrer" : "Créer"}
                </button>
                <button type="button" onClick={() => setFormB(null)} className={btnSec}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {bandeaux.length === 0 ? (
            <Vide
              icone="image"
              titre="Aucun bandeau"
              texte="Un bandeau met en avant une image cliquable sur l'accueil, la Carte ou le panier."
            />
          ) : (
            bandeaux.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]"
              >
                <span className="rounded-full bg-panel-2 px-2.5 py-1 text-xs font-bold text-ink-2">
                  {BANNER_PLACEMENT_LABEL[b.placement]}
                </span>
                <p className="min-w-0 flex-1 font-semibold">{b.title}</p>
                <span className="text-xs text-ink-2">{b.clicks} clic{b.clicks > 1 ? "s" : ""}</span>
                <Etat actif={b.active} />
                <Actions
                  busy={busy}
                  actif={b.active}
                  onToggle={() => envoyer(`/api/banners/${b.id}`, "PATCH", { active: !b.active })}
                  onEdit={() =>
                    setFormB({
                      id: b.id,
                      title: b.title,
                      image: b.image,
                      link: b.link ?? "",
                      placement: b.placement,
                      active: b.active,
                    })
                  }
                  onDelete={() => {
                    if (confirm("Supprimer ce bandeau ?")) envoyer(`/api/banners/${b.id}`, "DELETE");
                  }}
                />
              </div>
            ))
          )}
        </section>
      ) : (
        /* ── Plats du jour ────────────────────────────── */
        <section className="flex flex-col gap-4">
          {/* Le calendrier avant la liste : ce qu'on veut savoir, c'est
              d'abord quels jours n'ont rien de prévu. */}
          <PlatDuJourCalendrier
            entries={specials}
            onPickDate={(isoDate) =>
              setFormS({ id: null, name: "", prix: "", date: isoDate, weekday: "", active: true })
            }
          />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setFormS({ id: null, name: "", prix: "", date: "", weekday: "1", active: true })
              }
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105"
            >
              <Icon name="plus" size={17} /> Nouveau plat du jour
            </button>
          </div>

          {formS && (
            <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <label htmlFor={`${baseId}-sn`} className={labelCls}>
                    Nom du plat
                  </label>
                  <input
                    id={`${baseId}-sn`}
                    value={formS.name}
                    onChange={(e) => setFormS({ ...formS, name: e.target.value })}
                    placeholder="Couscous royal"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor={`${baseId}-sp`} className={labelCls}>
                    Prix (€, facultatif)
                  </label>
                  <input
                    id={`${baseId}-sp`}
                    type="number"
                    min={0}
                    step={0.5}
                    value={formS.prix}
                    onChange={(e) => setFormS({ ...formS, prix: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor={`${baseId}-sd`} className={labelCls}>
                    Date précise
                  </label>
                  <input
                    id={`${baseId}-sd`}
                    type="date"
                    value={formS.date}
                    onChange={(e) => setFormS({ ...formS, date: e.target.value, weekday: "" })}
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`${baseId}-sw`} className={labelCls}>
                    …ou chaque semaine le
                  </label>
                  <select
                    id={`${baseId}-sw`}
                    value={formS.weekday}
                    onChange={(e) => setFormS({ ...formS, weekday: e.target.value, date: "" })}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {WEEKDAY_LABEL.map((l, i) => (
                      <option key={l} value={i}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Le validateur refuse les deux ensemble ou aucun des deux. */}
              <p className="mt-3 text-xs text-ink-2">
                Choisissez une date précise <strong>ou</strong> un jour récurrent — pas les deux.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  disabled={
                    busy ||
                    formS.name.trim().length < 2 ||
                    (formS.date === "" && formS.weekday === "") ||
                    (formS.date !== "" && formS.weekday !== "")
                  }
                  onClick={async () => {
                    const ok = await envoyer(
                      formS.id ? `/api/daily-specials/${formS.id}` : "/api/daily-specials",
                      formS.id ? "PATCH" : "POST",
                      {
                        name: formS.name.trim(),
                        priceCents: formS.prix.trim()
                          ? (toCents(Number(formS.prix) || 0) ?? null)
                          : null,
                        date: formS.date || null,
                        weekday: formS.weekday === "" ? null : Number(formS.weekday),
                        active: formS.active,
                      },
                    );
                    if (ok) setFormS(null);
                  }}
                  className={btnPrim}
                >
                  {busy ? "…" : formS.id ? "Enregistrer" : "Créer"}
                </button>
                <button type="button" onClick={() => setFormS(null)} className={btnSec}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {specials.length === 0 ? (
            <Vide
              icone="sparkle"
              titre="Aucun plat du jour"
              texte="Le plat du jour s'affiche sur l'accueil et en haut de la Carte."
            />
          ) : (
            specials.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]"
              >
                <span className="rounded-full bg-panel-2 px-2.5 py-1 text-xs font-bold text-ink-2">
                  {s.date !== null
                    ? jour(s.date)
                    : s.weekday !== null
                      ? `chaque ${WEEKDAY_LABEL[s.weekday].toLowerCase()}`
                      : "—"}
                </span>
                <p className="min-w-0 flex-1 font-semibold">{s.name}</p>
                {s.priceCents !== null && (
                  <span className="font-display text-brick">{fmtCents(s.priceCents)}</span>
                )}
                <Etat actif={s.active} />
                <Actions
                  busy={busy}
                  actif={s.active}
                  onToggle={() =>
                    envoyer(`/api/daily-specials/${s.id}`, "PATCH", { active: !s.active })
                  }
                  onEdit={() =>
                    setFormS({
                      id: s.id,
                      name: s.name,
                      prix: s.priceCents === null ? "" : String(toEuros(s.priceCents)),
                      date: versDate(s.date),
                      weekday: s.weekday === null ? "" : String(s.weekday),
                      active: s.active,
                    })
                  }
                  onDelete={() => {
                    if (confirm(`Supprimer « ${s.name} » ?`)) {
                      envoyer(`/api/daily-specials/${s.id}`, "DELETE");
                    }
                  }}
                />
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-[var(--radius-soft)] border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-primary";
const labelCls = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-2";
const btnPrim =
  "rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";
const btnSec =
  "rounded-full border border-line px-5 py-2.5 font-semibold transition hover:bg-panel-2";

function Etat({ actif }: { actif: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
        actif ? "bg-teal/15 text-teal" : "bg-panel-2 text-ink-2"
      }`}
    >
      {actif ? "Actif" : "Inactif"}
    </span>
  );
}

function Actions({
  busy,
  actif,
  onToggle,
  onEdit,
  onDelete,
}: {
  busy: boolean;
  actif: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        title={actif ? "Désactiver" : "Activer"}
        aria-label={actif ? "Désactiver" : "Activer"}
        className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition hover:bg-panel-2 hover:text-ink disabled:opacity-40"
      >
        <Icon name={actif ? "x" : "check"} size={16} />
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        title="Modifier"
        aria-label="Modifier"
        className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition hover:bg-panel-2 hover:text-ink disabled:opacity-40"
      >
        <Icon name="edit" size={16} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        title="Supprimer"
        aria-label="Supprimer"
        className="grid h-8 w-8 place-items-center rounded-full text-brick transition hover:bg-primary-soft disabled:opacity-40"
      >
        <Icon name="trash" size={16} />
      </button>
    </div>
  );
}

function Vide({ icone, titre, texte }: { icone: "megaphone" | "image" | "sparkle"; titre: string; texte: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-line bg-panel py-14 text-center text-ink-2">
      <Icon name={icone} size={38} className="opacity-30" />
      <p className="text-lg font-bold text-ink">{titre}</p>
      <p className="text-sm">{texte}</p>
    </div>
  );
}
