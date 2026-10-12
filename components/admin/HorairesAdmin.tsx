"use client";

/* Éditeur des horaires d'ouverture.
 *
 * `PUT /api/hours` existait, gardé et fonctionnel, mais aucun écran ne
 * l'appelait : les horaires n'étaient modifiables qu'en base. Or ils ne sont
 * pas décoratifs — ils décident du refus des commandes hors service
 * (`app/api/checkout`), des créneaux proposés au client, de l'ouverture de la
 * borne en salle et du balisage Google. Une fermeture exceptionnelle obligeait
 * donc à faire appel à nous ; en attendant, le site continuait d'encaisser pour
 * un service qui n'aurait pas lieu.
 *
 * Les jours sont affichés du lundi au dimanche, pas de 0 à 6 : la semaine d'un
 * restaurateur commence le lundi, et l'ordre de la base (0 = dimanche) n'a
 * aucune raison de remonter jusqu'à l'écran.
 *
 * Les horaires ne sont pas des réglages (`Settings`) mais une table à part :
 * ils ont donc leur propre bouton d'enregistrement, indépendant de celui de la
 * page Réglages.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { DEFAULT_HOURS, WEEKDAY_LABEL, toMinutes, type DayHours } from "@/lib/hours";

/** Ordre d'affichage : lundi d'abord, dimanche en dernier. */
export const ORDRE_SEMAINE = [1, 2, 3, 4, 5, 6, 0] as const;

/** Les 7 jours dans l'ordre d'affichage, quelle que soit la forme reçue. */
export function trierSemaine(semaine: DayHours[]): DayHours[] {
  return ORDRE_SEMAINE.map((wd) => semaine.find((j) => j.weekday === wd) ?? DEFAULT_HOURS[wd]);
}

function erreurService(
  ouverture: string | null,
  fermeture: string | null,
  label: "midi" | "soir",
): string | null {
  if (!ouverture && !fermeture) return null;
  // Un service à moitié rempli est invisible côté client : `servicesOf()` le
  // laisse tomber en silence, et la cliente croit avoir ouvert le midi.
  if (!ouverture || !fermeture) {
    return `Le ${label} a besoin d'une heure d'ouverture et d'une heure de fermeture, ou d'aucune des deux.`;
  }
  if (toMinutes(fermeture) <= toMinutes(ouverture)) {
    return `La fermeture du ${label} (${fermeture}) doit être après l'ouverture (${ouverture}).`;
  }
  return null;
}

/**
 * Mêmes règles que le `PUT`, rejouées pendant la saisie pour que l'erreur
 * s'affiche sur la ligne fautive au lieu d'arriver en bloc après un
 * aller-retour réseau. Renvoie `null` quand le jour est cohérent.
 */
export function erreurJour(jour: DayHours): string | null {
  // Un jour fermé ignore ses horaires : rien à vérifier.
  if (jour.closed) return null;

  const midi = erreurService(jour.lunchOpen, jour.lunchClose, "midi");
  if (midi) return midi;
  const soir = erreurService(jour.dinnerOpen, jour.dinnerClose, "soir");
  if (soir) return soir;

  if (jour.lunchClose && jour.dinnerOpen && toMinutes(jour.dinnerOpen) < toMinutes(jour.lunchClose)) {
    return `Le soir (${jour.dinnerOpen}) commence avant la fin du midi (${jour.lunchClose}).`;
  }

  // Ouvert sans aucun service : le site annoncerait « ouvert » sans proposer
  // le moindre créneau.
  if (!jour.lunchOpen && !jour.dinnerOpen) {
    return "Aucun service renseigné : cochez « Fermé », ou donnez les heures du midi ou du soir.";
  }
  return null;
}

/** Ce qui part au serveur : un jour fermé n'emporte aucun horaire. */
export function aEnvoyer(jour: DayHours): DayHours {
  if (!jour.closed) return jour;
  return {
    weekday: jour.weekday,
    closed: true,
    lunchOpen: null,
    lunchClose: null,
    dinnerOpen: null,
    dinnerClose: null,
  };
}

/**
 * Recopie une ligne sur les sept jours. Du lundi au samedi les horaires sont
 * identiques dans la réalité : les saisir sept fois est la raison pour
 * laquelle personne ne les tenait à jour.
 */
export function appliquerATouteLaSemaine(semaine: DayHours[], weekday: number): DayHours[] {
  const modele = semaine.find((j) => j.weekday === weekday);
  if (!modele) return semaine;
  return semaine.map((jour) => ({ ...modele, weekday: jour.weekday }));
}

interface EtatHoraires {
  hours: DayHours[];
  now: { weekday: number; weekdayLabel: string; time: string };
  open: boolean;
  next: { weekday: number; label: "midi" | "soir"; opensAt: string } | null;
  slots: string[];
}

type Message = { tone: "ok" | "error"; text: string } | null;

const timeClass =
  "w-full rounded-lg border bg-page px-2 py-2 text-[15px] outline-none focus:border-primary disabled:opacity-40";

/** Un champ heure : `""` dans l'input vaut « pas de service » en base. */
function ChampHeure({
  id,
  label,
  value,
  disabled,
  invalide,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  disabled: boolean;
  invalide: boolean;
  describedBy?: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-2">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value ?? ""}
        disabled={disabled}
        aria-invalid={invalide}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className={`${timeClass} ${invalide ? "border-brick" : "border-line"}`}
      />
    </div>
  );
}

export function HorairesAdmin() {
  const [etat, setEtat] = useState<EtatHoraires | null>(null);
  const [semaine, setSemaine] = useState<DayHours[] | null>(null);
  const [pret, setPret] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/hours", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as (EtatHoraires & { error?: string }) | null;
      if (!res.ok || !data?.hours) {
        setMessage({ tone: "error", text: data?.error ?? "Les horaires n'ont pas pu être chargés." });
        return;
      }
      setEtat(data);
      setSemaine(data.hours);
    } catch {
      setMessage({ tone: "error", text: "Réseau indisponible — horaires non chargés." });
    } finally {
      setPret(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const modifier = (weekday: number, patch: Partial<DayHours>) => {
    setSemaine((cur) =>
      cur ? cur.map((j) => (j.weekday === weekday ? { ...j, ...patch } : j)) : cur,
    );
    setMessage(null);
  };

  const ordonnee = useMemo(() => (semaine ? trierSemaine(semaine) : []), [semaine]);
  const erreurs = useMemo(
    () => new Map(ordonnee.map((j) => [j.weekday, erreurJour(j)])),
    [ordonnee],
  );

  async function enregistrer() {
    if (!semaine) return;

    // Refus côté client avant tout appel : la cliente voit d'où vient le
    // problème, au lieu d'une erreur générique après l'aller-retour.
    const fautif = trierSemaine(semaine).find((j) => erreurJour(j) !== null);
    if (fautif) {
      setMessage({
        tone: "error",
        text: `${WEEKDAY_LABEL[fautif.weekday]} — ${erreurJour(fautif)}`,
      });
      return;
    }

    setEnregistrement(true);
    setMessage(null);
    try {
      const res = await fetch("/api/hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: trierSemaine(semaine).map(aEnvoyer) }),
      });
      const data = (await res.json().catch(() => null)) as (EtatHoraires & { error?: string }) | null;

      if (!res.ok) {
        setMessage({ tone: "error", text: data?.error ?? "Enregistrement impossible." });
        return;
      }
      // On réaffiche ce que le serveur a réellement écrit : il normalise les
      // jours fermés et recalcule l'état d'ouverture.
      if (data?.hours) {
        setEtat(data);
        setSemaine(data.hours);
      }
      setMessage({ tone: "ok", text: "Horaires enregistrés." });
    } catch {
      setMessage({ tone: "error", text: "Réseau indisponible — horaires non enregistrés." });
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
      <h2 className="inline-flex items-center gap-2 text-xl">
        <Icon name="clock" size={20} className="text-brick" /> Horaires d&apos;ouverture
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Services du midi et du soir, jour par jour. Ils déterminent les créneaux proposés au client,
        le refus des commandes hors service, l&apos;ouverture de la borne en salle et les horaires
        affichés par Google. Un service laissé vide signifie « pas de service » : c&apos;est ainsi
        qu&apos;on exprime « fermé le midi », sans fermer la journée.
      </p>

      {/* Zone de messages : jamais d'`alert()`. */}
      <div aria-live="polite" role="status" className="mt-4">
        {message && (
          <p
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              message.tone === "ok"
                ? "border-teal/40 bg-panel-2 text-teal"
                : "border-brick/40 bg-primary-soft text-brick"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {!pret ? (
        <p className="py-10 text-center text-ink-2">Chargement des horaires…</p>
      ) : !semaine ? (
        <button
          type="button"
          onClick={charger}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold hover:bg-panel-2"
        >
          <Icon name="refresh" size={16} /> Réessayer
        </button>
      ) : (
        <>
          {/* Preuve que ces horaires agissent vraiment : l'état du jour tel que
              le serveur le calcule, en heure de Paris. */}
          {etat && (
            <p className="mt-4 rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm text-ink-2">
              {etat.open ? (
                <>
                  <strong className="text-teal">Ouvert en ce moment</strong> ({etat.now.weekdayLabel}{" "}
                  {etat.now.time}) — {etat.slots.length}{" "}
                  {etat.slots.length > 1 ? "créneaux encore commandables" : "créneau encore commandable"}{" "}
                  aujourd&apos;hui.
                </>
              ) : (
                <>
                  <strong className="text-brick">Fermé en ce moment</strong> ({etat.now.weekdayLabel}{" "}
                  {etat.now.time})
                  {etat.next
                    ? ` — prochain service : ${WEEKDAY_LABEL[etat.next.weekday].toLowerCase()} ${etat.next.label}, à partir de ${etat.next.opensAt}.`
                    : " — aucun service à venir : les commandes sont toutes refusées."}
                </>
              )}
            </p>
          )}

          <div className="mt-5 grid gap-3">
            {ordonnee.map((jour) => {
              const base = `horaires-${jour.weekday}`;
              const erreur = erreurs.get(jour.weekday) ?? null;
              const erreurId = erreur ? `${base}-erreur` : undefined;

              return (
                <div
                  key={jour.weekday}
                  className={`rounded-xl border bg-panel-2 p-4 ${
                    erreur ? "border-brick/50" : "border-line"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span className="text-base font-bold">{WEEKDAY_LABEL[jour.weekday]}</span>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="flex items-center gap-2">
                        <input
                          id={`${base}-closed`}
                          type="checkbox"
                          checked={jour.closed}
                          onChange={(e) => modifier(jour.weekday, { closed: e.target.checked })}
                          className="h-4 w-4 accent-[var(--color-primary)]"
                        />
                        <label htmlFor={`${base}-closed`} className="text-sm font-semibold">
                          Fermé
                        </label>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSemaine((cur) => (cur ? appliquerATouteLaSemaine(cur, jour.weekday) : cur));
                          setMessage(null);
                        }}
                        className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold hover:bg-panel-2"
                      >
                        Appliquer à toute la semaine
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <ChampHeure
                      id={`${base}-lunch-open`}
                      label="Midi — ouverture"
                      value={jour.lunchOpen}
                      disabled={jour.closed}
                      invalide={!!erreur}
                      describedBy={erreurId}
                      onChange={(v) => modifier(jour.weekday, { lunchOpen: v })}
                    />
                    <ChampHeure
                      id={`${base}-lunch-close`}
                      label="Midi — fermeture"
                      value={jour.lunchClose}
                      disabled={jour.closed}
                      invalide={!!erreur}
                      describedBy={erreurId}
                      onChange={(v) => modifier(jour.weekday, { lunchClose: v })}
                    />
                    <ChampHeure
                      id={`${base}-dinner-open`}
                      label="Soir — ouverture"
                      value={jour.dinnerOpen}
                      disabled={jour.closed}
                      invalide={!!erreur}
                      describedBy={erreurId}
                      onChange={(v) => modifier(jour.weekday, { dinnerOpen: v })}
                    />
                    <ChampHeure
                      id={`${base}-dinner-close`}
                      label="Soir — fermeture"
                      value={jour.dinnerClose}
                      disabled={jour.closed}
                      invalide={!!erreur}
                      describedBy={erreurId}
                      onChange={(v) => modifier(jour.weekday, { dinnerClose: v })}
                    />
                  </div>

                  {erreur && (
                    <p id={erreurId} className="mt-2 text-xs font-semibold text-brick">
                      {erreur}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <p className="mr-auto text-xs text-ink-2">
              Le bouton « Enregistrer » de la page ne sauvegarde pas les horaires : ils ont leur
              propre table.
            </p>
            <button
              type="button"
              onClick={enregistrer}
              disabled={enregistrement}
              className="rounded-full bg-primary px-6 py-2.5 font-bold text-white hover:brightness-105 disabled:opacity-60"
            >
              {enregistrement ? "Enregistrement…" : "Enregistrer les horaires"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
