import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { computeOrder, stripeLineItems, type RawLine } from "@/lib/pricing";
import { reserveStock, releaseStock } from "@/lib/stock";
import { withUniqueRef } from "@/lib/ref";
import { optionalUser, readJson, badRequest, conflict, serverError } from "@/lib/guard";
import { getOpeningHours, getSlotConfig } from "@/lib/settings";
import { isSlotAcceptable, nextService, WEEKDAY_LABEL } from "@/lib/hours";
import { collect, email as vEmail, phone as vPhone, str, zip as vZip, oneOf } from "@/lib/validate";
import { hit, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";
import type { OrderMode } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  lines: RawLine[];
  mode: OrderMode;
  slot: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address?: string;
    city?: string;
    zip?: string;
  };
  promoCode?: string | null;
  paymentMethod: string;
}

const PAYMENT_METHODS = ["Carte bancaire", "Apple Pay", "Google Pay", "Espèces sur place"] as const;

/**
 * POST /api/checkout — crée la commande puis la session Stripe Checkout.
 *
 * Le corps de la requête ne porte **aucun montant** : le client dit ce qu'il
 * commande et où, le serveur relit les prix en base et calcule tout. Voir
 * `lib/pricing.ts` pour le détail, et l'audit §3.1 pour la faille que cela ferme.
 */
export async function POST(req: Request) {
  // Chaque commande déclenche des emails via Resend : sans limite, une boucle
  // suffisait à épuiser le quota et à faire blacklister le domaine expéditeur.
  const limit = hit(clientKey(req, "checkout"), LIMITS.checkout.limit, LIMITS.checkout.windowMs);
  if (!limit.ok) return tooManyRequests(limit, "Trop de commandes envoyées. Patientez un instant.");

  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  // ── Validation des entrées ──
  const fields = collect({
    name: str(body.customer?.name, "Le nom", { min: 2, max: 80 }),
    email: vEmail(body.customer?.email),
    phone: vPhone(body.customer?.phone),
    mode: oneOf(body.mode, ["livraison", "emporter"] as const, "Le mode"),
    paymentMethod: oneOf(body.paymentMethod, PAYMENT_METHODS, "Le moyen de paiement"),
    slot: str(body.slot, "Le créneau", { max: 10 }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const { name, email, phone, mode, paymentMethod, slot } = fields.value;

  let address = "";
  let city = "";
  let zip = "";
  if (mode === "livraison") {
    const addr = collect({
      address: str(body.customer?.address, "L'adresse", { min: 5, max: 200 }),
      city: str(body.customer?.city, "La ville", { min: 2, max: 80 }),
      zip: vZip(body.customer?.zip),
    });
    if (!addr.ok) return badRequest(addr.error);
    ({ address, city, zip } = addr.value);
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return badRequest("Votre panier est vide");
  }

  // ── Le restaurant est-il ouvert, et le créneau proposable ? ──
  const [hours, slotConfig] = await Promise.all([getOpeningHours(), getSlotConfig()]);
  if (!isSlotAcceptable(hours, slot, slotConfig)) {
    const next = nextService(hours);
    return conflict(
      next
        ? `Nous sommes fermés. Prochain service : ${WEEKDAY_LABEL[next.weekday]} à partir de ${next.opensAt}.`
        : "Nous sommes fermés pour le moment.",
    );
  }

  // ── Calcul serveur intégral ──
  const session = await optionalUser();
  const priced = await computeOrder({
    lines: body.lines,
    mode,
    zip,
    city,
    promoCode: body.promoCode ?? null,
    customerEmail: email,
  });
  if (!priced.ok) return conflict(priced.error);
  const order = priced.value;

  const cash = paymentMethod === "Espèces sur place";
  const stripeReady = isStripeConfigured();

  // Le repli « pas de clé Stripe donc on marque payé » ne doit jamais exister en
  // production : une clé absente rendrait toutes les commandes gratuites.
  if (!cash && !stripeReady && process.env.NODE_ENV === "production") {
    console.error("[checkout] STRIPE_SECRET_KEY absente en production — paiement refusé.");
    return NextResponse.json(
      { error: "Le paiement en ligne est momentanément indisponible." },
      { status: 503 },
    );
  }

  // Rattachement au compte connecté, s'il y en a un. Le rattachement se fait
  // sur l'identifiant, pas sur l'email saisi au checkout : un client connecté
  // qui commande avec une autre adresse retrouve quand même sa commande.
  const userId = session ? await resolveUserId(session.email) : null;

  // ── Création de la commande ──
  let created;
  try {
    created = await withUniqueRef((ref) =>
      prisma.order.create({
        data: {
          ref,
          userId,
          mode,
          // Une commande n'entre en cuisine qu'une fois le paiement acquis.
          status: cash ? "confirmee" : "en_attente_paiement",
          zoneIdx: order.zone?.idx ?? null,
          slot,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          address: mode === "livraison" ? address : null,
          city: mode === "livraison" ? city : null,
          zip: mode === "livraison" ? zip : null,
          subtotalCents: order.subtotalCents,
          discountCents: order.discountCents,
          feeCents: order.feeCents,
          totalCents: order.totalCents,
          vatRateBp: order.vatRateBp,
          promotionId: order.promotion?.id ?? null,
          promoCode: order.promotion?.code ?? null,
          paid: false,
          paymentStatus: "en_attente",
          paymentMethod,
          lines: JSON.stringify(order.lines),
          confirmedAt: cash ? new Date() : null,
        },
      }),
    );
  } catch (error) {
    console.error("[checkout] création de commande échouée:", error);
    return serverError("La commande n'a pas pu être enregistrée.");
  }

  // ── Réservation du stock ──
  const reserved = await reserveStock(order.lines, { orderId: created.id, author: null });
  if (!reserved.ok) {
    await prisma.order.delete({ where: { id: created.id } }).catch(() => {});
    const first = reserved.shortages[0];
    return conflict(
      first
        ? `« ${first.name} » n'est plus disponible en quantité suffisante (${first.available} restant).`
        : "Un plat de votre panier vient d'être épuisé.",
    );
  }

  const origin = req.headers.get("origin") || process.env.NEXTAUTH_URL || new URL(req.url).origin;

  // ── Espèces : rien à encaisser en ligne ──
  if (cash) {
    const { sendOrderConfirmation } = await import("@/lib/email");
    await sendOrderConfirmation(created);
    return NextResponse.json({ url: `${origin}/commande/${created.id}`, orderId: created.id });
  }

  // ── Mode démo (développement sans clés) ──
  if (!stripeReady) {
    const updated = await prisma.order.update({
      where: { id: created.id },
      data: { paid: true, paymentStatus: "paye", status: "confirmee", confirmedAt: new Date() },
    });
    const { sendOrderConfirmation } = await import("@/lib/email");
    await sendOrderConfirmation(updated);
    return NextResponse.json({
      url: `${origin}/commande/${created.id}?paid=1`,
      orderId: created.id,
      demo: true,
    });
  }

  // ── Session Stripe Checkout ──
  try {
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: stripeLineItems(order),
        customer_email: email,
        success_url: `${origin}/commande/${created.id}?paid=1`,
        cancel_url: `${origin}/commander?canceled=1&order=${created.id}`,
        metadata: { orderId: created.id, ref: created.ref },
        locale: "fr",
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        ...(order.discountCents > 0
          ? {
              discounts: [
                {
                  coupon: await ensureCoupon(order.discountCents),
                },
              ],
            }
          : {}),
      },
      // Rend la création réessayable sans créer deux sessions pour une commande.
      { idempotencyKey: `checkout:${created.id}` },
    );

    await prisma.order.update({
      where: { id: created.id },
      data: { stripeSessionId: checkout.id },
    });

    return NextResponse.json({ url: checkout.url, orderId: created.id });
  } catch (error) {
    console.error("[checkout] session Stripe échouée:", error);
    // La commande n'est pas supprimée : sur un timeout réseau, la session peut
    // avoir été créée chez Stripe et le client peut payer. Une commande
    // supprimée signifierait « argent encaissé, aucune trace ». On la marque et
    // on l'exclut du back-office opérationnel.
    await prisma.order
      .update({
        where: { id: created.id },
        data: { status: "annulee", paymentStatus: "echec", canceledAt: new Date() },
      })
      .catch(() => {});
    await releaseStock(order.lines, { orderId: created.id }).catch(() => {});
    return NextResponse.json({ error: "Paiement indisponible, réessayez." }, { status: 502 });
  }
}

/** Résout l'identifiant du compte connecté à partir de son email de session. */
async function resolveUserId(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return user?.id ?? null;
}

/**
 * Coupon Stripe correspondant à la remise calculée. Créé à la demande et
 * réutilisé : le montant fait partie de l'identifiant.
 */
async function ensureCoupon(discountCents: number): Promise<string> {
  const id = `remise-${discountCents}`;
  try {
    await stripe.coupons.retrieve(id);
  } catch {
    await stripe.coupons.create({
      id,
      amount_off: discountCents,
      currency: "eur",
      duration: "once",
      name: "Remise",
    });
  }
  return id;
}
