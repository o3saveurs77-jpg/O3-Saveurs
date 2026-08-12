/* Emblème & logo de marque — calqué sur le rond de la maquette de référence
 * (o3-saveurs-site-complet.html : `.logo`) : disque terracotta, fin anneau
 * crème proche du bord, "Ô3" en Playfair Display, "SAVEURS" minuscule en
 * dessous en Inter. */

export function Emblem({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="var(--color-primary)" />
      <circle cx="50" cy="50" r="41" fill="none" stroke="var(--color-panel-2)" strokeWidth="3" />
      <text
        x="50"
        y="55"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight="700"
        fontSize="30"
        fill="var(--color-panel-2)"
      >
        Ô3
      </text>
      <text
        x="50"
        y="69"
        textAnchor="middle"
        fontFamily="var(--font-body)"
        fontWeight="700"
        fontSize="8"
        letterSpacing="2"
        fill="var(--color-panel-2)"
      >
        SAVEURS
      </text>
    </svg>
  );
}

export function Logo({ size = 1 }: { size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Emblem size={44 * size} />
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className="font-display truncate text-ink"
          style={{ fontSize: 20 * size, letterSpacing: "-0.03em" }}
        >
          Ô 3 Saveurs
        </span>
        {/* Sous-titre masqué sur très petits écrans pour éviter tout
            débordement — et de nouveau entre 1024 et 1280 px : c'est là que la
            barre est la plus chargée (six liens de navigation + trois actions),
            et cette ligne, la plus large du logo, s'y faisait couper en plein
            mot (« …CUISINE DU MON… »). Mieux vaut l'omettre que la mutiler. */}
        <span
          className="hidden truncate font-bold uppercase text-primary min-[400px]:block lg:hidden xl:block"
          style={{ fontSize: 9.5 * size, letterSpacing: "0.18em" }}
        >
          Chez Laila · Cuisine du monde
        </span>
      </span>
    </span>
  );
}
