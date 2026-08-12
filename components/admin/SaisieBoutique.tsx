"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { MENTION_COMPTOIR } from "@/lib/prospection";

/**
 * Saisie d'une adresse au comptoir.
 *
 * Pensée pour être utilisée pendant l'encaissement, entre deux clients : le
 * champ reprend le focus après chaque ajout, et le message reste affiché sans
 * bloquer la saisie suivante. Un formulaire qu'il faut rouvrir à chaque
 * adresse ne sert jamais.
 *
 * La phrase à dire au client est affichée en permanence, et pas rangée dans
 * une documentation : l'information au moment du recueil est une **condition**
 * de la base légale invoquée. Sans elle, l'envoi n'est plus couvert.
 *
 * Seule l'adresse email est demandée — ni nom, ni téléphone, ni adresse
 * postale : on ne garde que ce qui sert à l'envoi.
 */
export function SaisieBoutique({ onAjout }: { onAjout: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "info" | "erreur"; text: string } | null>(
    null,
  );
  const champ = useRef<HTMLInputElement>(null);

  const ajouter = async () => {
    const valeur = email.trim();
    if (!valeur) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/newsletter/boutique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: valeur }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        deja?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Ajout refusé");

      setMessage({
        tone: data.ok ? (data.deja ? "info" : "ok") : "info",
        text: data.message ?? "Enregistré.",
      });
      setEmail("");
      onAjout();
    } catch (e) {
      setMessage({ tone: "erreur", text: e instanceof Error ? e.message : "Ajout impossible." });
    } finally {
      setBusy(false);
      // Prêt pour le client suivant, sans reprendre la souris.
      champ.current?.focus();
    }
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-xl">Ajouter un client du comptoir</h2>

      <p className="mt-2 flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm text-brick">
        <Icon name="warning" size={17} className="mt-0.5 shrink-0" />
        <span>
          <strong>À dire avant de saisir.</strong> {MENTION_COMPTOIR}
        </span>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={champ}
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            // Entrée valide : au comptoir, on ne lâche pas le clavier.
            if (e.key === "Enter") {
              e.preventDefault();
              void ajouter();
            }
          }}
          placeholder="client@exemple.fr"
          aria-label="Adresse email du client"
          className="min-w-0 flex-1 basis-64 rounded-lg border border-line bg-page px-4 py-3 outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => void ajouter()}
          disabled={busy || !email.trim()}
          className="rounded-full bg-primary px-6 py-3 font-bold text-white transition hover:brightness-105 disabled:opacity-40"
        >
          {busy ? "…" : "Ajouter"}
        </button>
      </div>

      <div aria-live="polite" className="min-h-6">
        {message && (
          <p
            className={`mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold ${
              message.tone === "ok"
                ? "bg-teal/10 text-teal"
                : message.tone === "info"
                  ? "bg-panel-2 text-ink-2"
                  : "bg-brick/10 text-brick"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-2">
        Ces adresses reçoivent vos campagnes sans double confirmation : la loi l&apos;autorise
        pour vos clients, sur des offres proches de ce qu&apos;ils ont acheté. Le lien de
        désinscription reste présent dans chaque email.
      </p>
    </section>
  );
}
