"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/cart/CartContext";
import { useAuth } from "@/components/providers/AuthContext";
import { fmtPrice, info } from "@/lib/menu";
import type { Zone } from "@/lib/menu";
import { resolveZone } from "@/lib/zones";
import { formatKm } from "@/lib/delivery";
import { Icon } from "@/components/Icon";
import { AddressAutocomplete } from "./AddressAutocomplete";
import type { DeliveryQuote } from "@/app/api/delivery-quote/route";
import type { OrderMode } from "@/lib/types";

/** Doit rester aligné sur `PAYMENT_METHODS` de `app/api/checkout/route.ts`. */
const PAYMENTS = ["Carte bancaire", "Apple Pay", "Google Pay", "PayPal", "Espèces sur place"] as const;
type Payment = (typeof PAYMENTS)[number];

const PAYMENT_INFO: Record<Payment, string> = {
  "Carte bancaire": "Débit immédiat, sécurisé par Stripe",
  "Apple Pay": "Paiement en un geste depuis votre iPhone",
  "Google Pay": "Paiement en un geste depuis Android",
  PayPal: "Redirection vers votre compte PayPal",
  "Espèces sur place": "Réglez en liquide à la livraison ou au retrait",
};

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

  /* Une panne de `/api/zones` ou `/api/slots` était présentée au client comme
   * un refus du restaurant : zones à `[]` faisait afficher « hors zone de
   * livraison », créneaux à `[]` faisait afficher « Nous sommes fermés ». Le
   * client repartait en croyant qu'on ne le livrait pas, alors que le serveur
   * était simplement indisponible. On distingue désormais les deux, et l'échec
   * technique est dit comme tel, avec un bouton pour réessayer. */
  const [zonesError, setZonesError] = useState(false);
  const [slotsError, setSlotsError] = useState(false);

  /* Adresse choisie dans l'autocomplétion. C'est un **indice de mesure** envoyé
   * au serveur, jamais un tarif : le serveur interroge Google lui-même. */
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoting, setQuoting] = useState(false);

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
  const [reloadKey, setReloadKey] = useState(0);
  const retryConfig = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    setZonesError(false);
    fetch("/api/zones", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("zones"))))
      .then((data: Zone[]) => {
        if (!alive) return;
        setZones(data);
      })
      // `zones` reste `null` : une liste vide signifierait « aucune zone ne
      // correspond », donc « hors zone », ce qui est faux.
      .catch(() => {
        if (!alive) return;
        setZones(null);
        setZonesError(true);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

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

  /* Créneaux réels : plus de liste codée en dur proposant le midi les jours de
   * fermeture. Rafraîchi toutes les minutes : sans ça, un onglet ouvert avant
   * l'heure d'ouverture du service reste bloqué sur « Nous sommes fermés »
   * même après l'heure d'ouverture réelle, tant que le client ne recharge pas
   * la page à la main. */
  useEffect(() => {
    let alive = true;

    const load = () => {
      fetch("/api/slots", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("slots"))))
        .then((data: SlotsResponse) => {
          if (!alive) return;
          setSlots(data);
          setSlotsError(false);
          /* Le créneau n'est **pas** réécrit ici. Cette fonction est rejouée
           * toutes les minutes : un `setSlot(data.slots[0])` inconditionnel
           * ramenait le choix du client au premier créneau de la liste à chaque
           * passage. Quelqu'un qui demandait 20:00 pendant qu'on est fermé
           * repassait silencieusement à 18:00 soixante secondes plus tard, et
           * découvrait l'horaire réel sur son email de confirmation.
           * L'effet ci-dessous s'en charge, mais seulement quand le créneau
           * retenu a réellement cessé d'être proposable. */
        })
        // `slots` reste `null` : une réponse « fermé, aucun créneau » fabriquée
        // ici annoncerait au client que le restaurant est fermé alors que c'est
        // le serveur qui n'a pas répondu.
        .catch(() => {
          if (!alive) return;
          setSlots(null);
          setSlotsError(true);
        });
    };

    load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [reloadKey]);

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

  /**
   * Adresse suffisamment renseignée pour qu'un refus ait un sens.
   *
   * `addressFilled` déclenche l'estimation dès qu'une ville est tapée — c'est
   * voulu, le retour arrive plus tôt. Mais s'en servir aussi pour **refuser**
   * annonçait « nous ne livrons pas à cette adresse » à quelqu'un qui n'avait
   * saisi qu'un début de ville, voire rien du tout quand un profil enregistré
   * pré-remplissait la ville sans le code postal. C'est le code postal qui
   * détermine la zone facturée : sans lui, on ne conclut pas.
   */
  const addressJudgeable = /^\d{5}$/.test(form.zip.trim());

  /** Emmène au champ adresse — il vit à l'étape 3, loin de ce message. */
  const focusAddress = () => {
    const field = document.getElementById("co-address");
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    field?.focus({ preventScroll: true });
  };

  /* Estimation des frais auprès du serveur : c'est lui qui mesure la distance
   * (le navigateur n'a ni la clé Google ni le barème). Même logique et mêmes
   * données que `computeOrder()`, donc l'aperçu ne peut pas diverger du montant
   * facturé. Débounce : la saisie du code postal ne doit pas déclencher un
   * appel Distance Matrix par caractère. */
  useEffect(() => {
    if (mode !== "livraison" || !addressFilled) {
      setQuote(null);
      return;
    }

    let alive = true;
    setQuoting(true);
    const timer = setTimeout(() => {
      fetch("/api/delivery-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.address,
          zip: form.zip,
          city: form.city,
          placeId,
        }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("quote"))))
        .then((data: DeliveryQuote) => alive && setQuote(data))
        // Échec silencieux : l'aperçu disparaît, le tarif reste déterminé à la
        // commande. Afficher une erreur ici ferait croire à un refus.
        .catch(() => alive && setQuote(null))
        .finally(() => alive && setQuoting(false));
    }, 500);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [mode, addressFilled, form.address, form.zip, form.city, placeId]);

  /* Hors zone : uniquement sur une réponse reçue. Le repli sur `zones` ne vaut
   * que si l'estimation n'a rien dit — sinon une adresse jugée livrable à la
   * distance serait affichée « hors zone » parce qu'aucun code postal ne
   * correspond. */
  const outOfZone =
    mode === "livraison" &&
    addressJudgeable &&
    (quote ? !quote.deliverable : !!zones && !zone && !quoting);

  const minimumCents =
    mode === "livraison" ? quote?.minimumCents ?? zone?.minimumCents ?? 0 : 0;
  // Estimation client de la livraison offerte : le seuil vient de la même
  // promotion automatique que `computeOrder()` applique côté serveur, c'est
  // donc un aperçu fidèle, pas une garantie — le total réel reste recalculé
  // à la validation.
  const freeDeliveryReached =
    freeDeliveryThresholdCents !== null && subtotalCents >= freeDeliveryThresholdCents;
  // L'estimation serveur prime sur la zone déduite localement : elle vient du
  // barème réellement appliqué (distance ou zones).
  const feeCents =
    mode === "livraison" && !freeDeliveryReached ? quote?.feeCents ?? zone?.feeCents ?? 0 : 0;
  const totalCents = subtotalCents + feeCents;
  const belowMin =
    mode === "livraison" && (!!quote?.deliverable || !!zone) && subtotalCents < minimumCents;

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

  /**
   * Ce qui empêche encore de valider, énoncé en clair.
   *
   * Le bouton se contentait d'être grisé : le client remplissait tout son
   * formulaire, ne pouvait pas payer, et rien à l'écran ne lui disait pourquoi.
   * Une case CGV non cochée, un créneau jamais choisi ou un chiffre manquant au
   * téléphone bloquaient la commande en silence — et donnaient l'impression
   * d'un site cassé plutôt que d'un champ à compléter.
   *
   * La liste sert aussi de définition unique de la validité : `valid` en
   * découle, il ne peut donc pas exister de blocage sans message correspondant.
   */
  const blockers = useMemo(() => {
    const out: string[] = [];

    const slotOk =
      slotOptions.length > 0 ? slotOptions.includes(slot) : canPreOrderNext && slot === "next";
    if (!slotOk) {
      out.push(
        !slots
          ? "Chargement des créneaux en cours…"
          : slotOptions.length === 0 && !canPreOrderNext
            ? "Aucun créneau n'est disponible pour le moment."
            : "Choisissez un créneau à l'étape 2.",
      );
    }

    if (form.name.trim().length < 2) out.push("Indiquez votre nom complet (étape 3).");
    if (!EMAIL_RE.test(form.email.trim())) out.push("Indiquez une adresse email valide (étape 3).");
    if (form.phone.replace(/\D/g, "").length < 9) {
      out.push("Indiquez un numéro de téléphone valide (étape 3).");
    }

    if (mode === "livraison") {
      if (form.address.trim().length < 5) out.push("Indiquez votre adresse de livraison (étape 3).");
      if (form.city.trim().length < 2) out.push("Indiquez votre ville (étape 3).");
      if (!/^\d{5}$/.test(form.zip.trim())) out.push("Indiquez un code postal à 5 chiffres (étape 3).");
      if (outOfZone) {
        out.push("Cette adresse est hors de notre zone de livraison — choisissez « à emporter ».");
      }
      if (belowMin) {
        out.push(
          `Il manque ${fmtPrice(minimumCents - subtotalCents)} pour atteindre le minimum de commande.`,
        );
      }
    }

    if (!cgv) out.push("Cochez l'acceptation des conditions générales de vente.");

    return out;
  }, [
    slots,
    slot,
    slotOptions,
    canPreOrderNext,
    form,
    mode,
    outOfZone,
    belowMin,
    minimumCents,
    subtotalCents,
    cgv,
  ]);

  const valid = lines.length > 0 && blockers.length === 0;

  const placeOrder = useCallback(async () => {
    if (!valid || placing) return; // garde de double soumission
    setPlacing(true);
    setError(null);

    /* Le corps ne porte **aucun montant** : ni prix unitaire, ni sous-total, ni
     * frais, ni total. Le serveur relit tout en base (`lib/pricing.ts`). C'est
     * la faille qui permettait d'encaisser un panier de 80 € à 1 centime.
     * La zone n'est pas envoyée non plus : elle est déduite du code postal. */
    const payload = {
      lines: lines.map((l) =>
        l.formulaId
          ? {
              // Ligne formule : la formule et le plat retenu par créneau. Les
              // suppléments et le prix sont recalculés en base.
              formulaId: l.formulaId,
              picks: (l.picks ?? []).map((p) => ({
                slotId: p.slotId,
                dishId: p.dishId,
                opts: p.opts,
              })),
              qty: l.qty,
              note: l.note,
            }
          : {
              dishId: l.dishId,
              qty: l.qty,
              opts: l.opts,
              formule: l.formule,
              note: l.note,
            },
      ),
      mode,
      slot,
      customer: {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        ...(mode === "livraison"
          ? {
              address: form.address.trim(),
              city: form.city.trim(),
              zip: form.zip.trim(),
              placeId,
            }
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
  }, [valid, placing, lines, mode, slot, form, placeId, promoCode, payment, user, wantsAccount]);

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
  const configError = slotsError || zonesError;
  /* Adresse retenue comme livrable, et tarif correspondant : l'estimation
   * serveur fait foi, la zone déduite localement ne sert que de repli. */
  const livrable = quote ? quote.deliverable : !!zone;
  const fraisAffiches = quote?.feeCents ?? zone?.feeCents ?? 0;
  const minimumAffiche = quote?.minimumCents ?? zone?.minimumCents ?? 0;
  // `closed` n'est vrai que sur une réponse réellement reçue : sans cette
  // garde, une panne de `/api/slots` afficherait « Nous sommes fermés ».
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

        {/* Panne serveur — jamais confondue avec « fermé » ou « hors zone » :
            le client doit savoir que le restaurant n'a rien refusé. */}
        {configError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-primary-soft p-4 text-sm text-brick"
          >
            <span className="flex items-start gap-2">
              <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
              <span>
                <strong>La commande en ligne est momentanément indisponible.</strong> Réessayez dans
                un instant, ou appelez-nous au {info.phone} — nous prenons votre commande par
                téléphone.
              </span>
            </span>
            <button
              type="button"
              onClick={retryConfig}
              className="shrink-0 rounded-full bg-brick px-4 py-1.5 font-bold text-white transition hover:brightness-105"
            >
              Réessayer
            </button>
          </div>
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
          {/* Le tarif affiché vient du serveur (`/api/delivery-quote`), qui
              applique exactement le barème utilisé pour facturer — distance
              routière si elle est configurée, zones sinon. Le client ne choisit
              jamais sa propre tranche tarifaire. */}
          {mode === "livraison" && (
            <p className="mt-4 rounded-xl bg-panel-2 p-3 text-sm text-ink-2">
              {quoting && !quote ? (
                <>Vérification de l&apos;adresse…</>
              ) : livrable ? (
                <>
                  {quote?.distanceKm != null ? (
                    <>
                      Adresse à{" "}
                      <strong className="text-ink">{formatKm(quote.distanceKm)} km</strong> par la
                      route : frais de livraison{" "}
                    </>
                  ) : (
                    <>Cette adresse est livrable : frais de livraison </>
                  )}
                  <strong className="text-ink">{fmtPrice(fraisAffiches)}</strong>
                  {freeDeliveryThresholdCents !== null && (
                    <>
                      {" "}
                      (offerts dès{" "}
                      <strong className="text-ink">{fmtPrice(freeDeliveryThresholdCents)}</strong>{" "}
                      d&apos;achat)
                    </>
                  )}
                  , minimum de commande{" "}
                  <strong className="text-ink">{fmtPrice(minimumAffiche)}</strong>.
                </>
              ) : outOfZone ? (
                // Message du serveur quand il en fournit un : il connaît la
                // distance réelle et le rayon, l'interface non.
                <>
                  {quote?.message ??
                    "Nous ne livrons pas encore à cette adresse. Vérifiez le code postal, ou choisissez « à emporter »."}{" "}
                  <button type="button" onClick={focusAddress} className="font-semibold text-primary underline">
                    Corriger l&apos;adresse
                  </button>
                </>
              ) : (
                /* Ce bloc annonçait « renseignez votre adresse ci-dessous »
                   alors que le champ se trouve deux sections plus bas, sans
                   rien pour y mener : on pouvait chercher un formulaire
                   d'adresse à l'étape 1 et conclure qu'il manquait. Le lien y
                   emmène et y place le curseur. */
                <>
                  <button type="button" onClick={focusAddress} className="font-semibold text-primary underline">
                    Renseignez votre adresse
                  </button>{" "}
                  (étape 3, plus bas) pour vérifier qu&apos;elle est livrable.
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
                  <AddressAutocomplete
                    id="co-address"
                    className={inputCls}
                    value={form.address}
                    onChange={(address) => setForm((f) => ({ ...f, address }))}
                    onPick={(picked) => setPlaceId(picked?.placeId ?? null)}
                    // Code postal et ville sont remplis depuis la suggestion :
                    // ils servent au repli par zones si Google est indisponible
                    // au moment de la commande.
                    onResolve={(parts) =>
                      setForm((f) => ({
                        ...f,
                        zip: parts.zip ?? f.zip,
                        city: parts.city ?? f.city,
                      }))
                    }
                    placeholder="Commencez à taper votre adresse…"
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
                    placeholder="Pontault-Combault"
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
          <div className="space-y-2">
            {PAYMENTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPayment(p)}
                aria-pressed={payment === p}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  payment === p ? "border-primary bg-primary-soft" : "border-line hover:border-primary/30"
                }`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                    payment === p ? "border-primary" : "border-line"
                  }`}
                  aria-hidden="true"
                >
                  {payment === p && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">{p}</span>
                  <span className="block text-xs text-ink-2">{PAYMENT_INFO[p]}</span>
                </span>
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
                  {/* Même règle que le tiroir du panier : une formule dit qu'elle
                      en est une et détaille sa composition. C'est l'écran où le
                      client vérifie avant de payer — il doit pouvoir compter ce
                      qu'il commande sans se demander si un plat est facturé deux
                      fois. */}
                  {l.formulaId ? (
                    <>
                      <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-teal">
                        Formule {l.formule} · tout compris
                      </span>
                      {Object.entries(l.opts).map(([slotLabel, choix]) => (
                        <span key={slotLabel} className="block text-xs text-ink-2">
                          › <span className="font-semibold">{slotLabel}</span> : {choix}
                        </span>
                      ))}
                    </>
                  ) : (
                    <>
                      {l.formule && <span className="block text-xs text-ink-2">{l.formule}</span>}
                      {Object.values(l.opts).length > 0 && (
                        <span className="block text-xs text-ink-2">
                          {Object.values(l.opts).join(" · ")}
                        </span>
                      )}
                    </>
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
            aria-describedby={blockers.length > 0 ? "co-blocages" : undefined}
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

          {/* Pourquoi le bouton ne répond pas. Sans cette liste, le client ne
              pouvait que constater un bouton mort et quitter le site. */}
          {!placing && blockers.length > 0 && (
            <div
              id="co-blocages"
              className="mt-3 rounded-xl border border-line bg-panel-2 p-3 text-sm"
            >
              <p className="flex items-center gap-2 font-semibold text-ink">
                <Icon name="warning" size={16} className="shrink-0 text-primary" />
                {blockers.length === 1
                  ? "Il reste une chose à compléter :"
                  : `Il reste ${blockers.length} choses à compléter :`}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-8 text-ink-2">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}

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
