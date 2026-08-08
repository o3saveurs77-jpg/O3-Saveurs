/* Extraction du rôle depuis l'ID token Auth0.
 *
 * L'Action Post-Login pose le claim avec `api.idToken.setCustomClaim` : il est
 * donc, par construction, dans l'**ID token**. Or next-auth construit son objet
 * `profile` à partir de l'endpoint `/userinfo`, qui ne renvoie pas
 * nécessairement les claims personnalisés. Se fier au seul `profile` revenait à
 * espérer que les deux coïncident — et quand ce n'était pas le cas, tout le
 * monde se retrouvait CLIENT sans le moindre message : le trigger fonctionnait,
 * le rôle était bien assigné dans Auth0, et le back-office restait fermé.
 *
 * On lit donc le jeton là où le claim est écrit. Module **pur** : pas de
 * vérification de signature, pas d'accès réseau, et c'est volontaire — le
 * jeton vient d'être validé par next-auth lors de l'échange du code
 * d'autorisation. On ne fait qu'y relire une valeur déjà authentifiée.
 */

/** Décode la charge utile d'un JWT sans en vérifier la signature. */
export function decodeJwtPayload(token: string | undefined | null): Record<string, unknown> | null {
  if (typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    /* base64url → base64 : les jetons JWT utilisent l'alphabet URL et omettent
     * le remplissage, que `Buffer` réclame. */
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    // Jeton illisible : on ne devine pas de rôle, l'appelant retombera sur CLIENT.
    return null;
  }
}

/**
 * Rôle porté par l'ID token, ou `null` si le claim est absent.
 *
 * Accepte aussi la forme tableau (`https://…/roles`) au cas où seul ce claim-là
 * serait posé : le trigger écrit les deux, mais un tenant configuré à la main
 * peut n'en avoir qu'un.
 */
export function roleFromIdToken(
  idToken: string | undefined | null,
  claim: string,
  known: readonly string[],
): string | null {
  const payload = decodeJwtPayload(idToken);
  if (!payload) return null;

  const direct = payload[claim];
  if (typeof direct === "string") {
    const name = direct.trim().toUpperCase();
    if (known.includes(name)) return name;
  }

  const list = payload[`${claim}s`];
  if (Array.isArray(list)) {
    const names = list
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim().toUpperCase());
    return known.find((r) => names.includes(r)) ?? null;
  }

  return null;
}
