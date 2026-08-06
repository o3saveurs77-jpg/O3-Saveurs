"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import type { CateringEventType } from "@/lib/types";
import { CATERING_EVENT_TYPE_LABEL } from "@/lib/types";

interface Offer {
  kicker: string;
  name: string;
  price: string;
  unit: string;
  features: string[];
  minimum: string;
  cta: string;
  highlight?: boolean;
}

const OFFERS: Record<"bureau" | "mariage", Offer[]> = {
  bureau: [
    {
      kicker: "Plateau individuel",
      name: "Déjeuner Express",
      price: "13,90 €",
      unit: "/ pers.",
      features: [
        "1 plat au choix : thiéboudiène, mafé, yassa ou tajine",
        "1 salade composée ou pastel",
        "1 dessert maison",
        "1 boisson 33 cl",
        "Plateau filmé, étiqueté au nom du convive",
      ],
      minimum: "Minimum 10 personnes",
      cta: "Demander un devis",
    },
    {
      kicker: "Le plus demandé",
      name: "Buffet Bureau",
      price: "18,50 €",
      unit: "/ pers.",
      features: [
        "2 entrées : pastels, zaalouk, salade César",
        "2 plats chauds + riz, alloco ou semoule",
        "Assortiment de desserts",
        "Jus de gingembre & bissap maison",
        "Mise en place et vaisselle incluses",
      ],
      minimum: "Minimum 15 personnes",
      cta: "Réserver ce buffet",
      highlight: true,
    },
    {
      kicker: "Journée complète",
      name: "Séminaire",
      price: "24,90 €",
      unit: "/ pers.",
      features: [
        "Accueil café & viennoiseries",
        "Buffet déjeuner 3 saveurs",
        "Pause gourmande de l'après-midi",
        "Boissons à volonté",
        "Un référent Ô3 présent sur place",
      ],
      minimum: "Minimum 20 personnes",
      cta: "Demander un devis",
    },
  ],
  mariage: [
    {
      kicker: "Formule cocktail",
      name: "Cocktail Dînatoire",
      price: "26 €",
      unit: "/ pers.",
      features: [
        "12 pièces salées par personne",
        "Atelier brochettes & grillades minute",
        "Assortiment de mignardises",
        "Fontaine de jus maison",
        "2 h de service inclus",
      ],
      minimum: "Dès 50 couverts",
      cta: "Demander un devis",
    },
    {
      kicker: "La signature Ô3",
      name: "Buffet Cuisine du Monde",
      price: "34 €",
      unit: "/ pers.",
      features: [
        "Buffet 3 saveurs : Afrique, Maghreb, Méditerranée",
        "Thiéboudiène, mafé, tajine veau & pruneaux, grillades",
        "Accompagnements et sauces maison",
        "Buffet de desserts & fruits frais",
        "Nappage, décor et service 4 h",
      ],
      minimum: "Dès 50 couverts",
      cta: "Réserver une dégustation",
      highlight: true,
    },
    {
      kicker: "Service à table",
      name: "Prestige",
      price: "48 €",
      unit: "/ pers.",
      features: [
        "Menu 4 services servi à l'assiette",
        "Cocktail d'accueil et pièces apéritives",
        "Équipe de service en salle dédiée",
        "Porcelaine, verrerie, nappage",
        "Coordination avec votre salle jusqu'au jour J",
      ],
      minimum: "De 80 à 300 couverts",
      cta: "Parler à un chef",
    },
  ],
};

const EXTRAS: { label: string; desc: string }[] = [
  { label: "Serveur supplémentaire", desc: "28 € / heure, minimum 4 h" },
  { label: "Location de matériel", desc: "Chafing dish, tables, mange-debout" },
  { label: "Pièce montée & gâteau", desc: "Sur mesure, dès 5 € / part" },
  { label: "Boissons à volonté", desc: "Jus maison, thé, eaux — 4,50 € / pers." },
];

const STEPS: { title: string; desc: string }[] = [
  { title: "Votre demande", desc: "Date, nombre de convives, lieu. Réponse chiffrée sous 24 h ouvrées." },
  { title: "Dégustation", desc: "Pour les mariages, dégustation sur rendez-vous au restaurant." },
  { title: "Acompte en ligne", desc: "30 % à la validation du devis. La date est bloquée dès réception." },
  { title: "Le jour J", desc: "Livraison, mise en place et service. Solde réglable jusqu'à 7 jours avant." },
];

type FormState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function TraiteurClient() {
  const [tab, setTab] = useState<"bureau" | "mariage">("bureau");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/traiteur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: form.get("eventType"),
          eventDate: form.get("eventDate") || undefined,
          guestCount: form.get("guestCount") || undefined,
          location: form.get("location"),
          customerName: form.get("customerName"),
          customerPhone: form.get("customerPhone"),
          customerEmail: form.get("customerEmail"),
          message: form.get("message") || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Une erreur est survenue.");
      setState({ kind: "ok", message: data?.message ?? "Demande envoyée." });
      e.currentTarget.reset();
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Une erreur est survenue." });
    }
  };

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="relative overflow-hidden bg-brick text-white">
        <div className="ots-band flip" />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_80%_10%,color-mix(in_oklab,var(--color-gold)_28%,transparent),transparent_60%)]"
          aria-hidden="true"
        />
        <div className="wrap relative py-14 text-center sm:py-16">
          <p className="font-script text-3xl text-gold">Service traiteur</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">Vos réunions et vos mariages</h1>
          <p className="mx-auto mt-3 max-w-2xl text-white/90">
            Buffets, plateaux repas et service sur place, partout autour de Pontault-Combault. Devis
            sous 24 h, acompte réglable en ligne. Halal · options végétariennes.
          </p>
        </div>
      </header>

      {/* ── Onglets + offres ─────────────────────────────── */}
      <section className="wrap py-14">
        <Reveal className="mx-auto flex max-w-md gap-2 rounded-full border border-line bg-panel-2 p-1.5">
          {(["bureau", "mariage"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-bold transition ${
                tab === k ? "bg-primary text-white" : "text-ink-2 hover:bg-panel"
              }`}
            >
              {k === "bureau" ? "💼 Réunion de bureau" : "💍 Mariage & réception"}
            </button>
          ))}
        </Reveal>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {OFFERS[tab].map((o, i) => (
            <Reveal key={o.name} delay={i * 90} className="h-full">
              <div
                className={`flex h-full flex-col rounded-[var(--radius-card)] border bg-panel shadow-[var(--shadow-soft)] ${
                  o.highlight ? "border-primary ring-2 ring-primary/25" : "border-line"
                }`}
              >
                <div
                  className={`rounded-t-[var(--radius-card)] p-5 ${o.highlight ? "bg-gold/25" : "bg-panel-2"}`}
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-brick">{o.kicker}</p>
                  <h3 className="mt-1 text-xl">{o.name}</h3>
                  <p className="mt-1 font-display text-3xl text-primary">
                    {o.price} <span className="text-sm font-sans text-ink-2">{o.unit}</span>
                  </p>
                </div>
                <ul className="flex-1 space-y-2.5 p-5 text-sm">
                  {o.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Icon name="check" size={15} className="mt-0.5 shrink-0 text-teal" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="p-5 pt-0">
                  <a
                    href="#devis"
                    className={`flex w-full items-center justify-center rounded-full px-5 py-3 font-bold transition ${
                      o.highlight
                        ? "bg-primary text-white hover:brightness-105"
                        : "border border-line text-ink hover:bg-panel-2"
                    }`}
                  >
                    {o.cta}
                  </a>
                  <p className="mt-2 text-center text-xs text-ink-2">{o.minimum}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EXTRAS.map((x) => (
            <div
              key={x.label}
              className="rounded-[var(--radius-card)] border border-line bg-panel-2 p-4 text-sm"
            >
              <p className="font-bold text-ink">{x.label}</p>
              <p className="mt-0.5 text-ink-2">{x.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Étapes + formulaire de devis ─────────────────── */}
      <section id="devis" className="scroll-mt-20 bg-panel-2 py-14">
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <Reveal className="grid gap-4 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <div
                key={s.title}
                className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft font-display text-sm text-brick">
                  {i + 1}
                </span>
                <h4 className="mt-3 font-bold">{s.title}</h4>
                <p className="mt-1 text-sm text-ink-2">{s.desc}</p>
              </div>
            ))}
          </Reveal>

          <Reveal
            delay={120}
            className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-lg)] sm:p-7"
          >
            <h3 className="text-xl">Demander un devis</h3>
            <p className="mt-1 text-sm text-ink-2">Gratuit, sans engagement.</p>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="eventType" className="mb-1.5 block text-xs font-bold text-ink-2">
                  Type d'événement
                </label>
                <select
                  id="eventType"
                  name="eventType"
                  required
                  defaultValue="bureau"
                  className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                >
                  {(Object.keys(CATERING_EVENT_TYPE_LABEL) as CateringEventType[]).map((k) => (
                    <option key={k} value={k}>
                      {CATERING_EVENT_TYPE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="eventDate" className="mb-1.5 block text-xs font-bold text-ink-2">
                    Date
                  </label>
                  <input
                    id="eventDate"
                    name="eventDate"
                    type="date"
                    className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="guestCount" className="mb-1.5 block text-xs font-bold text-ink-2">
                    Convives
                  </label>
                  <input
                    id="guestCount"
                    name="guestCount"
                    type="number"
                    min={1}
                    placeholder="ex : 40"
                    className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="location" className="mb-1.5 block text-xs font-bold text-ink-2">
                  Lieu de la prestation
                </label>
                <input
                  id="location"
                  name="location"
                  required
                  placeholder="Ville ou salle de réception"
                  className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label htmlFor="customerName" className="mb-1.5 block text-xs font-bold text-ink-2">
                  Votre nom
                </label>
                <input
                  id="customerName"
                  name="customerName"
                  required
                  className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="customerPhone" className="mb-1.5 block text-xs font-bold text-ink-2">
                    Téléphone
                  </label>
                  <input
                    id="customerPhone"
                    name="customerPhone"
                    type="tel"
                    required
                    placeholder="06 00 00 00 00"
                    className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="customerEmail" className="mb-1.5 block text-xs font-bold text-ink-2">
                    E-mail
                  </label>
                  <input
                    id="customerEmail"
                    name="customerEmail"
                    type="email"
                    required
                    placeholder="vous@exemple.fr"
                    className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="message" className="mb-1.5 block text-xs font-bold text-ink-2">
                  Précisions (facultatif)
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={state.kind === "sending"}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.kind === "sending" ? "Envoi…" : "Recevoir mon devis"}
              </button>

              {state.kind === "ok" && (
                <p role="status" className="rounded-xl bg-teal/10 p-3 text-center text-sm font-semibold text-teal">
                  {state.message}
                </p>
              )}
              {state.kind === "error" && (
                <p role="alert" className="rounded-xl bg-primary-soft p-3 text-center text-sm font-semibold text-brick">
                  {state.message}
                </p>
              )}

              <p className="text-center text-xs text-ink-2">Réponse sous 24 h · acompte réglable en ligne</p>
            </form>
          </Reveal>
        </div>

        <div className="wrap mt-8">
          <div className="rounded-[var(--radius-card)] border border-line bg-panel p-6 text-center shadow-[var(--shadow-soft)] sm:text-left">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
              <div>
                <h3 className="text-lg font-bold">Devis traiteur : payer en deux fois</h3>
                <p className="mt-1 text-sm text-ink-2">
                  30 % à la signature du devis — la date est bloquée. Solde jusqu'à 7 jours avant
                  l'événement, par carte ou virement.
                </p>
              </div>
              <Icon name="euro" size={32} className="shrink-0 text-primary" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
