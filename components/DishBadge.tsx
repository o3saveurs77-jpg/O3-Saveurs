import type { Badge } from "@/lib/menu";

const STYLES: Record<string, string> = {
  Healthy: "bg-[#2e8b57] text-white",
  Nouveau: "bg-teal text-white",
  Bientôt: "bg-panel-3 text-ink-2",
  Populaire: "bg-gold text-[#3a2a05]",
  "Sur commande": "bg-brick text-white",
};

export function DishBadge({ kind }: { kind: Badge | "Populaire" | "Sur commande" }) {
  if (!kind) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide ${
        STYLES[kind] ?? "bg-panel-3 text-ink-2"
      }`}
    >
      {kind}
    </span>
  );
}
