"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Champ d'adresse avec suggestions Google.
 *
 * Les suggestions passent par `/api/address/suggest`, jamais par le SDK Google
 * chargé dans le navigateur : la clé reste côté serveur. Sans clé configurée,
 * l'API répond une liste vide et ce composant se comporte exactement comme un
 * champ de saisie ordinaire — la commande reste possible.
 *
 * Choisir une suggestion transmet un `placeId` au serveur, qui mesure lui-même
 * la distance. Le client ne peut donc pas influencer son tarif : au pire il
 * désigne une autre adresse, qui sera facturée à sa vraie distance.
 */
interface Props {
  value: string;
  onChange: (address: string) => void;
  /** Remonte l'identifiant Google, ou `null` dès que la saisie est modifiée à la main. */
  onPick: (picked: { placeId: string; label: string } | null) => void;
  /** Renseigne code postal et ville quand la suggestion les contient. */
  onResolve?: (parts: { zip?: string; city?: string }) => void;
  className?: string;
  id?: string;
  placeholder?: string;
}

interface Suggestion {
  placeId: string;
  label: string;
}

/** Jeton de session Google : regroupe les frappes d'une recherche en une facturation. */
function newToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Extrait code postal et commune d'un libellé Google.
 * Format habituel : « 12 rue X, 77340 Pontault-Combault, France ».
 */
export function parseFrenchAddress(label: string): { zip?: string; city?: string } {
  const m = label.match(/\b(\d{5})\s+([^,]+)/);
  if (!m) return {};
  return { zip: m[1], city: m[2].trim() };
}

export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  onResolve,
  className,
  id,
  placeholder,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const token = useRef(newToken());
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  /* Le champ ne doit pas interroger Google à chaque caractère : on attend une
   * pause de saisie. Sans cela, « 6 bis rue du Village » déclencherait vingt
   * appels facturés pour une seule adresse. */
  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }

    let alive = true;
    const timer = setTimeout(() => {
      fetch(`/api/address/suggest?q=${encodeURIComponent(q)}&token=${token.current}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("suggest"))))
        .then((data: { suggestions: Suggestion[] }) => {
          if (!alive) return;
          setSuggestions(data.suggestions ?? []);
          setActive(-1);
        })
        // Échec silencieux : le champ reste utilisable en saisie libre, et le
        // serveur repliera sur les zones. Alerter ici n'aiderait personne.
        .catch(() => alive && setSuggestions([]));
    }, 300);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [value]);

  // Fermeture au clic extérieur — sans cela la liste reste ouverte par-dessus
  // le reste du formulaire.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (s: Suggestion) => {
    // On ne garde que la rue : code postal et ville ont leurs propres champs.
    const street = s.label.split(",")[0]?.trim() || s.label;
    onChange(street);
    onPick({ placeId: s.placeId, label: s.label });
    onResolve?.(parseFrenchAddress(s.label));
    setOpen(false);
    setSuggestions([]);
    // Nouvelle session Google pour la recherche suivante.
    token.current = newToken();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // Toute frappe invalide la suggestion retenue : sans ça, corriger le
          // numéro de rue garderait le `placeId` de l'adresse précédente et
          // ferait mesurer la distance du mauvais point.
          onPick(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        className={className}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-[var(--radius-soft)] border border-line bg-panel shadow-[var(--shadow-lg)]"
        >
          {suggestions.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === active}>
              <button
                type="button"
                // `onMouseDown` et non `onClick` : le clic ferait d'abord
                // perdre le focus au champ, ce qui fermerait la liste avant
                // que la sélection ne soit prise en compte.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition ${
                  i === active ? "bg-primary-soft text-brick" : "hover:bg-panel-2"
                }`}
              >
                <Icon name="pin" size={15} className="shrink-0 text-primary" />
                <span className="truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
