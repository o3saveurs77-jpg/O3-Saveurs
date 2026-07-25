import { STATUS_LABEL } from "@/lib/types";
import type { OrderStatus } from "@/lib/types";

const COLOR: Record<OrderStatus, string> = {
  confirmee: "bg-gold/20 text-[#8a6d00]",
  cuisine: "bg-primary-soft text-primary",
  route: "bg-teal/15 text-teal",
  livree: "bg-[#e9f7f4] text-[#0f6b5e]",
  annulee: "bg-brick/10 text-brick",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${COLOR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
