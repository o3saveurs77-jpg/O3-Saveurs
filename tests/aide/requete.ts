/* Appel d'un route handler Next, depuis un test.
 *
 * Une route de l'App Router est une fonction ordinaire
 * `(req: Request, ctx) => Promise<Response>` : rien n'empêche de l'appeler
 * directement, à condition de lui fabriquer une vraie `Request` et de lui
 * passer le contexte sous la forme que Next 15 lui donne — `params` y est une
 * **promesse**, pas un objet.
 *
 * Deux détails qui font échouer les tests si on les oublie :
 *
 *  · `lib/rateLimit.ts` compte par adresse IP, lue dans `x-forwarded-for`. Sans
 *    rien, tous les appels d'un fichier tombent dans le même seau et le
 *    treizième checkout part en 429 pour une raison qui n'a rien à voir avec ce
 *    qu'on éprouvait. Chaque requête reçoit donc une IP distincte, sauf quand
 *    le test en impose une — c'est ainsi qu'on éprouve la limite elle-même ;
 *  · `/api/checkout` construit ses URL de retour depuis l'en-tête `Origin`.
 *    Il est posé par défaut pour que les assertions soient stables.
 */

/**
 * Contexte que Next 15 passe en second argument : `params` est une promesse.
 *
 * `never` et non `Record<string, string>` : une route `[id]` déclare
 * `{ params: Promise<{ id: string }> }`, et une signature d'index ne satisfait
 * pas une propriété déclarée obligatoire. Ce type-ci doit être acceptable pour
 * **toutes** les routes du dépôt, quels que soient les noms de leurs segments
 * dynamiques — c'est exactement ce que `never` garantit. Les paramètres réels
 * sont fournis par `appeler()`, qui tient la promesse.
 */
export interface ContexteRoute {
  params: Promise<never>;
}

/**
 * Signature commune aux routes, avec ou sans paramètre d'URL.
 *
 * Le contexte est un paramètre de type parce qu'une route `[id]` le déclare
 * `{ params: Promise<{ id: string }> }` : un `Record<string, string>` ne
 * satisfait pas une propriété déclarée obligatoire, et figer le type ici
 * refuserait la moitié des routes du dépôt. Il est donc **inféré** du handler
 * reçu, et `appeler()` lui fournit la forme que Next lui donnerait.
 */
export type Gestionnaire<C = ContexteRoute> = (
  req: Request,
  contexte: C,
) => Response | Promise<Response>;

export interface OptionsRequete {
  /** Par défaut « POST » dès qu'il y a un corps, « GET » sinon. */
  methode?: string;
  /** Sérialisé en JSON. */
  corps?: unknown;
  /** Corps envoyé tel quel, pour éprouver un JSON malformé. */
  corpsBrut?: string;
  entetes?: Record<string, string>;
  chemin?: string;
  query?: Record<string, string>;
  /** Paramètres de route (`[id]`), remis sous forme de promesse comme Next. */
  params?: Record<string, string>;
  /** Même IP sur plusieurs appels = même seau de limitation de débit. */
  ip?: string;
}

export interface Reponse<T> {
  statut: number;
  corps: T;
  entetes: Headers;
}

/** Forme des réponses d'erreur du dépôt, pour typer les assertions. */
export interface CorpsErreur {
  error: string;
}

export const ORIGINE = "https://o3saveurs.fr";

let compteurIp = 0;

function ipSuivante(): string {
  compteurIp += 1;
  return `10.9.${(compteurIp >> 8) & 255}.${compteurIp & 255}`;
}

/** `Request` complète : URL absolue, en-têtes, corps JSON. */
export function fabriquer(options: OptionsRequete = {}): Request {
  const url = new URL(options.chemin ?? "/api/test", ORIGINE);
  for (const [cle, valeur] of Object.entries(options.query ?? {})) {
    url.searchParams.set(cle, valeur);
  }

  const aUnCorps = options.corpsBrut !== undefined || options.corps !== undefined;

  const entetes = new Headers({
    origin: ORIGINE,
    "x-forwarded-for": options.ip ?? ipSuivante(),
    ...(aUnCorps ? { "content-type": "application/json" } : {}),
    ...options.entetes,
  });

  return new Request(url.toString(), {
    method: options.methode ?? (aUnCorps ? "POST" : "GET"),
    headers: entetes,
    body: options.corpsBrut ?? (options.corps !== undefined ? JSON.stringify(options.corps) : null),
  });
}

/**
 * Appelle le handler et rend le statut avec le corps déjà analysé.
 *
 * Le corps est lu en texte puis tenté en JSON : une route qui répond en texte
 * brut, ou sans corps du tout, ne doit pas faire tomber le test sur un
 * `SyntaxError` au lieu de montrer son statut.
 */
export async function appeler<T = unknown, C = ContexteRoute>(
  gestionnaire: Gestionnaire<C>,
  options: OptionsRequete = {},
): Promise<Reponse<T>> {
  const contexte = { params: Promise.resolve(options.params ?? {}) } as unknown as C;
  const reponse = await gestionnaire(fabriquer(options), contexte);

  const texte = await reponse.text();
  let corps: unknown = null;
  if (texte) {
    try {
      corps = JSON.parse(texte);
    } catch {
      corps = texte;
    }
  }

  return { statut: reponse.status, corps: corps as T, entetes: reponse.headers };
}
