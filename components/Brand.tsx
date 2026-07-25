/* Emblème & logo de marque (porté de ui.jsx) */

export function Emblem({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="var(--color-brick)" />
      <circle cx="50" cy="50" r="40" fill="var(--color-primary)" />
      <g opacity="0.9">
        {Array.from({ length: 16 }).map((_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={50 + Math.cos(a) * 41}
              y1={50 + Math.sin(a) * 41}
              x2={50 + Math.cos(a) * 46}
              y2={50 + Math.sin(a) * 46}
              stroke="var(--color-gold)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          );
        })}
      </g>
      <text
        x="50"
        y="63"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight="800"
        fontSize="38"
        fill="#fff"
      >
        Ô3
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
        {/* sous-titre masqué sur très petits écrans pour éviter tout débordement */}
        <span
          className="hidden truncate font-bold uppercase text-primary min-[400px]:block"
          style={{ fontSize: 9.5 * size, letterSpacing: "0.18em" }}
        >
          Chez Laila · Cuisine du monde
        </span>
      </span>
    </span>
  );
}
