"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrders } from "@/components/providers/OrdersContext";
import { STATUS_NEXT, type Order, type OrderStatus } from "@/lib/types";
import { Icon } from "@/components/Icon";

/**
 * Écran cuisine.
 *
 * `/admin/commandes` est une vue de gestion — filtres, encaissement, détail
 * client. Ce n'est pas ce qu'il faut devant un piano : en cuisine on veut les
 * plats à préparer, en gros, sans avoir à ouvrir chaque commande.
 *
 * L'entrée « Cuisine » du menu renvoyait une 404 ; cet écran la remplit avec
 * trois colonnes qui suivent le flux réel : à lancer, en préparation, prêtes à
 * partir. Le passage d'une colonne à l'autre écrit le statut de la commande,
 * donc le suivi côté client avance en même temps.
 *
 * Rafraîchissement automatique : l'écran reste ouvert des heures sans que
 * personne ne le recharge, une commande arrivée entre-temps doit s'afficher
 * seule.
 */

const RAFRAICHIR_MS = 30_000;

const COLONNES: { statut: OrderStatus; titre: string; suivant: OrderStatus | null; action: string }[] =
  [
    { statut: "confirmee", titre: "À lancer", suivant: "cuisine", action: "Mettre en cuisine" },
    { statut: "cuisine", titre: "En préparation", suivant: "route", action: "Prête" },
    { statut: "route", titre: "Prêtes / en route", suivant: "livree", action: "Livrée" },
  ];

function heure(o: Order): string {
  if (o.slot && o.slot !== "asap") return o.slot;
  return "dès que possible";
}

/** Minutes écoulées depuis la confirmation — sert à repérer ce qui traîne. */
function attente(o: Order): number {
  const t = o.createdAt ?? Date.now();
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
}

/**
 * Durée d'attente lisible.
 *
 * « 11312 min » ne dit rien à personne : passé quelques heures, le chiffre
 * cesse d'être une information et devient du bruit. Une commande d'avant-hier
 * restée en plan doit se lire d'un coup d'œil comme telle.
 */
function attenteLisible(min: number): string {
  if (min < 90) return `${min} min`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h`;
  const jours = Math.round(min / (60 * 24));
  return `${jours} j`;
}

export function CuisineAdmin() {
  const { orders, ready, refresh } = useOrders();
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  /* Carte en cours de déplacement. On garde le statut d'origine et pas
   * seulement l'identifiant : c'est lui qui dit quelles colonnes peuvent
   * l'accueillir, et on veut le savoir *pendant* le survol, pas au lâcher. */
  const [drag, setDrag] = useState<{ id: string; from: OrderStatus } | null>(null);
  const [survol, setSurvol] = useState<OrderStatus | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      refresh();
      // force le recalcul des minutes d'attente affichées
      setTick((t) => t + 1);
    }, RAFRAICHIR_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const parStatut = useMemo(() => {
    const m: Record<string, Order[]> = { confirmee: [], cuisine: [], route: [] };
    for (const o of orders) {
      if (m[o.status]) m[o.status].push(o);
    }
    // Le plus ancien en tête : c'est celui qui attend depuis le plus longtemps.
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    }
    return m;
    // `tick` force le recalcul périodique de l'ordre et des durées.
  }, [orders, tick]);

  const avancer = async (o: Order, statut: OrderStatus) => {
    setBusy(o.id);
    setErreur(null);
    try {
      const res = await fetch(`/api/orders/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statut }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(e?.error ?? "Changement de statut refusé");
      }
      await refresh();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /**
   * Une carte peut-elle atterrir dans cette colonne ?
   *
   * On rejoue `STATUS_NEXT`, la même table que le serveur : une commande « à
   * lancer » ne saute pas directement en « prête », et on ne revient pas en
   * arrière. Laisser le lâcher se produire pour le voir refusé par l'API
   * donnerait une carte qui bouge puis revient en place, sans explication.
   */
  const accepte = (from: OrderStatus, to: OrderStatus): boolean =>
    from !== to && (STATUS_NEXT[from] ?? []).includes(to);

  const deposer = (col: OrderStatus) => {
    if (!drag) return;
    setSurvol(null);
    const o = orders.find((x) => x.id === drag.id);
    setDrag(null);
    if (!o || !accepte(drag.from, col)) return;
    void avancer(o, col);
  };

  /* Total des plats à produire, toutes commandes non parties confondues :
   * c'est le chiffre qui dit si la cuisine tient la cadence. */
  const aProduire = useMemo(() => {
    const compte = new Map<string, number>();
    for (const o of [...parStatut.confirmee, ...parStatut.cuisine]) {
      for (const l of o.lines) {
        compte.set(l.name, (compte.get(l.name) ?? 0) + l.qty);
      }
    }
    return [...compte.entries()].sort((a, b) => b[1] - a[1]);
  }, [parStatut]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Cuisine</h1>
          <p className="mt-1 text-sm text-ink-2">
            {parStatut.confirmee.length} à lancer · {parStatut.cuisine.length} en préparation ·{" "}
            {parStatut.route.length} prêtes · actualisation toutes les 30 s
          </p>
          {/* Le glisser-déposer ne se devine pas : sans cette ligne, on
              continue d'utiliser les boutons sans savoir qu'il existe. */}
          <p className="mt-1 hidden text-xs text-ink-2 lg:block">
            Faites glisser une commande d&apos;une colonne à l&apos;autre, ou utilisez son bouton.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold transition hover:bg-panel-2"
        >
          <Icon name="refresh" size={16} /> Actualiser
        </button>
      </header>

      {erreur && (
        <p role="alert" className="rounded-xl border border-brick/30 bg-primary-soft p-3 text-sm text-brick">
          {erreur}
        </p>
      )}

      {/* ── Récapitulatif des plats à produire ─────────── */}
      {aProduire.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-2">
            Total à produire ({aProduire.reduce((s, [, n]) => s + n, 0)} plats)
          </h2>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {aProduire.map(([nom, n]) => (
              <li
                key={nom}
                className="inline-flex items-center gap-2 rounded-full bg-panel-2 px-3 py-1.5 text-sm"
              >
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brick px-1.5 font-display text-xs text-white">
                  {n}
                </span>
                {nom}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!ready ? (
        <p className="py-16 text-center text-ink-2">Chargement des commandes…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLONNES.map((col) => {
            const liste = parStatut[col.statut] ?? [];
            /* Colonne accueillante, refusée, ou neutre pendant un déplacement.
               Sans ce retour visuel, on tire une carte au hasard et on découvre
               au lâcher si le geste comptait. */
            const cible = drag ? accepte(drag.from, col.statut) : false;
            const refusee = drag ? !cible && drag.from !== col.statut : false;

            return (
              <section
                key={col.statut}
                onDragOver={(e) => {
                  // Sans `preventDefault`, le navigateur refuse tout lâcher.
                  if (!cible) return;
                  e.preventDefault();
                  setSurvol(col.statut);
                }}
                onDragLeave={() => setSurvol((s) => (s === col.statut ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  deposer(col.statut);
                }}
                className={`flex flex-col gap-3 rounded-[var(--radius-card)] p-2 transition ${
                  survol === col.statut && cible
                    ? "bg-teal/10 ring-2 ring-teal"
                    : cible
                      ? "bg-teal/5 ring-1 ring-teal/40"
                      : refusee
                        ? "opacity-45"
                        : ""
                }`}
              >
                <h2 className="flex items-center justify-between rounded-[var(--radius-soft)] bg-panel-2 px-3 py-2 text-sm">
                  <span className="font-display">{col.titre}</span>
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brick px-1.5 text-xs text-white">
                    {liste.length}
                  </span>
                </h2>

                {liste.length === 0 ? (
                  <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-10 text-center text-sm text-ink-2">
                    Rien ici
                  </p>
                ) : (
                  liste.map((o) => {
                    const min = attente(o);
                    // Au-delà de 30 min sans partir, la commande est signalée.
                    const tarde = col.statut !== "route" && min > 30;
                    return (
                      <article
                        key={o.id}
                        /* Le glisser-déposer ne fonctionne qu'à la souris : il
                           n'existe pas sur écran tactile sans bibliothèque
                           dédiée. Les boutons restent donc la voie principale —
                           c'est aussi la seule utilisable avec des mains
                           grasses devant un piano. */
                        draggable={!!col.suivant}
                        onDragStart={() => setDrag({ id: o.id, from: col.statut })}
                        onDragEnd={() => {
                          setDrag(null);
                          setSurvol(null);
                        }}
                        className={`rounded-[var(--radius-card)] border bg-panel p-4 shadow-[var(--shadow-soft)] ${
                          col.suivant ? "cursor-grab active:cursor-grabbing" : ""
                        } ${drag?.id === o.id ? "opacity-40" : ""} ${
                          tarde ? "border-brick" : "border-line"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-sm font-bold text-brick">{o.ref}</p>
                            <p className="text-xs text-ink-2">
                              {o.mode === "livraison" ? "Livraison" : "À emporter"} · {heure(o)}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                              tarde ? "bg-primary-soft text-brick" : "bg-panel-2 text-ink-2"
                            }`}
                          >
                            {attenteLisible(min)}
                          </span>
                        </div>

                        <ul className="mt-3 flex flex-col gap-1.5 border-t border-line/70 pt-3">
                          {o.lines.map((l, i) => (
                            <li key={`${l.dishId}-${i}`} className="text-sm">
                              <span className="font-display text-base text-brick">{l.qty}×</span>{" "}
                              <span className="font-semibold">{l.name}</span>
                              {l.formule && (
                                <span className="text-ink-2"> · {l.formule}</span>
                              )}
                              {Object.entries(l.opts ?? {}).length > 0 && (
                                <span className="block pl-6 text-xs text-ink-2">
                                  {Object.entries(l.opts)
                                    .map(([k, v]) => `${k} : ${v}`)
                                    .join(" · ")}
                                </span>
                              )}
                              {l.note && (
                                <span className="mt-0.5 block pl-6 text-xs font-bold text-brick">
                                  ⚠ {l.note}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>

                        {col.suivant && (
                          <button
                            type="button"
                            onClick={() => avancer(o, col.suivant!)}
                            disabled={busy === o.id}
                            className="mt-4 w-full rounded-full bg-primary py-2.5 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-50"
                          >
                            {busy === o.id ? "…" : col.action}
                          </button>
                        )}
                      </article>
                    );
                  })
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
