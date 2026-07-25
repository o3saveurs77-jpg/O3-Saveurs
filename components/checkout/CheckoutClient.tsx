"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/cart/CartContext";
import { useOrders } from "@/components/providers/OrdersContext";
import { useAuth } from "@/components/providers/AuthContext";
import { zones, fmtPrice } from "@/lib/menu";
import { Icon } from "@/components/Icon";
import type { OrderMode } from "@/lib/types";

const SLOTS = ["asap", "12:00", "12:30", "13:00", "19:00", "19:30", "20:00", "20:30", "21:00"];
const PAYMENTS = ["Carte bancaire", "Apple Pay", "Google Pay", "Espèces sur place"];

export function CheckoutClient() {
  const router = useRouter();
  const { lines, subtotal, clear } = useCart();
  const { create } = useOrders();
  const { user } = useAuth();

  const [mode, setMode] = useState<OrderMode>("livraison");
  const [zoneIdx, setZoneIdx] = useState(0);
  const [slot, setSlot] = useState("asap");
  const [payment, setPayment] = useState(PAYMENTS[0]);
  const [placing, setPlacing] = useState(false);

  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    address: user?.addresses[0]?.address ?? "",
    zip: user?.addresses[0]?.zip ?? "",
    city: user?.addresses[0]?.city ?? "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const fee = mode === "livraison" ? zones[zoneIdx].fee : 0;
  const min = mode === "livraison" ? zones[zoneIdx].min : 0;
  const total = subtotal + fee;
  const belowMin = mode === "livraison" && subtotal < min;

  const valid = useMemo(() => {
    if (lines.length === 0 || belowMin) return false;
    if (!form.name || !form.email || !form.phone) return false;
    if (mode === "livraison" && (!form.address || !form.city)) return false;
    return true;
  }, [lines.length, belowMin, form, mode]);

  const placeOrder = async () => {
    if (!valid || placing) return;
    setPlacing(true);

    const payload = {
      lines,
      mode,
      zoneIdx: mode === "livraison" ? zoneIdx : null,
      slot,
      customer: {
        name: form.name,
        email: form.email,
        phone: form.phone,
        address: mode === "livraison" ? form.address : undefined,
        city: mode === "livraison" ? form.city : undefined,
        zip: mode === "livraison" ? form.zip : undefined,
      },
      subtotal,
      fee,
      paymentMethod: payment,
    };

    // Espèces sur place : pas de paiement en ligne, commande créée directement.
    if (payment === "Espèces sur place") {
      const order = await create(payload);
      if (!order) {
        setPlacing(false);
        alert("La commande n'a pas pu être enregistrée, réessayez.");
        return;
      }
      clear();
      router.push(`/commande/${order.id}`);
      return;
    }

    // Paiement carte / wallet : redirection vers Stripe Checkout.
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Paiement indisponible.");
      clear();
      window.location.href = data.url; // Stripe (ou retour direct si non configuré)
    } catch (e) {
      setPlacing(false);
      alert(e instanceof Error ? e.message : "Le paiement a échoué, réessayez.");
    }
  };

  if (lines.length === 0) {
    return (
      <div className="wrap flex flex-col items-center gap-4 py-24 text-center">
        <Icon name="bag" size={56} className="text-ink-2 opacity-30" />
        <h1 className="text-2xl">Votre panier est vide</h1>
        <p className="text-ink-2">Ajoutez des plats avant de passer commande.</p>
        <Link
          href="/carte"
          className="mt-2 rounded-full bg-primary px-6 py-3 font-bold text-white hover:brightness-105"
        >
          Voir la carte
        </Link>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-[var(--radius-soft)] border border-line bg-page px-4 py-3 outline-none focus:border-primary";

  return (
    <div className="wrap grid gap-8 py-10 lg:grid-cols-[1.4fr_1fr]">
      {/* ── colonne gauche : options ── */}
      <div className="space-y-6">
        {/* mode */}
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-3 text-lg">1 · Mode de récupération</h2>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { m: "livraison", icon: "truck", label: "Livraison", sub: "Chez vous" },
                { m: "emporter", icon: "bag", label: "À emporter", sub: "Au restaurant" },
              ] as const
            ).map((o) => (
              <button
                key={o.m}
                onClick={() => setMode(o.m)}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition ${
                  mode === o.m ? "border-primary bg-primary-soft" : "border-line hover:border-primary/40"
                }`}
              >
                <Icon name={o.icon} size={22} className="text-primary" />
                <span className="font-bold">{o.label}</span>
                <span className="text-xs text-ink-2">{o.sub}</span>
              </button>
            ))}
          </div>

          {mode === "livraison" && (
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-semibold text-ink-2">Votre zone</label>
              <select
                value={zoneIdx}
                onChange={(e) => setZoneIdx(Number(e.target.value))}
                className={inputCls}
              >
                {zones.map((z, i) => (
                  <option key={i} value={i}>
                    Zone {i + 1} — {z.villes.slice(0, 3).join(", ")}… (frais {fmtPrice(z.fee)}, min {fmtPrice(z.min)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* créneau */}
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-3 text-lg">2 · Créneau</h2>
          <div className="flex flex-wrap gap-2">
            {SLOTS.map((s) => (
              <button
                key={s}
                onClick={() => setSlot(s)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  slot === s ? "border-primary bg-primary text-white" : "border-line hover:border-primary/40"
                }`}
              >
                {s === "asap" ? "Au plus vite" : s}
              </button>
            ))}
          </div>
        </section>

        {/* coordonnées */}
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-3 text-lg">3 · Vos coordonnées</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-semibold text-ink-2">Nom complet</label>
              <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Prénom Nom" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink-2">Email</label>
              <input className={inputCls} type="email" value={form.email} onChange={set("email")} placeholder="vous@email.com" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink-2">Téléphone</label>
              <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="06 …" />
            </div>
            {mode === "livraison" && (
              <>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-ink-2">Adresse</label>
                  <input className={inputCls} value={form.address} onChange={set("address")} placeholder="N° et rue" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-ink-2">Code postal</label>
                  <input className={inputCls} value={form.zip} onChange={set("zip")} placeholder="77185" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-ink-2">Ville</label>
                  <input className={inputCls} value={form.city} onChange={set("city")} placeholder="Lognes" />
                </div>
              </>
            )}
          </div>
        </section>

        {/* paiement (mock Stripe) */}
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-1 text-lg">4 · Paiement</h2>
          <p className="mb-3 text-xs text-ink-2">
            Démonstration — le paiement sécurisé Stripe sera branché prochainement.
          </p>
          <div className="flex flex-wrap gap-2">
            {PAYMENTS.map((p) => (
              <button
                key={p}
                onClick={() => setPayment(p)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  payment === p ? "border-primary bg-primary text-white" : "border-line hover:border-primary/40"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── colonne droite : récap ── */}
      <aside className="lg:sticky lg:top-[84px] lg:h-fit">
        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-4 text-lg">Récapitulatif</h2>
          <ul className="space-y-3">
            {lines.map((l) => (
              <li key={l.key} className="flex justify-between gap-3 text-sm">
                <span className="flex-1">
                  <span className="font-semibold">{l.qty}× {l.name}</span>
                  {l.formule && <span className="block text-xs text-ink-2">{l.formule}</span>}
                  {Object.values(l.opts).length > 0 && (
                    <span className="block text-xs text-ink-2">{Object.values(l.opts).join(" · ")}</span>
                  )}
                </span>
                <span className="font-semibold">{fmtPrice(l.unitPrice * l.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="my-4 h-px bg-line" />

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-2">Sous-total</dt>
              <dd className="font-semibold">{fmtPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">{mode === "livraison" ? "Frais de livraison" : "À emporter"}</dt>
              <dd className="font-semibold">{mode === "livraison" ? fmtPrice(fee) : "Gratuit"}</dd>
            </div>
          </dl>

          <div className="my-4 h-px bg-line" />

          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold">Total</span>
            <span className="font-display text-2xl text-brick">{fmtPrice(total)}</span>
          </div>

          {belowMin && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm text-brick">
              <Icon name="info" size={18} className="mt-0.5 shrink-0" />
              Minimum de commande {fmtPrice(min)} pour cette zone — il manque {fmtPrice(min - subtotal)}.
            </p>
          )}

          <button
            onClick={placeOrder}
            disabled={!valid || placing}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 font-bold transition ${
              valid && !placing
                ? "bg-primary text-white hover:brightness-105"
                : "cursor-not-allowed bg-panel-2 text-ink-2"
            }`}
          >
            {placing ? "Traitement…" : <>Payer {fmtPrice(total)}</>}
          </button>
          <p className="mt-2 text-center text-xs text-ink-2">Paiement simulé — aucune carte débitée.</p>
        </div>
      </aside>
    </div>
  );
}
