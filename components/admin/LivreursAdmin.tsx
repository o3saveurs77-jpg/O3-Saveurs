"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { fmtCents } from "@/lib/money";
import { Icon } from "@/components/Icon";

/**
 * Livreurs.
 *
 * L'API `/api/drivers` existait — avec le détail de la journée par livreur —
 * mais aucune page ne la consommait : l'entrée « Livreurs » du menu renvoyait
 * une 404, et les tournées de `/admin/livraisons` ne pouvaient être affectées
 * qu'à des livreurs créés directement en base.
 *
 * L'écran met en avant l'espèce à encaisser : c'est le chiffre qu'on vérifie au
 * retour d'un livreur, et il n'était visible nulle part.
 */

interface DriverView {
  id: string;
  name: string;
  phone: string | null;
  vehicle: string | null;
  email: string | null;
  active: boolean;
  createdAt: number;
  runsTotal: number;
  ordersTotal: number;
  today: {
    date: number;
    runs: number;
    stops: number;
    delivered: number;
    toCollectCents: number;
    collectedCents: number;
  };
}

interface Form {
  name: string;
  phone: string;
  vehicle: string;
  email: string;
  active: boolean;
}

const VIDE: Form = { name: "", phone: "", vehicle: "", email: "", active: true };

export function LivreursAdmin() {
  const [drivers, setDrivers] = useState<DriverView[]>([]);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "erreur"; text: string } | null>(null);
  const baseId = useId();

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/drivers", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setDrivers((await res.json()) as DriverView[]);
    } catch {
      setMessage({ tone: "erreur", text: "Les livreurs n'ont pas pu être chargés." });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const enregistrer = async () => {
    if (!form || form.name.trim().length < 2) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(editId ? `/api/drivers/${editId}` : "/api/drivers", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          vehicle: form.vehicle.trim() || null,
          email: form.email.trim() || null,
          active: form.active,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(e?.error ?? "Enregistrement refusé");
      }
      setForm(null);
      setEditId(null);
      await charger();
      setMessage({ tone: "ok", text: editId ? "Livreur mis à jour." : "Livreur ajouté." });
    } catch (e) {
      setMessage({ tone: "erreur", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const basculer = async (d: DriverView) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/drivers/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !d.active }),
      });
      if (!res.ok) throw new Error();
      await charger();
    } catch {
      setMessage({ tone: "erreur", text: "Changement d'état impossible." });
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (d: DriverView) => {
    /* Un livreur rattaché à des tournées ou des commandes porte l'historique de
     * livraison : le supprimer effacerait qui a livré quoi. */
    if (d.runsTotal > 0 || d.ordersTotal > 0) {
      setMessage({
        tone: "erreur",
        text: `${d.name} a ${d.runsTotal} tournée(s) et ${d.ordersTotal} commande(s) à son actif : désactivez-le plutôt, sinon l'historique de livraison perd sa trace.`,
      });
      return;
    }
    if (!confirm(`Supprimer ${d.name} ?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/drivers/${d.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await charger();
      setMessage({ tone: "ok", text: "Livreur supprimé." });
    } catch {
      setMessage({ tone: "erreur", text: "Suppression impossible." });
    } finally {
      setBusy(false);
    }
  };

  const actifs = drivers.filter((d) => d.active).length;
  const aEncaisser = drivers.reduce((s, d) => s + d.today.toCollectCents, 0);
  const enCours = drivers.reduce((s, d) => s + d.today.stops - d.today.delivered, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Livreurs</h1>
          <p className="mt-1 text-sm text-ink-2">
            {drivers.length} livreur{drivers.length > 1 ? "s" : ""} · {actifs} actif
            {actifs > 1 ? "s" : ""} · {enCours} arrêt{enCours > 1 ? "s" : ""} restant
            {enCours > 1 ? "s" : ""} aujourd&apos;hui
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(VIDE);
            setEditId(null);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105"
        >
          <Icon name="plus" size={17} /> Ajouter un livreur
        </button>
      </header>

      {aEncaisser > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm">
          <Icon name="euro" size={18} className="shrink-0 text-brick" />
          <span>
            <strong className="text-brick">{fmtCents(aEncaisser)}</strong> en espèces encore à
            encaisser sur les tournées du jour.
          </span>
        </p>
      )}

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

      {form && (
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="text-xl">{editId ? "Modifier le livreur" : "Nouveau livreur"}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor={`${baseId}-nom`}
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-2"
              >
                Nom
              </label>
              <input
                id={`${baseId}-nom`}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Karim B."
                className={inputCls}
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-tel`}
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-2"
              >
                Téléphone
              </label>
              <input
                id={`${baseId}-tel`}
                type="tel"
                value={form.phone}
                onChange={(e) => set({ phone: e.target.value })}
                placeholder="06 12 34 56 78"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor={`${baseId}-mail`}
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-2"
              >
                Email du compte livreur (facultatif)
              </label>
              <input
                id={`${baseId}-mail`}
                type="email"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="livreur@exemple.fr"
                className={inputCls}
                aria-describedby={`${baseId}-mail-aide`}
              />
              {/* Le rattachement se fait par email : sans lui, le livreur ne
                  peut pas ouvrir sa tournée en se connectant, et il faudra lui
                  envoyer le lien privé à chaque service. */}
              <p id={`${baseId}-mail-aide`} className="mt-1 text-xs text-ink-2">
                Avec cette adresse et le rôle LIVREUR (Accès &amp; rôles), il retrouve sa tournée
                sur <strong>/livreur</strong> en se connectant. Sans elle, envoyez-lui le lien
                privé depuis Livraisons.
              </p>
            </div>
            <div>
              <label
                htmlFor={`${baseId}-veh`}
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-2"
              >
                Véhicule
              </label>
              <input
                id={`${baseId}-veh`}
                value={form.vehicle}
                onChange={(e) => set({ vehicle: e.target.value })}
                placeholder="Scooter"
                className={inputCls}
              />
            </div>
          </div>
          <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set({ active: e.target.checked })}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Disponible pour les tournées
          </label>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={enregistrer}
              disabled={busy || form.name.trim().length < 2}
              className="rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Enregistrement…" : editId ? "Enregistrer" : "Ajouter"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setEditId(null);
              }}
              className="rounded-full border border-line px-5 py-2.5 font-semibold transition hover:bg-panel-2"
            >
              Annuler
            </button>
          </div>
        </section>
      )}

      {!ready ? (
        <p className="py-16 text-center text-ink-2">Chargement…</p>
      ) : drivers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-line bg-panel py-16 text-center text-ink-2">
          <Icon name="scooter" size={40} className="opacity-30" />
          <p className="text-lg font-bold text-ink">Aucun livreur enregistré</p>
          <p className="text-sm">
            Ajoutez vos livreurs pour pouvoir leur affecter les tournées du jour.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {drivers.map((d) => (
            <article
              key={d.id}
              className={`flex flex-col rounded-[var(--radius-card)] border bg-panel p-5 shadow-[var(--shadow-soft)] ${
                d.active ? "border-line" : "border-line/50 opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg leading-tight">{d.name}</h3>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {d.vehicle || "véhicule non précisé"}
                    {d.phone && (
                      <>
                        {" · "}
                        <a href={`tel:${d.phone.replace(/\s/g, "")}`} className="hover:underline">
                          {d.phone}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    d.active ? "bg-teal/15 text-teal" : "bg-panel-2 text-ink-2"
                  }`}
                >
                  {d.active ? "Actif" : "Inactif"}
                </span>
              </div>

              {/* Entre 640-1279 px la carte n'occupe qu'une demi-largeur (grille
                  parente sm:grid-cols-2) : un montant à 4 chiffres n'a alors
                  plus qu'~90 px et passait sur deux lignes en grid-cols-3 fixe. */}
              <dl className="mt-4 grid grid-cols-1 gap-2 rounded-[var(--radius-soft)] bg-panel-2 p-3 text-center text-sm min-[420px]:grid-cols-3">
                <div>
                  <dt className="text-[11px] text-ink-2">Tournées</dt>
                  <dd className="font-display text-lg text-brick">{d.today.runs}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-2">Livrés</dt>
                  <dd className="font-display text-lg text-brick">
                    {d.today.delivered}
                    <span className="text-sm text-ink-2">/{d.today.stops}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-2">À encaisser</dt>
                  <dd
                    className={`font-display text-lg ${
                      d.today.toCollectCents > 0 ? "text-brick" : "text-ink-2"
                    }`}
                  >
                    {fmtCents(d.today.toCollectCents)}
                  </dd>
                </div>
              </dl>

              <p className="mt-2 text-[11px] text-ink-2">
                Historique : {d.runsTotal} tournée{d.runsTotal > 1 ? "s" : ""} ·{" "}
                {d.ordersTotal} commande{d.ordersTotal > 1 ? "s" : ""}
              </p>

              <div className="mt-4 flex gap-2 border-t border-line/70 pt-3">
                <button
                  type="button"
                  onClick={() => basculer(d)}
                  disabled={busy}
                  className="flex-1 rounded-full border border-line px-3 py-2 text-sm font-semibold transition hover:bg-panel-2 disabled:opacity-40"
                >
                  {d.active ? "Désactiver" : "Activer"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm({
                      name: d.name,
                      phone: d.phone ?? "",
                      vehicle: d.vehicle ?? "",
                      email: d.email ?? "",
                      active: d.active,
                    });
                    setEditId(d.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  disabled={busy}
                  title="Modifier"
                  aria-label={`Modifier ${d.name}`}
                  className="grid h-9 w-9 place-items-center rounded-full text-ink-2 transition hover:bg-panel-2 hover:text-ink disabled:opacity-40"
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => supprimer(d)}
                  disabled={busy}
                  title="Supprimer"
                  aria-label={`Supprimer ${d.name}`}
                  className="grid h-9 w-9 place-items-center rounded-full text-brick transition hover:bg-primary-soft disabled:opacity-40"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-[var(--radius-soft)] border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-primary";
