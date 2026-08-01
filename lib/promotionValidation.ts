/* Validation et description des promotions, plats du jour, annonces et
 * bannières (lots 2 et 3).
 *
 * Vit dans `lib/` et non dans les fichiers de route : Next.js n'autorise que
 * des exports connus (`GET`, `POST`, `dynamic`, …) dans un Route Handler, et un
 * export supplémentaire fait échouer la vérification de types du build
 * (CONTRIBUTING §5).
 *
 * Tout ce module est **pur** : aucune lecture de base, aucun accès réseau. Il
 * est donc importable aussi bien par les routes que par les composants
 * d'administration, et testable directement (`tests/promotions.test.ts`).
 *
 * Ce qu'il ne fait **pas** : appliquer une remise. L'éligibilité et le calcul
 * vivent dans `lib/pricing.ts` (`promotionEligible`, `promotionDiscount`) et
 * sont invoqués par `computeOrder()` au moment du paiement. Dupliquer cette
 * logique ici reviendrait à autoriser deux vérités sur le montant facturé.
 */

import { bool, err, int, isoDate, num, ok, oneOf, str, type Result } from "@/lib/validate";
import { PROMOTION_KINDS, type PromotionKind, BUDGET_CATEGORIES, type BudgetCategory } from "@/lib/types";
import { fmtCents } from "@/lib/money";
import { PARIS_TZ, WEEKDAY_LABEL } from "@/lib/hours";

// ─── Fenêtres de diffusion (commun aux 4 modèles) ──────────────

/**
 * Période de validité : les deux bornes sont facultatives, mais une fin
 * antérieure au début produirait une promotion invisible sans le moindre
 * message d'erreur.
 */
export function validateWindow(
  startsAtRaw: unknown,
  endsAtRaw: unknown,
): Result<{ startsAt: Date | null; endsAt: Date | null }> {
  const startsAt = isoDate(startsAtRaw, "La date de début");
  if (!startsAt.ok) return startsAt;
  const endsAt = isoDate(endsAtRaw, "La date de fin");
  if (!endsAt.ok) return endsAt;

  if (startsAt.value && endsAt.value && endsAt.value.getTime() <= startsAt.value.getTime()) {
    return err("La date de fin doit être postérieure à la date de début");
  }
  return ok({ startsAt: startsAt.value, endsAt: endsAt.value });
}

/** Date sans heure (« AAAA-MM-JJ »), normalisée à minuit heure de Paris. */
export function dateOnly(raw: unknown, field: string): Result<Date | null> {
  if (raw === null || raw === undefined || raw === "") return ok(null);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw).trim());
  if (!m) return err(`${field} doit être une date au format AAAA-MM-JJ`);
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return err(`${field} n'est pas une date valide`);
  return ok(d);
}

/** Entier facultatif : `null`, `undefined` et `""` valent « non renseigné ». */
function optionalInt(
  raw: unknown,
  field: string,
  bounds: { min: number; max: number },
): Result<number | null> {
  if (raw === null || raw === undefined || raw === "") return ok(null);
  const v = int(raw, field, bounds);
  if (!v.ok) return v;
  return ok(v.value);
}

/**
 * Lien sortant sûr : chemin interne (`/carte`) ou URL http(s) absolue.
 * Tout le reste est refusé — `javascript:` dans un bandeau administrable est un
 * XSS stocké offert à quiconque obtient un accès admin.
 */
export function validateLink(raw: unknown, field = "Le lien"): Result<string | null> {
  if (raw === null || raw === undefined || raw === "") return ok(null);
  if (typeof raw !== "string") return err(`${field} doit être du texte`);

  const s = raw.trim();
  if (!s) return ok(null);
  if (s.length > 500) return err(`${field} est trop long`);

  // « //exemple.com » est un lien externe déguisé en chemin interne.
  if (s.startsWith("//")) return err(`${field} doit commencer par « / » ou « https:// »`);
  if (s.startsWith("/")) return ok(s);

  try {
    const url = new URL(s);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return err(`${field} doit être une adresse http(s) ou un chemin interne`);
    }
    return ok(url.toString());
  } catch {
    return err(`${field} doit être une adresse http(s) ou un chemin interne`);
  }
}

/**
 * Image d'un encart. `next/image` refuse tout hôte absent de
 * `next.config.mjs` → `images.remotePatterns` : une URL externe ferait tomber la
 * page publique. On n'accepte donc qu'un fichier local (`/photos/…`) ou un
 * envoi Vercel Blob, les deux seules sources autorisées par la configuration.
 */
export function validateBannerImage(raw: unknown): Result<string> {
  const s = str(raw, "L'image", { min: 1, max: 500 });
  if (!s.ok) return s;

  const value = s.value;
  if (value.startsWith("//")) return err("L'image doit être un fichier local ou un envoi Vercel Blob");
  if (value.startsWith("/")) return ok(value);

  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com")) {
      return ok(url.toString());
    }
  } catch {
    /* traité ci-dessous */
  }
  return err(
    "L'image doit être un fichier du site (« /photos/… ») ou une image envoyée depuis l'administration",
  );
}

// ─── Promotions ────────────────────────────────────────────────

/** Lettres non accentuées et chiffres, 3 à 20 caractères, majuscules. */
export const PROMO_CODE_RE = /^[A-Z0-9]{3,20}$/;

/** Remise fixe maximale : au-delà, c'est une erreur de saisie, pas une promo. */
export const MAX_AMOUNT_DISCOUNT_CENTS = 500_00;

export interface PromotionInput {
  code: string | null;
  label: string;
  kind: PromotionKind;
  value: number;
  minSubtotalCents: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  oncePerCustomer: boolean;
  weekday: number | null;
  auto: boolean;
  active: boolean;
}

/** `" promo10 "` → `"PROMO10"`, `""` → `null` (promotion automatique). */
export function normalizePromoCode(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  return s === "" ? null : s;
}

/**
 * Un code est saisi à la main, souvent dicté au téléphone : on impose des
 * majuscules sans accent ni espace pour que « Été10 » ne devienne pas
 * introuvable selon le clavier du client.
 */
export function validatePromoCode(raw: unknown): Result<string | null> {
  const code = normalizePromoCode(raw);
  if (code === null) return ok(null);
  if (!PROMO_CODE_RE.test(code)) {
    return err(
      "Le code doit comporter de 3 à 20 caractères, uniquement des lettres non accentuées et des chiffres",
    );
  }
  return ok(code);
}

/** `value` n'a pas le même sens selon le type : pourcentage, centimes, ou rien. */
export function validatePromotionValue(kind: PromotionKind, raw: unknown): Result<number> {
  if (kind === "free_delivery") return ok(0);
  if (kind === "percent") return int(raw, "Le pourcentage de remise", { min: 1, max: 100 });
  return int(raw, "Le montant de la remise", { min: 1, max: MAX_AMOUNT_DISCOUNT_CENTS });
}

/**
 * Valide un corps de création ou de mise à jour complet.
 * Pour un `PATCH`, la route fusionne d'abord la ligne existante avec le corps
 * reçu : on valide toujours l'état final, jamais un fragment.
 */
export function validatePromotionInput(body: Record<string, unknown>): Result<PromotionInput> {
  const label = str(body.label, "Le libellé", { min: 3, max: 120 });
  if (!label.ok) return label;

  const kind = oneOf(body.kind, PROMOTION_KINDS, "Le type de promotion");
  if (!kind.ok) return kind;

  const value = validatePromotionValue(kind.value, body.value);
  if (!value.ok) return value;

  const code = validatePromoCode(body.code);
  if (!code.ok) return code;

  const minSubtotal = int(body.minSubtotalCents, "Le minimum de commande", {
    min: 0,
    max: 1_000_00,
    required: false,
  });
  if (!minSubtotal.ok) return minSubtotal;

  const window = validateWindow(body.startsAt, body.endsAt);
  if (!window.ok) return window;

  const maxUses = optionalInt(body.maxUses, "Le nombre maximum d'utilisations", {
    min: 1,
    max: 100_000,
  });
  if (!maxUses.ok) return maxUses;

  const weekday = optionalInt(body.weekday, "Le jour de la semaine", { min: 0, max: 6 });
  if (!weekday.ok) return weekday;

  // Par défaut : pas de code ⇒ promotion automatique.
  const auto = bool(body.auto, code.value === null);

  // `computeOrder()` cherche les promotions automatiques par `auto: true` et les
  // codes par `code`. Une ligne incohérente serait simplement inapplicable.
  if (code.value === null && !auto) {
    return err(
      "Une promotion sans code doit être automatique : ajoutez un code, ou cochez « appliquée automatiquement ».",
    );
  }
  if (code.value !== null && auto) {
    return err("Une promotion automatique ne peut pas exiger la saisie d'un code.");
  }

  // Une remise fixe supérieure au minimum de commande permet de faire tomber le
  // panier à 0 € : `promotionDiscount` borne la remise au sous-total, donc rien
  // ne devient négatif, mais la commande devient gratuite. On l'interdit à la
  // création plutôt que de le découvrir dans le chiffre d'affaires.
  if (kind.value === "amount" && value.value > minSubtotal.value) {
    return err(
      `Une remise de ${fmtCents(value.value)} exige un minimum de commande d'au moins ${fmtCents(
        value.value,
      )}, sinon la commande peut tomber à 0 €.`,
    );
  }

  return ok({
    code: code.value,
    label: label.value,
    kind: kind.value,
    value: value.value,
    minSubtotalCents: minSubtotal.value,
    startsAt: window.value.startsAt,
    endsAt: window.value.endsAt,
    maxUses: maxUses.value,
    oncePerCustomer: bool(body.oncePerCustomer, false),
    weekday: weekday.value,
    auto,
    active: bool(body.active, true),
  });
}

// ─── Description en français clair ─────────────────────────────

export interface PromotionDescribable {
  code: string | null;
  kind: PromotionKind;
  value: number;
  minSubtotalCents: number;
  startsAt: number | Date | null;
  endsAt: number | Date | null;
  maxUses: number | null;
  oncePerCustomer: boolean;
  weekday: number | null;
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: PARIS_TZ,
});

const asDate = (v: number | Date | null): Date | null =>
  v === null ? null : v instanceof Date ? v : new Date(v);

/** « 15/08/2026 » en heure de Paris, quel que soit le fuseau du serveur. */
export function fmtDay(v: number | Date | null): string {
  const d = asDate(v);
  return d ? dayFmt.format(d) : "";
}

/**
 * Rend explicite ce que fait une promotion :
 * « -15 %, à partir de 25,00 €, le mardi uniquement, sans code ».
 * Laila doit pouvoir relire sa promotion sans interpréter `kind` ni `value`.
 */
export function describePromotion(p: PromotionDescribable): string {
  const parts: string[] = [];

  if (p.kind === "percent") parts.push(`-${p.value} %`);
  else if (p.kind === "amount") parts.push(`-${fmtCents(p.value)}`);
  else parts.push("livraison offerte");

  if (p.minSubtotalCents > 0) parts.push(`à partir de ${fmtCents(p.minSubtotalCents)}`);
  if (p.weekday !== null && WEEKDAY_LABEL[p.weekday]) {
    parts.push(`le ${WEEKDAY_LABEL[p.weekday].toLowerCase()} uniquement`);
  }

  const start = asDate(p.startsAt);
  const end = asDate(p.endsAt);
  if (start && end) parts.push(`du ${fmtDay(start)} au ${fmtDay(end)}`);
  else if (start) parts.push(`à partir du ${fmtDay(start)}`);
  else if (end) parts.push(`jusqu'au ${fmtDay(end)}`);

  parts.push(p.code ? `avec le code ${p.code}` : "sans code, appliquée automatiquement");

  if (p.maxUses !== null) parts.push(`limitée à ${p.maxUses} utilisation${p.maxUses > 1 ? "s" : ""}`);
  if (p.oncePerCustomer) parts.push("une seule fois par client");

  const sentence = parts.join(", ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Utilisations restantes, `null` si la promotion est illimitée. */
export function remainingUses(p: { maxUses: number | null; usedCount: number }): number | null {
  return p.maxUses === null ? null : Math.max(0, p.maxUses - p.usedCount);
}

// ─── Plats du jour ─────────────────────────────────────────────

export interface DailySpecialInput {
  dishId: string | null;
  name: string;
  priceCents: number | null;
  weekday: number | null;
  date: Date | null;
  active: boolean;
  position: number;
}

/**
 * Un plat du jour est soit ponctuel (`date`), soit récurrent (`weekday`).
 * Les deux à la fois n'a pas de sens, aucun des deux le rendrait invisible.
 */
export function validateDailySpecialInput(
  body: Record<string, unknown>,
): Result<DailySpecialInput> {
  const name = str(body.name, "Le nom du plat", { min: 2, max: 120 });
  if (!name.ok) return name;

  const priceCents = optionalInt(body.priceCents, "Le prix", { min: 0, max: 1_000_00 });
  if (!priceCents.ok) return priceCents;

  const weekday = optionalInt(body.weekday, "Le jour de la semaine", { min: 0, max: 6 });
  if (!weekday.ok) return weekday;

  const date = dateOnly(body.date, "La date");
  if (!date.ok) return date;

  if (date.value && weekday.value !== null) {
    return err("Choisissez une date précise **ou** un jour récurrent, pas les deux.");
  }
  if (!date.value && weekday.value === null) {
    return err("Indiquez une date précise, ou un jour de la semaine pour une récurrence.");
  }

  const position = int(body.position, "La position", { min: 0, max: 999, required: false });
  if (!position.ok) return position;

  let dishId: string | null = null;
  if (body.dishId !== null && body.dishId !== undefined && body.dishId !== "") {
    const v = str(body.dishId, "Le plat", { min: 1, max: 60 });
    if (!v.ok) return v;
    dishId = v.value;
  }

  return ok({
    dishId,
    name: name.value,
    priceCents: priceCents.value,
    weekday: weekday.value,
    date: date.value,
    active: bool(body.active, true),
    position: position.value,
  });
}

export interface DailySpecialPublicView {
  id: string;
  dishId: string | null;
  name: string;
  desc: string;
  photo: string | null;
  /** prix résolu : celui du plat du jour, sinon celui du plat lié */
  priceCents: number | null;
  weekday: number | null;
  date: number | null;
  position: number;
  /** true quand l'entrée vaut pour la date du jour et non pour la récurrence */
  dated: boolean;
}

// ─── Annonces ──────────────────────────────────────────────────

export const ANNOUNCEMENT_TONES = ["info", "promo", "alerte"] as const;
export type AnnouncementTone = (typeof ANNOUNCEMENT_TONES)[number];

export const ANNOUNCEMENT_TONE_LABEL: Record<AnnouncementTone, string> = {
  info: "Information",
  promo: "Promotion",
  alerte: "Alerte",
};

export interface AnnouncementInput {
  message: string;
  link: string | null;
  tone: AnnouncementTone;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  position: number;
}

export interface AnnouncementView {
  id: string;
  message: string;
  link: string | null;
  tone: AnnouncementTone;
  startsAt: number | null;
  endsAt: number | null;
  active: boolean;
  position: number;
}

export function validateAnnouncementInput(
  body: Record<string, unknown>,
): Result<AnnouncementInput> {
  const message = str(body.message, "Le message", { min: 3, max: 200 });
  if (!message.ok) return message;

  const tone = oneOf(body.tone ?? "info", ANNOUNCEMENT_TONES, "Le ton");
  if (!tone.ok) return tone;

  const link = validateLink(body.link);
  if (!link.ok) return link;

  const window = validateWindow(body.startsAt, body.endsAt);
  if (!window.ok) return window;

  const position = int(body.position, "La position", { min: 0, max: 999, required: false });
  if (!position.ok) return position;

  return ok({
    message: message.value,
    link: link.value,
    tone: tone.value,
    startsAt: window.value.startsAt,
    endsAt: window.value.endsAt,
    active: bool(body.active, true),
    position: position.value,
  });
}

/** Ligne Prisma `Announcement` → vue sérialisable (dates en ms). */
export function rowToAnnouncement(r: {
  id: string;
  message: string;
  link: string | null;
  tone: string;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  position: number;
}): AnnouncementView {
  const tone = (ANNOUNCEMENT_TONES as readonly string[]).includes(r.tone)
    ? (r.tone as AnnouncementTone)
    : "info";
  return {
    id: r.id,
    message: r.message,
    link: r.link,
    tone,
    startsAt: r.startsAt ? r.startsAt.getTime() : null,
    endsAt: r.endsAt ? r.endsAt.getTime() : null,
    active: r.active,
    position: r.position,
  };
}

// ─── Bannières ─────────────────────────────────────────────────

export const BANNER_PLACEMENTS = ["accueil", "carte", "panier"] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export const BANNER_PLACEMENT_LABEL: Record<BannerPlacement, string> = {
  accueil: "Page d'accueil",
  carte: "Page carte",
  panier: "Panier & commande",
};

export interface BannerInput {
  title: string;
  image: string;
  link: string | null;
  placement: BannerPlacement;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  position: number;
}

export interface BannerView {
  id: string;
  title: string;
  image: string;
  link: string | null;
  placement: BannerPlacement;
  startsAt: number | null;
  endsAt: number | null;
  active: boolean;
  position: number;
  clicks: number;
}

export function validateBannerInput(body: Record<string, unknown>): Result<BannerInput> {
  const title = str(body.title, "Le titre", { min: 2, max: 120 });
  if (!title.ok) return title;

  const image = validateBannerImage(body.image);
  if (!image.ok) return image;

  const link = validateLink(body.link);
  if (!link.ok) return link;

  const placement = oneOf(body.placement ?? "accueil", BANNER_PLACEMENTS, "L'emplacement");
  if (!placement.ok) return placement;

  const window = validateWindow(body.startsAt, body.endsAt);
  if (!window.ok) return window;

  const position = int(body.position, "La position", { min: 0, max: 999, required: false });
  if (!position.ok) return position;

  return ok({
    title: title.value,
    image: image.value,
    link: link.value,
    placement: placement.value,
    startsAt: window.value.startsAt,
    endsAt: window.value.endsAt,
    active: bool(body.active, true),
    position: position.value,
  });
}

// ─── Liste de courses & budget ─────────────────────────────────

export interface BudgetItemInput {
  category: BudgetCategory;
  label: string;
  qty: number;
  unit: string;
  unitPriceCents: number;
  packaging: boolean;
  position: number;
}

export function validateBudgetItemInput(body: Record<string, unknown>): Result<BudgetItemInput> {
  const category = oneOf(body.category, BUDGET_CATEGORIES, "La catégorie");
  if (!category.ok) return category;

  const label = str(body.label, "Le nom de l'article", { min: 2, max: 120 });
  if (!label.ok) return label;

  const qty = num(body.qty, "La quantité", { min: 0.001, max: 1_000_000 });
  if (!qty.ok) return qty;

  const unit = str(body.unit, "L'unité", { max: 20, required: false });
  if (!unit.ok) return unit;

  const unitPriceCents = int(body.unitPriceCents, "Le prix unitaire", { min: 0, max: 1_000_000 });
  if (!unitPriceCents.ok) return unitPriceCents;

  const position = int(body.position, "La position", { min: 0, max: 999, required: false });
  if (!position.ok) return position;

  // Par défaut, la catégorie « emballages » est la seule exclue du coût matière
  // alimentaire ; les autres postes peuvent l'être aussi (ex. un lot de fleurs
  // de table), d'où un booléen distinct plutôt qu'un test sur la catégorie.
  const packaging = bool(body.packaging, category.value === "emballages");

  return ok({
    category: category.value,
    label: label.value,
    qty: qty.value,
    unit: unit.value,
    unitPriceCents: unitPriceCents.value,
    packaging,
    position: position.value,
  });
}

/** Ligne Prisma `Banner` → vue sérialisable (dates en ms). */
export function rowToBanner(r: {
  id: string;
  title: string;
  image: string;
  link: string | null;
  placement: string;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  position: number;
  clicks: number;
}): BannerView {
  const placement = (BANNER_PLACEMENTS as readonly string[]).includes(r.placement)
    ? (r.placement as BannerPlacement)
    : "accueil";
  return {
    id: r.id,
    title: r.title,
    image: r.image,
    link: r.link,
    placement,
    startsAt: r.startsAt ? r.startsAt.getTime() : null,
    endsAt: r.endsAt ? r.endsAt.getTime() : null,
    active: r.active,
    position: r.position,
    clicks: r.clicks,
  };
}
