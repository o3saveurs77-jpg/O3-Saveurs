/* Validation des entrées API.
 *
 * Les corps de requête étaient jusqu'ici castés (`as Body`), ce qui n'offre
 * aucune garantie à l'exécution : un `unitPrice: -50` ou un tableau de 10 000
 * lignes passait sans bruit. Ces helpers valident et bornent réellement.
 *
 * Volontairement sans dépendance externe : le besoin est modeste et une
 * bibliothèque de plus sur la frontière de confiance ne se justifie pas ici.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = (error: string): Result<never> => ({ ok: false, error });

export function str(
  v: unknown,
  field: string,
  { min = 0, max = 500, trim = true, required = true } = {},
): Result<string> {
  if (v === undefined || v === null || v === "") {
    if (required) return err(`${field} est requis`);
    return ok("");
  }
  if (typeof v !== "string") return err(`${field} doit être du texte`);
  const s = trim ? v.trim() : v;
  if (s.length < min) return err(`${field} doit faire au moins ${min} caractères`);
  if (s.length > max) return err(`${field} ne peut pas dépasser ${max} caractères`);
  return ok(s);
}

export function int(
  v: unknown,
  field: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER, required = true } = {},
): Result<number> {
  if (v === undefined || v === null || v === "") {
    if (required) return err(`${field} est requis`);
    return ok(min);
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return err(`${field} doit être un nombre`);
  if (!Number.isInteger(n)) return err(`${field} doit être un entier`);
  if (n < min) return err(`${field} doit être au moins ${min}`);
  if (n > max) return err(`${field} ne peut pas dépasser ${max}`);
  return ok(n);
}

/** Nombre décimal borné (quantités : kg, litres… jamais de l'argent). */
export function num(
  v: unknown,
  field: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER, required = true } = {},
): Result<number> {
  if (v === undefined || v === null || v === "") {
    if (required) return err(`${field} est requis`);
    return ok(min);
  }
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return err(`${field} doit être un nombre`);
  if (n < min) return err(`${field} doit être au moins ${min}`);
  if (n > max) return err(`${field} ne peut pas dépasser ${max}`);
  return ok(n);
}

export function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return fallback;
}

/** Vérification de forme, pas de délivrabilité : on refuse ce qui ne peut pas être un email. */
export function email(v: unknown, field = "L'email"): Result<string> {
  const s = str(v, field, { max: 254 });
  if (!s.ok) return s;
  const value = s.value.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) return err(`${field} n'est pas valide`);
  return ok(value);
}

/** Téléphone français, tolérant sur les séparateurs. */
export function phone(v: unknown, { required = true } = {}): Result<string> {
  const s = str(v, "Le téléphone", { max: 25, required });
  if (!s.ok) return s;
  if (!s.value) return ok("");
  const digits = s.value.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 9) return err("Le téléphone n'est pas valide");
  return ok(digits);
}

/** Code postal français à 5 chiffres. */
export function zip(v: unknown, { required = true } = {}): Result<string> {
  const s = str(v, "Le code postal", { max: 10, required });
  if (!s.ok) return s;
  if (!s.value) return ok("");
  if (!/^\d{5}$/.test(s.value)) return err("Le code postal doit comporter 5 chiffres");
  return ok(s.value);
}

export function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  field: string,
): Result<T> {
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    return err(`${field} doit être : ${allowed.join(", ")}`);
  }
  return ok(v as T);
}

export function stringArray(
  v: unknown,
  field: string,
  { maxItems = 100, maxLen = 200 } = {},
): Result<string[]> {
  if (v === undefined || v === null) return ok([]);
  if (!Array.isArray(v)) return err(`${field} doit être une liste`);
  if (v.length > maxItems) return err(`${field} est limité à ${maxItems} entrées`);
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") return err(`${field} ne doit contenir que du texte`);
    if (item.length > maxLen) return err(`Une valeur de ${field} est trop longue`);
    out.push(item.trim());
  }
  return ok(out);
}

/** Date ISO facultative. */
export function isoDate(v: unknown, field: string): Result<Date | null> {
  if (v === undefined || v === null || v === "") return ok(null);
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return err(`${field} n'est pas une date valide`);
  return ok(d);
}

/** Échappement HTML — indispensable avant toute interpolation dans un email. */
export function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Enchaîne des validations et renvoie la première erreur.
 * `const v = collect({ name: str(b.name, "Le nom"), qty: int(b.qty, "La quantité") })`
 */
export function collect<T extends Record<string, Result<unknown>>>(
  fields: T,
): Result<{ [K in keyof T]: T[K] extends Result<infer V> ? V : never }> {
  const out: Record<string, unknown> = {};
  for (const [key, res] of Object.entries(fields)) {
    if (!res.ok) return err(res.error);
    out[key] = res.value;
  }
  return ok(out as { [K in keyof T]: T[K] extends Result<infer V> ? V : never });
}
