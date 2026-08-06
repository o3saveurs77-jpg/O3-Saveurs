"use client";

/* Emporter la carte : le PDF officiel en téléchargement, et le QR code pour la
 * rouvrir sur un téléphone.
 *
 * Le QR est replié par défaut. Affiché en permanence, il occupe une place
 * considérable sous le titre alors qu'il ne sert qu'à un visiteur sur cent —
 * et sur mobile il ne sert à personne, puisqu'on ne scanne pas l'écran qu'on
 * tient. Le bouton l'ouvre à la demande.
 *
 * L'image vient de `/api/carte/qr`, rendue en SVG côté serveur : aucune
 * bibliothèque de QR n'est embarquée dans le paquet du navigateur.
 */

import { useId, useState } from "react";
import { Icon } from "@/components/Icon";

/** Chemin public du PDF, déposé dans `public/`. */
const PDF_HREF = "/carte-o3-saveurs.pdf";

export function CarteActions() {
  const [showQr, setShowQr] = useState(false);
  const panelId = useId();

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href={PDF_HREF}
          /* `download` propose l'enregistrement plutôt que la visionneuse
             intégrée ; la valeur donne au fichier un nom parlant une fois
             dans le dossier de téléchargements du visiteur. */
          download="Carte - O3 Saveurs.pdf"
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-bold text-primary transition hover:brightness-95"
        >
          <Icon name="download" size={18} />
          Télécharger la carte (PDF)
        </a>

        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          aria-expanded={showQr}
          aria-controls={panelId}
          className="inline-flex items-center gap-2 rounded-full border border-white/35 px-5 py-3 font-bold text-white transition hover:bg-white/10"
        >
          <Icon name="qr" size={18} />
          {showQr ? "Masquer le QR code" : "QR code"}
        </button>
      </div>

      <div id={panelId} hidden={!showQr} className="mt-5">
        <div className="mx-auto flex max-w-xs flex-col items-center gap-3 rounded-[var(--radius-card)] border border-white/25 bg-white/10 p-5 backdrop-blur">
          {/* Fond blanc explicite : un QR sur un aplat translucide sombre perd
              le contraste dont les lecteurs ont besoin. */}
          {/* `next/image` n'a rien à optimiser ici : la ressource est un SVG
              d'environ un kilo-octet, déjà résolution-indépendante. Le passer
              par l'optimiseur ajouterait un aller-retour serveur pour la
              réécrire à l'identique. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/api/carte/qr?cible=carte"
            alt="QR code menant à la carte d'Ô 3 Saveurs"
            width={176}
            height={176}
            className="h-44 w-44 rounded-xl bg-white p-2"
          />
          <p className="text-center text-sm text-white/85">
            Scannez pour ouvrir la carte sur votre téléphone.
          </p>
        </div>
      </div>
    </div>
  );
}
