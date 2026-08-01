import Link from "next/link";
import { fmtCents } from "@/lib/money";
import { Icon, type IconName } from "@/components/Icon";
import type { StatsResponse } from "@/lib/analytics";

export function Alerts({ alerts }: { alerts: StatsResponse["alerts"] }) {
  const items: {
    icon: IconName;
    tone: "critique" | "attention";
    text: string;
    href?: string;
  }[] = [];

  if (alerts.late.count > 0) {
    items.push({
      icon: "clock",
      tone: "critique",
      text: `${alerts.late.count} commande(s) en retard — la plus ancienne attend depuis ${
        alerts.late.orders[0]?.minutes ?? 0
      } min`,
      href: "/admin/cuisine",
    });
  }
  if (alerts.unpaid.count > 0) {
    items.push({
      icon: "euro",
      tone: "attention",
      text: `${alerts.unpaid.count} commande(s) acceptée(s) non encaissée(s) — ${fmtCents(
        alerts.unpaid.totalCents,
      )} à encaisser`,
      href: "/admin/commandes?filtre=impayees",
    });
  }
  if (alerts.lowStock.length > 0) {
    items.push({
      icon: "box",
      tone: "attention",
      text: `Stock bas : ${alerts.lowStock
        .slice(0, 4)
        .map((d) => `${d.name} (${d.stock})`)
        .join(", ")}${alerts.lowStock.length > 4 ? `, +${alerts.lowStock.length - 4}` : ""}`,
      href: "/admin/stocks",
    });
  }
  if (alerts.abandoned.count > 0) {
    items.push({
      icon: "cart",
      tone: "attention",
      text: `${alerts.abandoned.count} panier(s) abandonné(s) depuis plus de 30 min — ${fmtCents(
        alerts.abandoned.totalCents,
      )} perdus`,
      href: "/admin/commandes?filtre=abandonnes",
    });
  }

  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink">
        <Icon name="check" size={18} className="text-ink" />
        Rien à signaler : pas de retard, pas d&apos;impayé, pas de stock bas.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.text}>
          <div
            className={`flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] px-4 py-3 text-sm font-semibold ${
              a.tone === "critique"
                ? "bg-brick text-white"
                : "border border-line bg-panel-2 text-ink"
            }`}
          >
            <Icon name={a.icon} size={18} />
            <span>{a.text}</span>
            {a.href && (
              <Link
                href={a.href}
                className={`ml-auto inline-flex items-center gap-1 underline ${
                  a.tone === "critique" ? "text-white" : "text-ink"
                }`}
              >
                Voir <Icon name="arrow" size={14} />
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
