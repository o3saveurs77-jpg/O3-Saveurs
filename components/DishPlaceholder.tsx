/* 22 des 55 plats n'ont pas de photo. L'ancien substitut affichait le premier
 * mot du nom en 56 px sur un aplat crème : une carte sur trois ressemblait à un
 * gabarit oublié, et c'est ce qui donnait à la carte son air inachevé.
 *
 * Une photo empruntée à un autre plat serait pire qu'un vide : sur un site de
 * commande, l'image engage sur ce qui est servi. On assume donc l'absence avec
 * un visuel de marque, dessiné selon la famille du plat. */

type Art = { d: string[]; label: string };

/* Dessins au trait, viewBox 64×64, tracés dans l'ordre du plus grand au plus
 * petit détail. Volontairement sobres : ils cohabitent avec de vraies photos
 * dans la même grille et ne doivent pas leur voler la vedette. */
const ART: Record<string, Art> = {
  entrees: {
    label: "Entrée",
    d: [
      "M14 38a18 18 0 0 1 36 0Z",
      "M14 38h36",
      "M20 38a12 12 0 0 1 24 0",
      "M24 26l2 3M32 23v4M40 26l-2 3",
    ],
  },
  salades: {
    label: "Salade & bowl",
    d: [
      "M12 30h40a20 20 0 0 1-40 0Z",
      "M22 30c-2-6 2-10 6-9M32 30c-3-7 1-12 6-11M42 30c-1-5-4-7-7-6",
      "M26 44h12",
    ],
  },
  maghreb: {
    label: "Maghreb",
    d: [
      "M16 46h32",
      "M20 46a12 12 0 0 1 24 0Z",
      "M32 10l10 22H22Z",
      "M32 10v-3",
    ],
  },
  asiatique: {
    label: "Asie",
    d: [
      "M13 30h38a19 19 0 0 1-38 0Z",
      "M20 24c4-3 8 1 12-2s8 1 12-2",
      "M44 12L30 26M50 14L34 28",
    ],
  },
  africaine: {
    label: "Afrique de l'Ouest",
    d: [
      "M8 40a24 24 0 0 0 48 0Z",
      "M22 40a10 10 0 0 1 20 0Z",
      "M32 30v-4M26 32l-2-3M38 32l2-3",
    ],
  },
  grillades: {
    label: "Grillade",
    d: [
      "M12 22h40M12 32h40M12 42h40",
      "M20 16v32M32 16v32M44 16v32",
    ],
  },
  sandwichs: {
    label: "Sandwich",
    d: [
      "M10 40c0-10 12-22 26-24s18 4 18 10-12 20-26 22-18-2-18-8Z",
      "M18 34c4-4 10-8 16-9M24 42c4-4 10-8 16-9",
    ],
  },
  accompagnements: {
    label: "Accompagnement",
    d: [
      "M18 32h28a14 14 0 0 1-28 0Z",
      "M24 32a8 8 0 0 1 16 0",
      "M14 46h36",
    ],
  },
  boissons: {
    label: "Boisson",
    d: [
      "M20 18h24l-4 30H24Z",
      "M22 30h20",
      "M40 14l-6 34",
    ],
  },
  desserts: {
    label: "Dessert",
    d: [
      "M18 28h28l-5 22H23Z",
      "M18 28a14 8 0 0 1 28 0",
      "M32 20v-4M26 22l-2-3M38 22l2-3",
    ],
  },
};

const FALLBACK: Art = {
  label: "Plat maison",
  d: ["M10 36a22 22 0 0 0 44 0Z", "M22 36a10 10 0 0 1 20 0Z", "M32 14v8"],
};

export function DishPlaceholder({ cat, name }: { cat: string; name: string }) {
  const art = ART[cat] ?? FALLBACK;

  return (
    <div className="dish-ph h-full w-full" role="img" aria-label={`${name} — photo à venir`}>
      <svg
        viewBox="0 0 64 64"
        className="dish-ph-art"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {art.d.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <span className="dish-ph-label">{art.label}</span>
    </div>
  );
}
