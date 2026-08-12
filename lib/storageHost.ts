/* Hôte public du stockage des photos — module **pur**.
 *
 * Trois validateurs doivent savoir quelles adresses d'images accepter, et deux
 * d'entre eux tournent dans le navigateur (`PlatsAdmin`, l'éditeur de contenu).
 * D'où une variable `NEXT_PUBLIC_…` : ce n'est pas un secret, c'est un nom
 * d'hôte que tout visiteur lit déjà dans le code source des pages.
 *
 * Elle double `CELLAR_ADDON_HOST`, que Clever Cloud injecte côté serveur mais
 * qui n'est pas visible du navigateur. Les deux doivent porter la même valeur —
 * `npm run verif:prod` le contrôle avant chaque mise en ligne.
 *
 * Non renseignée, aucune adresse distante n'est acceptée : le site fonctionne
 * alors avec les seules photos livrées dans `public/`, ce qui est exactement
 * l'état d'un environnement de développement sans stockage.
 */

/** Hôte du stockage, sans protocole ni slash final. `null` si non configuré. */
export function publicStorageHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_STORAGE_HOST?.trim();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Cette adresse pointe-t-elle vers notre stockage ?
 *
 * Un sous-domaine de l'hôte configuré, en HTTPS : c'est la forme que prend une
 * URL Cellar (`https://<bucket>.<hôte>/<clé>`). Accepter n'importe quel hôte
 * afficherait un cadre vide chez le visiteur — la politique de sécurité du
 * site ne charge que celui-ci.
 */
export function isStorageUrl(value: string): boolean {
  const host = publicStorageHost();
  if (!host) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

/** Photo locale du site (`/photos/p04.jpg`), livrée avec le dépôt. */
export function isLocalPhoto(value: string): boolean {
  return /^\/[\w./-]+\.(jpe?g|png|webp|avif)$/i.test(value);
}
