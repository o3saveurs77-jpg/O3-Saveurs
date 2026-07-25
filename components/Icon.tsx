/* Jeu d'icônes (paths portés de ui.jsx) */

export const ICONS: Record<string, string> = {
  cart: "M3 4h2l2.4 12.3a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21.5 8H7M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  star: "M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.6 9.7l5.8-.8L12 3.6Z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  pin: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z|M12 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  phone: "M5 4h3l2 5-2.5 1.5a12 12 0 0 0 6 6L17 14l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4Z",
  x: "M6 6l12 12M18 6L6 18",
  chevron: "M9 6l6 6-6 6",
  chevL: "M15 6l-6 6 6 6",
  chevDown: "M6 9l6 6 6-6",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2l-4.3-4.3",
  heart: "M12 20s-7-4.6-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 3.5C19 15.4 12 20 12 20Z",
  truck: "M3 6h11v9H3zM14 9h4l3 3v3h-7zM7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  bag: "M6 7h12l1 13H5L6 7Zm3 0a3 3 0 1 1 6 0",
  check: "M5 12l4.5 4.5L19 7",
  leaf: "M5 19c10 1 14-5 14-14C9 5 4 9 5 19Zm3-3 8-8",
  flame: "M12 3c1 3-2 4-2 7a2 2 0 1 0 4 0c2 2 2 4 2 5a6 6 0 1 1-9-7c1 1 2 1 2-1 0-2 1-4 3-3Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  home: "M4 11l8-6 8 6M6 10v9h12v-9",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  euro: "M16 7a5 5 0 1 0 0 10M5 10h7M5 14h6",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm11-15 4 4",
  trash: "M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13",
  arrow: "M5 12h14M13 6l6 6-6 6",
  menu: "M4 7h16M4 12h16M4 17h16",
  insta: "M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm5-9.5h.01",
  snap: "M12 3c2.7 0 4 2 4 4.2 0 1.3-.2 2.3.4 2.6.5.2 1.2-.4 1.8 0 .5.4.2 1.2-.6 1.7-.7.5-2 .6-2 1.3 0 1 2.8 1.6 4 2.5-.4 1.1-2.4.7-3 1.3-.4.5.2 1.6-.6 1.8-.8.2-1.5-1-2.4-1-1 0-1.6 1.2-2.4 1-.8-.2-.2-1.3-.6-1.8-.6-.6-2.6-.2-3-1.3 1.2-.9 4-1.5 4-2.5 0-.7-1.3-.8-2-1.3-.8-.5-1.1-1.3-.6-1.7.6-.4 1.3.2 1.8 0 .6-.3.4-1.3.4-2.6C8 5 9.3 3 12 3Z",
  sparkle: "M12 3l1.6 5L19 9.6 14 11l-2 5-2-5L5 9.6 10.4 8 12 3Z",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  upload: "M12 16V4M8 8l4-4 4 4M5 20h14",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
};

export function Icon({
  name,
  size = 20,
  className = "",
  strokeWidth = 1.8,
  fill = false,
}: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  fill?: boolean;
}) {
  const paths = (ICONS[name] || "").split("|");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}
