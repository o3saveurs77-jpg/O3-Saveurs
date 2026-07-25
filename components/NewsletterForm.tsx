"use client";

/* Formulaire d'inscription à la newsletter.
 *
 * Volontairement **autonome** : aucun contexte, aucune dépendance à la page qui
 * l'accueille. Il peut donc être posé tel quel dans le pied de page, sur la
 * page de remerciement de commande ou dans l'espace client.
 *
 * L'API répond toujours la même chose (« vérifiez votre boîte mail »), qu'il
 * s'agisse d'une nouvelle adresse ou d'une adresse déjà inscrite : ce composant
 * ne cherche donc pas à distinguer les cas, et n'invente aucun message plus
 * précis que celui du serveur.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

type State = "idle" | "sending" | "done" | "error";

export function NewsletterForm({
  source = "footer",
  variant = "light",
  title = "Les nouveautés de Laila",
  subtitle = "Nouveaux plats, plats du jour et offres. Un email de temps en temps, jamais plus.",
}: {
  /** Provenance de l'inscription, enregistrée en base. */
  source?: "footer" | "checkout" | "admin";
  /** `dark` pour un fond sombre (pied de page). */
  variant?: "light" | "dark";
  title?: string;
  subtitle?: string;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Le message de succès s'effaçait sans être annulé au démontage : sur une
  // navigation rapide, React se plaignait d'un setState sur composant démonté.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return; // garde anti double soumission
    setState("sending");
    setMessage("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, source }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };

      if (res.ok) {
        setState("done");
        setMessage(data.message ?? "Vérifiez votre boîte mail pour confirmer votre inscription.");
        setValue("");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 8000);
      } else {
        setState("error");
        setMessage(data.error ?? "L'inscription n'a pas pu être enregistrée.");
      }
    } catch {
      setState("error");
      setMessage("Connexion impossible. Merci de réessayer dans un instant.");
    }
  };

  const dark = variant === "dark";

  return (
    <form onSubmit={submit} className="max-w-sm">
      <h3 className={`mb-1 flex items-center gap-2 ${dark ? "text-gold" : "text-lg"}`}>
        <Icon name="mail" size={18} /> {title}
      </h3>
      <p className={`mb-3 text-sm ${dark ? "opacity-80" : "text-ink-2"}`}>{subtitle}</p>

      <label htmlFor={`${id}-email`} className="sr-only">
        Votre adresse email
      </label>
      <div className="flex gap-2">
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="vous@email.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={`${id}-status`}
          aria-invalid={state === "error"}
          className={`min-w-0 flex-1 rounded-full px-4 py-2.5 text-sm outline-none ${
            dark
              ? "border border-white/20 bg-white/10 text-footer-ink placeholder:text-footer-ink/50 focus:border-primary"
              : "border border-line bg-page focus:border-primary"
          }`}
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-60"
        >
          {state === "sending" ? "Envoi…" : "Je m'inscris"}
        </button>
      </div>

      {/* Zone d'annonce : pas d'`alert()`, le retour est lisible par un lecteur d'écran. */}
      <p
        id={`${id}-status`}
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-5 text-xs ${
          state === "error" ? "font-semibold text-brick" : dark ? "opacity-80" : "text-ink-2"
        }`}
      >
        {message}
      </p>

      <p className={`mt-1 text-[11px] ${dark ? "opacity-60" : "text-ink-2"}`}>
        Un email de confirmation vous est envoyé — l'inscription n'est effective qu'après votre
        clic. Désinscription en un clic dans chaque message.
      </p>
    </form>
  );
}
