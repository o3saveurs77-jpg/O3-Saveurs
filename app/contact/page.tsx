import type { Metadata } from "next";
import { info } from "@/lib/menu";
import { Icon } from "@/components/Icon";
import { ContactForm } from "@/components/contact/ContactForm";

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

        {/* formulaire réel : POST /api/contact → ContactMessage + notification */}
        <ContactForm />
      </div>
    </>
  );
}
