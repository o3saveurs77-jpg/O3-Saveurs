"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/cart/CartContext";
import { useAuth } from "@/components/providers/AuthContext";
import { fmtPrice } from "@/lib/menu";
import type { Zone } from "@/lib/menu";
import { resolveZone } from "@/lib/zones";
import { Icon } from "@/components/Icon";
import type { OrderMode } from "@/lib/types";

/** Doit rester aligné sur `PAYMENT_METHODS` de `app/api/checkout/route.ts`. */
const PAYMENTS = ["Carte bancaire", "Apple Pay", "Google Pay", "Espèces sur place"] as const;
type Payment = (typeof PAYMENTS)[number];

/**
 * Clé de la commande en attente de retour de paiement — sert à vider le panier
 * au bon moment. Volontairement dupliquée dans `OrderTracker` plutôt
 * qu'importée : un import ferait entrer tout ce module dans le bundle de la
 * page de suivi.
 */
const PENDING_ORDER_KEY = "ots_pending_order";

/**
 * Mémorise l'intention de créer un compte, pour une commande précise — lue par
 * `OrderTracker` sur l'écran « connexion requise » qui suit systématiquement
 * une commande passée en invité (voir `lib/guard.ts` : aucune page de commande
 * n'est accessible sans session, même à son propre auteur).
 */
const WANTS_ACCOUNT_KEY = "ots_wants_account";

interface SlotsResponse {
  open: boolean;
  slots: string[];
  leadTimeMinutes: number;
  nextService: { weekday: number; weekdayLabel: string; label: string; opensAt: string } | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function CheckoutClient() {
  const { lines, subtotalCents } = useCart();
  const { user } = useAuth();

  const [mode, setMode] = useState<OrderMode>("livraison");
  const [slot, setSlot] = useState("asap");
  const [payment, setPayment] = useState<Payment>(PAYMENTS[0]);
  const [promoCode, setPromoCode] = useState("");
  const [cgv, setCgv] = useState(false); // jamais pré-cochée : le consentement doit être actif
  const [wantsAccount, setWantsAccount] = useState(false); // idem : proposition facultative, jamais pré-cochée
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);

  const [zones, setZones] = useState<Zone[] | null>(null);
  const [slots, setSlots] = useState<SlotsResponse | null>(null);
  const [freeDeliveryThresholdCents, setFreeDeliveryThresholdCents] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    address: user?.addresses[0]?.address ?? "",
    zip: user?.addresses[0]?.zip ?? "",
    city: user?.addresses[0]?.city ?? "",
  });

  // Préremplissage dès que la session est connue (le provider hydrate après coup).
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      name: f.name || user.name,
      email: f.email || user.email,
      phone: f.phone || user.phone,
      address: f.address || user.addresses[0]?.address || "",
      zip: f.zip || user.addresses[0]?.zip || "",
      city: f.city || user.addresses[0]?.city || "",
    }));
  }, [user]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /* Bandeau de retour d'un paiement abandonné. `clear()` était appelé **avant**
   * la redirection vers Stripe : le client qui renonçait revenait sur un panier
   * vide, sans explication. `window.location` plutôt que `useSearchParams()`
   * pour ne pas imposer de frontière Suspense à toute la page. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCanceled(params.get("canceled") === "1");
  }, []);

  /* Zones de livraison lues en base — le tunnel utilisait la constante `zones`
   * de `lib/menu.ts`, si bien que modifier les frais dans l'administration ne
   * changeait rien pour le client, qui payait l'ancien tarif indéfiniment. */
  useEffect(() => {
    let alive = true;
    fetch("/api/zones", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("zones"))))
      .then((data: Zone[]) => alive && setZones(data))
      .catch(() => alive && setZones([]));
    return () => {
      alive = false;
    };
  }, []);

  // Seuil de livraison offerte — affiché ici, appliqué pour de vrai par `computeOrder()`.
  useEffect(() => {
    let alive = true;
    fetch("/api/delivery-info", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("delivery-info"))))
      .then((data: { freeDeliveryThresholdCents: number | null }) => {
        if (alive) setFreeDeliveryThresholdCents(data.freeDeliveryThresholdCents);
      })
      .catch(() => alive && setFreeDeliveryThresholdCents(null));
    return () => {
      alive = false;
    };
  }, []);

  // Créneaux réels : plus de liste codée en dur proposant le midi les jours de fermeture.
  useEffect(() => {
    let alive = true;
    fetch("/api/slots", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("slots"))))
      .then((data: SlotsResponse) => {
        if (!alive) return;
        setSlots(data);
        if (!data.open) setSlot(data.slots[0] ?? "");
      })
      .catch(() => alive && setSlots({ open: false, slots: [], leadTimeMinutes: 35, nextService: null }));
    return () => {
      alive = false;
    };
  }, []);

  /* Zone déduite du code postal, comme le fera le serveur. C'est un affichage :
   * la zone facturée est celle que `computeOrder()` recalcule. */
  const zoneMatch = useMemo(() => {
    if (mode !== "livraison" || !zones) return null;
    return resolveZone(zones, { zip: form.zip, city: form.city });
  }, [mode, zones, form.zip, form.city]);

  const zone = useMemo(
    () => (zoneMatch ? zones?.find((z) => z.idx === zoneMatch.zoneIdx) ?? null : null),
    [zoneMatch, zones],
  );

  const addressFilled = form.zip.length === 5 || form.city.trim().length > 1;
  const outOfZone = mode === "livraison" && !!zones && addressFilled && !zone;

  const minimumCents = mode === "livraison" ? zone?.minimumCents ?? 0 : 0;
  // Estimation client de la livraison offerte : le seuil vient de la même
  // promotion automatique que `computeOrder()` applique côté serveur, c'est
  // donc un aperçu fidèle, pas une garantie — le total réel reste recalculé
  // à la validation.
  const freeDeliveryReached =
    freeDeliveryThresholdCents !== null && subtotalCents >= freeDeliveryThresholdCents;
  const feeCents = mode === "livraison" && !freeDeliveryReached ? zone?.feeCents ?? 0 : 0;
  const totalCents = subtotalCents + feeCents;
  const belowMin = mode === "livraison" && !!zone && subtotalCents < minimumCents;

  const slotOptions = useMemo(() => {
    const list = slots?.slots ?? [];
    return slots?.open ? ["asap", ...list] : list;
  }, [slots]);

  // Rien de proposable aujourd'hui, mais un prochain service existe : plutôt
  // que de bloquer la commande, on la propose pour ce service — avec un
  // avertissement (voir plus bas) plutôt qu'un blocage silencieux.
  const canPreOrderNext = !!slots && slotOptions.length === 0 && !!slots.nextService;

  // Un créneau devenu indisponible (service terminé pendant la saisie) est réajusté.
  useEffect(() => {
    if (!slots) return;
    if (slotOptions.length > 0 && !slotOptions.includes(slot)) setSlot(slotOptions[0]);
    else if (slotOptions.length === 0 && canPreOrderNext && slot !== "next") setSlot("next");
  }, [slots, slotOptions, slot, canPreOrderNext]);

  const valid = useMemo(() => {
    if (lines.length === 0 || belowMin || outOfZone) return false;
    if (!cgv) return false;
    const slotOk = slotOptions.length > 0 ? slotOptions.includes(slot) : canPreOrderNext && slot === "next";
    if (!slotOk) return false;
    if (form.name.trim().length < 2) return false;
    if (!EMAIL_RE.test(form.email.trim())) return false;
    if (form.phone.replace(/\D/g, "").length < 9) return false;
    if (mode === "livraison") {
      if (form.address.trim().length < 5) return false;
      if (form.city.trim().length < 2) return false;
      if (!/^\d{5}$/.test(form.zip.trim())) return false;
    }
    return true;
  }, [lines.length, belowMin, outOfZone, cgv, slot, slotOptions, canPreOrderNext, form, mode]);

  const placeOrder = useCallback(async () => {
    if (!valid || placing) return; // garde de double soumission
    setPlacing(true);
    setError(null);

    /* Le corps ne porte **aucun montant** : ni prix unitaire, ni sous-total, ni
     * frais, ni total. Le serveur relit tout en base (`lib/pricing.ts`). C'est
     * la faille qui permettait d'encaisser un panier de 80 € à 1 centime.
     * La zone n'est pas envoyée non plus : elle est déduite du code postal. */
    const payload = {
      lines: lines.map((l) => ({
        dishId: l.dishId,
        qty: l.qty,
        opts: l.opts,
        formule: l.formule,
        note: l.note,
      })),
      mode,
      slot,
      customer: {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        ...(mode === "livraison"
          ? { address: form.address.trim(), city: form.city.trim(), zip: form.zip.trim() }
          : {}),
      },
      promoCode: promoCode.trim() ? promoCode.trim().toUpperCase() : null,
      paymentMethod: payment,
    };

    try {
      // Tous les moyens de paiement passent par la même route, espèces comprises :
      // elle seule sait calculer les montants et vérifier les horaires.
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        orderId?: string;
        error?: string;
      };

      if (!res.ok || !data.url) {
        setError(data.error ?? "La commande n'a pas pu être enregistrée, réessayez.");
        setPlacing(false);
        return;
      }

      /* Le panier n'est **pas** vidé ici quand une redirection Stripe suit : un
       * client qui annule doit retrouver son panier intact. L'identifiant de la
       * commande est mémorisé, et `OrderTracker` vide le panier au retour
       * confirmé sur `/commande/{id}`. */
      try {
        if (data.orderId) {
          sessionStorage.setItem(PENDING_ORDER_KEY, data.orderId);
          if (!user && wantsAccount) sessionStorage.setItem(WANTS_ACCOUNT_KEY, data.orderId);
        }
      } catch {
        /* navigation privée : le panier sera simplement vidé plus tard */
      }

      window.location.href = data.url;
    } catch {
      setError("Le paiement est momentanément indisponible. Réessayez dans un instant.");
      setPlacing(false);
    }
  }, [valid, placing, lines, mode, slot, form, promoCode, payment, user, wantsAccount]);

  if (lines.length === 0) {
    return (
      <div className="wrap flex flex-col items-center gap-4 py-24 text-center">
        {canceled && (
          <p className="rounded-xl bg-primary-soft px-4 py-3 text-sm font-semibold text-brick">
            Paiement annulé — aucun montant n'a été débité.
          </p>
        )}
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
  const labelCls = "mb-1.5 block text-sm font-semibold text-ink-2";
  const closed = !!slots && slotOptions.length === 0;

  return (
    <div className="wrap grid gap-8 py-10 lg:grid-cols-[1.4fr_1fr]">
      {/* ── colonne gauche : options ── */}
      <div className="space-y-6">
        {canceled && (
          <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-line bg-primary-soft p-4 text-sm text-brick">
            <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
            <span>
              <strong>Paiement annulé.</strong> Aucun montant n'a été débité et votre panier est
              intact — vous pouvez reprendre votre commande ci-dessous.
            </span>
          </p>
        )}

        {closed && (
          <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-line bg-panel-2 p-4 text-sm text-ink">
            <Icon name="clock" size={18} className="mt-0.5 shrink-0 text-primary" />
            <span>
              <strong>Nous sommes fermés.</strong>{" "}
              {slots?.nextService
                ? `Prochain service : ${slots.nextService.weekdayLabel} à partir de ${slots.nextService.opensAt}.`
                : "Revenez à l'ouverture du prochain service."}
            </span>
          </p>
        )}

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
                type="button"
                onClick={() => setMode(o.m)}
                aria-pressed={mode === o.m}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition ${
                  mode === o.m
                    ? "border-primary bg-primary-soft"
                    : "border-line hover:border-primary/40"
                }`}
              >
                <Icon name={o.icon} size={22} className="text-primary" />
                <span className="font-bold">{o.label}</span>
                <span className="text-xs text-ink-2">{o.sub}</span>
              </button>
            ))}
          </div>

          {/* Plus de sélecteur de zone : la zone tarifaire est déduite du code
              postal côté serveur. Un client de Serris ne peut plus choisir
              « Zone 1 » et se faire livrer à 25 km pour 2,50 €. */}
          {mode === "livraison" && (
            <p className="mt-4 rounded-xl bg-panel-2 p-3 text-sm text-ink-2">
              {zone ? (
                <>
                  Cette adresse est livrable : frais de livraison{" "}
                  <strong className="text-ink">{fmtPrice(zone.feeCents)}</strong>
                  {freeDeliveryThresholdCents !== null && (
                    <>
                      {" "}
                      (offerts dès{" "}
                      <strong className="text-ink">{fmtPrice(freeDeliveryThresholdCents)}</strong>{" "}
                      d'achat)
                    </>
                  )}
                  , minimum de commande <strong className="text-ink">{fmtPrice(zone.minimumCents)}</strong>.
                </>
              ) : outOfZone ? (
                <>
                  Nous ne livrons pas encore à cette adresse. Vérifiez le code postal, ou choisissez
                  « à emporter ».
                </>
              ) : (
                <>
                  Renseignez votre code postal ci-dessous pour vérifier que votre adresse est
                  livrable.
                </>
              )}
            </p>
          )}
        </section>

        {/* créneau */}
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-1 text-lg">2 · Créneau</h2>
          <p className="mb-3 text-xs text-ink-2">
            {slots
              ? `Comptez environ ${slots.leadTimeMinutes} minutes de préparation.`
              : "Chargement des créneaux…"}
          </p>
          <div className="flex flex-wrap gap-2">
            {slotOptions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlot(s)}
                aria-pressed={slot === s}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  slot === s
                    ? "border-primary bg-primary text-white"
                    : "border-line hover:border-primary/40"
                }`}
              >
                {s === "asap" ? "Au plus vite" : s}
              </button>
            ))}
            {canPreOrderNext && slots?.nextService && (
              <button
                type="button"
                onClick={() => setSlot("next")}
                aria-pressed={slot === "next"}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  slot === "next"
                    ? "border-primary bg-primary text-white"
                    : "border-line hover:border-primary/40"
                }`}
              >
                {slots.nextService.weekdayLabel} {slots.nextService.opensAt}
              </button>
            )}
            {slots && slotOptions.length === 0 && !slots.nextService && (
              <p className="text-sm text-ink-2">Aucun créneau disponible aujourd'hui.</p>
            )}
          </div>

          {/* Commande posée alors que le restaurant est fermé : acceptée, mais
              il faut que le client sache qu'elle ne partira en cuisine qu'à
              l'ouverture — sans ça, un client qui commande la veille au soir
              pourrait croire à une livraison immédiate. */}
          {canPreOrderNext && slot === "next" && slots?.nextService && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm text-brick">
              <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
              Nous sommes fermés pour le moment. Votre commande sera transmise en cuisine à
              l'ouverture du prochain service : {slots.nextService.weekdayLabel} à partir de{" "}
              {slots.nextService.opensAt}.
            </p>
          )}
        </section>

        {/* coordonnées */}
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-3 text-lg">3 · Vos coordonnées</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="co-name" className={labelCls}>
                Nom complet
              </label>
              <input
                id="co-name"
                name="name"
                autoComplete="name"
                className={inputCls}
                value={form.name}
                onChange={set("name")}
                placeholder="Prénom Nom"
                required
              />
            </div>
            <div>
              <label htmlFor="co-email" className={labelCls}>
                Email
              </label>
              <input
                id="co-email"
                name="email"
                type="email"
                autoComplete="email"
                className={inputCls}
                value={form.email}
                onChange={set("email")}
                placeholder="vous@email.com"
                required
              />
            </div>
            <div>
              <label htmlFor="co-phone" className={labelCls}>
                Téléphone
              </label>
              <input
                id="co-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                className={inputCls}
                value={form.phone}
                onChange={set("phone")}
                placeholder="06 12 34 56 78"
                required
              />
            </div>
            {mode === "livraison" && (
              <>
                <div className="sm:col-span-2">
                  <label htmlFor="co-address" className={labelCls}>
                    Adresse
                  </label>
                  <input
                    id="co-address"
                    name="address"
                    autoComplete="street-address"
                    className={inputCls}
                    value={form.address}
                    onChange={set("address")}
                    placeholder="N° et rue"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="co-zip" className={labelCls}>
                    Code postal
                  </label>
                  <input
                    id="co-zip"
                    name="postal-code"
                    autoComplete="postal-code"
                    inputMode="numeric"
                    maxLength={5}
                    className={inputCls}
                    value={form.zip}
                    onChange={set("zip")}
                    placeholder="77185"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="co-city" className={labelCls}>
                    Ville
                  </label>
                  <input
                    id="co-city"
                    name="city"
                    autoComplete="address-level2"
                    className={inputCls}
                    value={form.city}
                    onChange={set("city")}
                    placeholder="Lognes"
                    required
                  />
                </div>
              </>
            )}
          </div>

          {/* Proposée uniquement à un client non connecté — un compte existant
              n'a pas besoin qu'on lui repropose d'en créer un. Facultative et
              non pré-cochée, comme le consentement CGV : la commande aboutit
              qu'elle soit cochée ou non. */}
          {!user && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-panel-2 p-3">
              <input
                id="co-account"
                type="checkbox"
                checked={wantsAccount}
                onChange={(e) => setWantsAccount(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <label htmlFor="co-account" className="text-sm">
                Créer un compte avec ces informations pour retrouver l'historique de mes
                commandes, mes factures et mes informations.
              </label>
            </div>
          )}
        </section>

        {/* paiement */}
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-1 text-lg">4 · Paiement</h2>
          <p className="mb-3 text-xs text-ink-2">
            Paiement par carte sécurisé par Stripe — nous ne voyons ni ne conservons vos données
            bancaires.
          </p>
          <div className="flex flex-wrap gap-2">
            {PAYMENTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPayment(p)}
                aria-pressed={payment === p}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  payment === p
                    ? "border-primary bg-primary text-white"
                    : "border-line hover:border-primary/40"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* code promotionnel — vérifié par le serveur, jamais appliqué ici */}
          <div className="mt-5">
            <label htmlFor="co-promo" className={labelCls}>
              Code promotionnel (facultatif)
            </label>
            <input
              id="co-promo"
              name="promo"
              className={`${inputCls} uppercase`}
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="BIENVENUE"
              maxLength={32}
              aria-describedby="co-promo-help"
            />
            <p id="co-promo-help" className="mt-1.5 text-xs text-ink-2">
              La validité du code et le montant de la remise sont vérifiés par nos serveurs au
              moment du paiement.
            </p>
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
                  <span className="font-semibold">
                    {l.qty}× {l.name}
                  </span>
                  {l.formule && <span className="block text-xs text-ink-2">{l.formule}</span>}
                  {Object.values(l.opts).length > 0 && (
                    <span className="block text-xs text-ink-2">
                      {Object.values(l.opts).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="font-semibold">{fmtPrice(l.unitPriceCents * l.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="my-4 h-px bg-line" />

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-2">Sous-total</dt>
              <dd className="font-semibold">{fmtPrice(subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">
                {mode === "livraison" ? "Frais de livraison" : "À emporter"}
              </dt>
              <dd className="font-semibold">
                {mode !== "livraison"
                  ? "Gratuit"
                  : !zone
                    ? "selon votre adresse"
                    : freeDeliveryReached
                      ? "Offerte"
                      : fmtPrice(zone.feeCents)}
              </dd>
            </div>
          </dl>

          <div className="my-4 h-px bg-line" />

          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold">Total TTC</span>
            <span className="font-display text-2xl text-brick">{fmtPrice(totalCents)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-2">
            TVA incluse. Une remise éventuelle est appliquée par nos serveurs après vérification du
            code.
          </p>

          {belowMin && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm text-brick">
              <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
              Minimum de commande {fmtPrice(minimumCents)} pour cette zone — il manque{" "}
              {fmtPrice(minimumCents - subtotalCents)}.
            </p>
          )}

          {mode === "livraison" &&
            zone &&
            !belowMin &&
            !freeDeliveryReached &&
            freeDeliveryThresholdCents !== null && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-teal/10 p-3 text-sm text-teal">
                <Icon name="sparkle" size={18} className="mt-0.5 shrink-0" />
                Plus que {fmtPrice(freeDeliveryThresholdCents - subtotalCents)} d'achat pour la
                livraison offerte.
              </p>
            )}

          {/* Consentement aux CGV — non pré-coché (art. 1127-1 C. civ.). Sans lui,
              l'exclusion du droit de rétractation sur les denrées périssables
              n'est pas opposable. */}
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-panel-2 p-3">
            <input
              id="co-cgv"
              type="checkbox"
              checked={cgv}
              onChange={(e) => setCgv(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <label htmlFor="co-cgv" className="text-sm">
              J'ai lu et j'accepte les{" "}
              <Link href="/cgv" className="font-semibold text-primary underline">
                conditions générales de vente
              </Link>
              . Je reconnais que les denrées périssables préparées à ma commande sont exclues du
              droit de rétractation.
            </label>
          </div>

          <button
            type="button"
            onClick={placeOrder}
            disabled={!valid || placing}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 font-bold transition ${
              valid && !placing
                ? "bg-primary text-white hover:brightness-105"
                : "cursor-not-allowed bg-panel-2 text-ink-2"
            }`}
          >
            {placing ? (
              "Traitement…"
            ) : payment === "Espèces sur place" ? (
              <>Confirmer la commande · {fmtPrice(totalCents)}</>
            ) : (
              <>Payer {fmtPrice(totalCents)}</>
            )}
          </button>

          {/* Récapitulatif légal — remplace les mentions « Démonstration » et
              « Paiement simulé — aucune carte débitée », qui étaient fausses : le
              bouton déclenche un vrai encaissement. */}
          <p className="mt-3 text-center text-xs text-ink-2">
            {payment === "Espèces sur place" ? (
              <>
                Vous réglerez <strong className="text-ink">{fmtPrice(totalCents)}</strong> TTC sur
                place. Le montant définitif est calculé par nos serveurs.
              </>
            ) : (
              <>
                En validant, <strong className="text-ink">{fmtPrice(totalCents)}</strong> TTC seront
                débités de votre carte via Stripe. Le montant définitif est calculé par nos serveurs
                d'après la carte du jour et votre zone de livraison.
              </>
            )}
          </p>

          {/* Zone d'annonce — les erreurs passaient par `alert()`, boîte native
              bloquante que les navigateurs in-app (Instagram, Facebook) suppriment :
              l'utilisateur voyait un bouton qui ne faisait rien. */}
          <div aria-live="assertive" role="status" className="mt-3">
            {error && (
              <p className="flex items-start gap-2 rounded-xl border border-brick/30 bg-primary-soft p-3 text-sm font-semibold text-brick">
                <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
