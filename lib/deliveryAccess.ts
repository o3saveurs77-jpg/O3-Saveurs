/* Accès du livreur à sa tournée, et preuve de remise — règles pures.
 *
 * Le livreur n'a pas de compte : il reçoit un lien par SMS et l'ouvre sur son
 * téléphone. C'est ce qui permet de faire rouler un extra embauché le matin
 * même, sans création de compte ni mot de passe à transmettre.
 *
 * Ce choix a un prix, assumé ici : le lien donne accès aux adresses et aux
 * téléphones des clients de la tournée. Trois contreparties le rendent
 * acceptable, et elles sont toutes vérifiées dans ce module :
 *
 *  · le jeton est tiré au hasard, assez long pour ne pas se deviner ;
 *  · il expire — un lien retrouvé dans un fil de discussion un mois plus tard
 *    n'ouvre plus rien ;
 *  · le régénérer révoque l'ancien, donc un livreur qui part perd l'accès.
 *
 * Aucun accès à la base ni à `node:crypto` ici : le tirage vit dans
 * `lib/ref.ts`, ce module ne fait que décider et vérifier.
 */

/** Un lien de tournée vaut pour la journée de service, pas au-delà. */
export const RUN_ACCESS_HOURS = 16;

/** Longueur du code remis au client. Quatre chiffres se dictent au téléphone. */
export const DELIVERY_CODE_LENGTH = 4;

export interface RunAccess {
  accessToken: string | null;
  accessExpiresAt: Date | null;
}

export type AccessCheck =
  | { ok: true }
  | { ok: false; status: 404 | 410; error: string };

/**
 * Le jeton présenté ouvre-t-il encore cette tournée ?
 *
 * Distingue « inconnu » d'« expiré » : au livreur qui ouvre un vieux lien, il
 * faut dire de demander le lien du jour, pas le laisser croire à une panne.
 */
export function checkRunAccess(
  run: RunAccess | null,
  token: string,
  now: Date = new Date(),
): AccessCheck {
  if (!run || !run.accessToken || run.accessToken !== token) {
    return { ok: false, status: 404, error: "Ce lien de tournée n'existe pas ou a été remplacé." };
  }
  if (run.accessExpiresAt && run.accessExpiresAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      status: 410,
      error: "Ce lien a expiré. Demandez le lien du jour au restaurant.",
    };
  }
  return { ok: true };
}

/** Fin de validité d'un lien émis maintenant. */
export function accessExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RUN_ACCESS_HOURS * 3600_000);
}

/**
 * Le code fourni par le client correspond-il ?
 *
 * Comparaison à longueur constante : sans elle, le temps de réponse trahirait
 * le nombre de chiffres corrects. La menace est théorique sur un code remis en
 * main propre, mais la précaution ne coûte rien.
 */
export function codeMatches(expected: string | null, given: string): boolean {
  if (!expected) return false;
  const a = expected.trim();
  const b = given.trim();
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type DeliveryCheck =
  | { ok: true; withoutCode: boolean }
  | { ok: false; error: string };

/**
 * Peut-on clore cet arrêt ?
 *
 * Le code est la règle, pas un obstacle : un client qui a laissé son téléphone
 * à l'intérieur ne doit pas empêcher la tournée d'avancer. Le livreur peut
 * donc livrer sans code, à condition de dire pourquoi — la commande porte
 * alors la mention, et le restaurant sait laquelle n'a pas de preuve.
 */
export function checkDelivery(
  expected: string | null,
  given: string,
  reason: string,
): DeliveryCheck {
  const saisi = given.trim();

  if (saisi) {
    return codeMatches(expected, saisi)
      ? { ok: true, withoutCode: false }
      : { ok: false, error: "Ce code ne correspond pas. Vérifiez auprès du client." };
  }

  if (reason.trim().length < 3) {
    return {
      ok: false,
      error: "Sans le code du client, indiquez ce qui s'est passé (client absent, code oublié…).",
    };
  }

  return { ok: true, withoutCode: true };
}

/** Somme à rendre au restaurant en fin de tournée, en centimes. */
export function cashToCollect(
  stops: { paid: boolean; paymentMethod: string; totalCents: number; status: string }[],
): number {
  return stops
    .filter(
      (s) =>
        !s.paid &&
        s.status !== "annulee" &&
        s.paymentMethod.toLowerCase().includes("espèce"),
    )
    .reduce((sum, s) => sum + s.totalCents, 0);
}
