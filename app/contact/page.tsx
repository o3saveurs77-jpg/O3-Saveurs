import type { Metadata } from "next";
import { info } from "@/lib/menu";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = {
  title: "Contact · Ô 3 Saveurs — Chez Laila",
  description: "Coordonnées, horaires et accès du restaurant Ô 3 Saveurs — Chez Laila à Lognes.",
};

export default function ContactPage() {
  return (
    <>
      <header className="bg-primary text-white">
        <div className="wrap py-12 text-center">
          <p className="font-script text-3xl text-gold">À votre écoute</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">Contact</h1>
        </div>
        <div className="ots-band" />
      </header>

      <div className="wrap grid gap-10 py-14 md:grid-cols-2">
        {/* coordonnées + horaires */}
        <div className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
            <h2 className="mb-4 text-xl">Nous joindre</h2>
            <ul className="space-y-3 text-[15px]">
              <li className="flex items-start gap-3">
                <Icon name="pin" size={20} className="mt-0.5 shrink-0 text-primary" />
                {info.address}
              </li>
              <li className="flex items-center gap-3">
                <Icon name="phone" size={20} className="shrink-0 text-primary" />
                <a href={`tel:${info.phone.replace(/\s/g, "")}`} className="font-semibold hover:text-primary">
                  {info.phone}
                </a>
              </li>
            </ul>
          </div>

          <div className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
            <h2 className="mb-4 flex items-center gap-2 text-xl">
              <Icon name="clock" size={20} className="text-primary" /> Horaires
            </h2>
            <ul className="space-y-2 text-[15px]">
              {info.hours.map((h) => (
                <li key={h.d} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
                  <span className="font-semibold">{h.d}</span>
                  <span className="text-right text-ink-2">{h.h}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* formulaire (stub — branchement Resend à venir) */}
        <form className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
          <h2 className="mb-4 text-xl">Un message ?</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink-2">Nom</label>
              <input
                className="w-full rounded-[var(--radius-soft)] border border-line bg-page px-4 py-3 outline-none focus:border-primary"
                placeholder="Votre nom"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink-2">Email</label>
              <input
                type="email"
                className="w-full rounded-[var(--radius-soft)] border border-line bg-page px-4 py-3 outline-none focus:border-primary"
                placeholder="vous@email.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink-2">Message</label>
              <textarea
                rows={5}
                className="w-full rounded-[var(--radius-soft)] border border-line bg-page px-4 py-3 outline-none focus:border-primary"
                placeholder="Votre message…"
              />
            </div>
            <button
              type="button"
              className="w-full rounded-full bg-primary px-6 py-3.5 font-bold text-white transition hover:brightness-105"
              title="L'envoi par email (Resend) sera branché prochainement"
            >
              Envoyer
            </button>
            <p className="text-center text-xs text-ink-2">
              Formulaire de démonstration — l'envoi sera activé prochainement.
            </p>
          </div>
        </form>
      </div>
    </>
  );
}
