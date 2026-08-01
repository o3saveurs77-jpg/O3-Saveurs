/* Réglages du restaurant.
 *
 * Tout ce que la cliente doit pouvoir changer seule (coordonnées, informations
 * légales, taux de TVA, réseaux sociaux) vit dans la table `Setting`.
 *
 * Cloisonnement : un `GET` administrateur renvoie **tous** les réglages ; un
 * `GET` anonyme ne renvoie que les clés d'affichage. Le SIRET, le numéro de TVA
 * et le nom du médiateur figurent certes sur les pages légales, mais rien ne
 * justifie d'exposer l'intégralité de la configuration à un appel anonyme : la
 * liste blanche ci-dessous est la seule chose qui sorte publiquement.
 */

import { NextResponse } from "next/server";
import {
  SETTING_DEFAULTS,
  getSettings,
  setSettings,
  legalComplete,
  type SettingKey,
} from "@/lib/settings";
import { badRequest, optionalUser, readJson, requireAdmin, serverError } from "@/lib/guard";
import { email as emailField, int, phone as phoneField, str, zip as zipField } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Clés diffusables publiquement : coordonnées et réseaux sociaux, rien de plus. */
const PUBLIC_KEYS: readonly SettingKey[] = [
  "restaurant.name",
  "restaurant.tagline",
  "restaurant.phone",
  "restaurant.email",
  "restaurant.address",
  "restaurant.zip",
  "restaurant.city",
  "social.instagram",
  "social.snapchat",
  "social.facebook",
  "newsletter.enabled",
];

/**
 * GET /api/settings
 * · ADMIN → tous les réglages + l'état de complétude légale.
 * · public → uniquement les clés d'affichage (`PUBLIC_KEYS`).
 */
export async function GET() {
  const user = await optionalUser();

  let all;
  try {
    all = await getSettings();
  } catch {
    return serverError("Réglages indisponibles");
  }

  if (user?.role === "ADMIN") {
    return NextResponse.json({ settings: all, legalComplete: legalComplete(all) });
  }

  const publicSettings: Record<string, string> = {};
  for (const key of PUBLIC_KEYS) publicSettings[key] = all[key];
  return NextResponse.json({ settings: publicSettings });
}

/** Valide une valeur selon la clé. `null` = clé sans contrainte particulière. */
function validate(key: SettingKey, raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const asString = raw === null || raw === undefined ? "" : String(raw);
  const blank = asString.trim() === "";

  switch (key) {
    // Un champ légal vide est autorisé : c'est l'état initial, signalé par un
    // bandeau dans l'admin et un encadré sur les pages légales. Ce qui n'est pas
    // autorisé, c'est une valeur mal formée qui figurerait sur une facture.
    case "legal.siret": {
      if (blank) return { ok: true, value: "" };
      const digits = asString.replace(/\s/g, "");
      if (!/^\d{14}$/.test(digits)) {
        return { ok: false, error: "Le SIRET doit comporter exactement 14 chiffres" };
      }
      return { ok: true, value: digits };
    }

    case "legal.vatNumber": {
      if (blank) return { ok: true, value: "" };
      const compact = asString.replace(/\s/g, "").toUpperCase();
      if (!/^FR[0-9A-Z]{11}$/.test(compact)) {
        return {
          ok: false,
          error: "Le numéro de TVA doit être au format FR suivi de 11 caractères (ex. FR12345678901)",
        };
      }
      return { ok: true, value: compact };
    }

    case "restaurant.email": {
      if (blank) return { ok: false, error: "L'email de contact est requis" };
      const res = emailField(asString, "L'email de contact");
      return res.ok ? { ok: true, value: res.value } : { ok: false, error: res.error };
    }

    case "restaurant.phone": {
      const res = phoneField(asString);
      return res.ok ? { ok: true, value: asString.trim() } : { ok: false, error: res.error };
    }

    case "restaurant.zip": {
      const res = zipField(asString);
      return res.ok ? { ok: true, value: res.value } : { ok: false, error: res.error };
    }

    // Taux de TVA en points de base : 1000 = 10 %. Plafonné à 20 % — au-delà,
    // c'est une erreur de saisie (un taux en pourcentage entré tel quel).
    case "vat.rateBp": {
      const res = int(asString, "Le taux de TVA", { min: 0, max: 2000 });
      return res.ok ? { ok: true, value: String(res.value) } : { ok: false, error: res.error };
    }

    case "order.slotStepMinutes": {
      const res = int(asString, "Le pas des créneaux", { min: 5, max: 120 });
      return res.ok ? { ok: true, value: String(res.value) } : { ok: false, error: res.error };
    }

    case "order.slotCapacity": {
      const res = int(asString, "La capacité par créneau", { min: 1, max: 200 });
      return res.ok ? { ok: true, value: String(res.value) } : { ok: false, error: res.error };
    }

    case "order.leadTimeMinutes": {
      const res = int(asString, "Le délai de préparation", { min: 0, max: 240 });
      return res.ok ? { ok: true, value: String(res.value) } : { ok: false, error: res.error };
    }

    case "budget.caCents": {
      const res = int(asString, "Le chiffre d'affaires estimé", { min: 0, max: 100_000_00 });
      return res.ok ? { ok: true, value: String(res.value) } : { ok: false, error: res.error };
    }

    case "budget.days": {
      const res = int(asString, "Le nombre de jours", { min: 1, max: 365 });
      return res.ok ? { ok: true, value: String(res.value) } : { ok: false, error: res.error };
    }

    case "order.acceptCash":
    case "order.acceptCard":
    case "newsletter.enabled":
      return { ok: true, value: asString === "true" ? "true" : "false" };

    case "social.instagram":
    case "social.snapchat":
    case "social.facebook": {
      if (blank) return { ok: true, value: "" };
      const res = str(asString, "Le lien du réseau social", { max: 300 });
      if (!res.ok) return { ok: false, error: res.error };
      if (!/^https?:\/\//i.test(res.value)) {
        return { ok: false, error: "Le lien doit commencer par https://" };
      }
      return { ok: true, value: res.value };
    }

    case "restaurant.name":
    case "restaurant.address": {
      const res = str(asString, key === "restaurant.name" ? "Le nom" : "L'adresse", {
        min: 2,
        max: 200,
      });
      return res.ok ? { ok: true, value: res.value } : { ok: false, error: res.error };
    }

    // Texte libre borné : forme juridique, capital, hébergeur, médiateur…
    default: {
      const res = str(asString, "La valeur", { max: 1000, required: false });
      return res.ok ? { ok: true, value: res.value } : { ok: false, error: res.error };
    }
  }
}

/**
 * PUT /api/settings — **administration uniquement**.
 * Corps : `{ "legal.siret": "…", "vat.rateBp": "1000", … }`. Seules les clés
 * connues sont prises en compte ; les autres sont ignorées silencieusement par
 * `setSettings()`.
 */
export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Record<string, unknown>>(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("Requête invalide");
  }

  const patch: Record<string, string> = {};

  for (const [key, raw] of Object.entries(body)) {
    if (!(key in SETTING_DEFAULTS)) continue; // clé inconnue : ignorée
    const res = validate(key as SettingKey, raw);
    if (!res.ok) return badRequest(res.error);
    patch[key] = res.value;
  }

  if (Object.keys(patch).length === 0) return badRequest("Aucun réglage à enregistrer");

  try {
    await setSettings(patch);
    const all = await getSettings();
    return NextResponse.json({ settings: all, legalComplete: legalComplete(all) });
  } catch {
    return serverError("Enregistrement impossible");
  }
}
