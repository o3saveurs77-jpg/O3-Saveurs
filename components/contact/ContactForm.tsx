"use client";

/* Formulaire de contact — la version précédente était un décor.
 *
 * Ce qui manquait : `onSubmit`, un `type="submit"`, un `name`/`id` par champ,
 * `required`, l'association `label`/`htmlFor`, et tout retour au visiteur. Un
 * attribut `title` sur le bouton signalait que rien ne partait — un visiteur
 * qui écrivait pour signaler une allergie ne l'a jamais su.
 *
 * Il est extrait de `app/contact/page.tsx` parce que cette page exporte
 * `metadata` : un fichier `"use client"` ne peut pas le faire.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

type State = "idle" | "sending" | "done" | "error";

const EMPTY = { name: "", email: "", phone: "", subject: "", message: "" };

const FIELD =
  "w-full rounded-[var(--radius-soft)] border border-line bg-page px-4 py-3 outline-none focus:border-primary";
const LABEL = "mb-1.5 block text-sm font-semibold text-ink-2";

export function ContactForm() {
  const [f, setF] = useState(EMPTY);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const set = (patch: Partial<typeof EMPTY>) => setF((cur) => ({ ...cur, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Garde anti double soumission : le bouton est aussi désactivé, mais la
    // touche Entrée peut déclencher l'envoi avant le rendu.
    if (state === "sending") return;

    setState("sending");
    setMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };

      if (res.ok) {
        setState("done");
        setMessage(data.message ?? "Merci ! Votre message est bien arrivé.");
        setF(EMPTY);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 10000);
      } else {
        setState("error");
        setMessage(data.error ?? "Votre message n'a pas pu être envoyé.");
      }
    } catch {
      setState("error");
      setMessage("Connexion impossible. Merci de réessayer, ou de nous appeler.");
    }
  };

  const busy = state === "sending";

  return (
    <form
      onSubmit={submit}
      className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]"
    >
      <h2 className="mb-4 text-xl">Un message ?</h2>

      <div className="space-y-4">
        <div>
          <label htmlFor="contact-name" className={LABEL}>
            Nom <span className="text-brick">*</span>
          </label>
          <input
            id="contact-name"
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            className={FIELD}
            placeholder="Votre nom"
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-email" className={LABEL}>
              Email <span className="text-brick">*</span>
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={FIELD}
              placeholder="vous@email.com"
              value={f.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="contact-phone" className={LABEL}>
              Téléphone <span className="font-normal">(facultatif)</span>
            </label>
            <input
              id="contact-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              className={FIELD}
              placeholder="06 12 34 56 78"
              value={f.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label htmlFor="contact-subject" className={LABEL}>
            Objet <span className="font-normal">(facultatif)</span>
          </label>
          <input
            id="contact-subject"
            name="subject"
            maxLength={150}
            className={FIELD}
            placeholder="Réservation, allergènes, groupe…"
            value={f.subject}
            onChange={(e) => set({ subject: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="contact-message" className={LABEL}>
            Message <span className="text-brick">*</span>
          </label>
          <textarea
            id="contact-message"
            name="message"
            rows={5}
            required
            minLength={10}
            maxLength={4000}
            className={FIELD}
            placeholder="Votre message…"
            value={f.message}
            onChange={(e) => set({ message: e.target.value })}
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-bold text-white transition hover:brightness-105 disabled:opacity-60"
        >
          {state === "done" ? (
            <>
              <Icon name="check" size={18} /> Message envoyé
            </>
          ) : (
            <>{busy ? "Envoi…" : "Envoyer"}</>
          )}
        </button>

        {/* Retour visible et annoncé — pas d'`alert()`. */}
        <p
          role="status"
          aria-live="polite"
          className={`min-h-5 text-center text-sm ${
            state === "error" ? "font-semibold text-brick" : "text-ink-2"
          }`}
        >
          {message}
        </p>

        <p className="text-center text-xs text-ink-2">
          Les champs marqués <span className="text-brick">*</span> sont obligatoires. Vos
          coordonnées ne servent qu'à vous répondre.
        </p>
      </div>
    </form>
  );
}
