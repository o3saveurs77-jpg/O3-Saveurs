/* Appel direct d'un route handler Next.js.
 *
 * Aucun serveur n'est démarré : un Route Handler est une fonction qui prend une
 * `Request` et rend une `Response`. On l'appelle donc comme telle. Ce que ça
 * vérifie réellement — et que la lecture ne vérifie pas — c'est l'enchaînement
 * garde → validation → écriture tel qu'il s'exécute.
 */

export type Methode = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Construit une requête JSON. Un corps `undefined` n'envoie aucun corps. */
export function requete(
  methode: Methode,
  url = "http://localhost:3000/api/test",
  corps?: unknown,
  entetes: Record<string, string> = {},
): Request {
  const init: RequestInit = { method: methode, headers: { ...entetes } };
  if (corps !== undefined) {
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = typeof corps === "string" ? corps : JSON.stringify(corps);
  }
  return new Request(url, init);
}

/** Corps JSON malformé : éprouve le `readJson()` des routes. */
export function requeteCorpsCasse(methode: Methode, url?: string): Request {
  return new Request(url ?? "http://localhost:3000/api/test", {
    method: methode,
    headers: { "content-type": "application/json" },
    body: "{ceci n'est pas du JSON",
  });
}

export interface Resultat<T = Record<string, unknown>> {
  status: number;
  corps: T;
}

/** Lit une réponse de route : statut + corps JSON (ou `{}` si vide). */
export async function lire<T = Record<string, unknown>>(res: Response): Promise<Resultat<T>> {
  const texte = await res.text();
  let corps: unknown = {};
  if (texte) {
    try {
      corps = JSON.parse(texte);
    } catch {
      corps = { __brut: texte };
    }
  }
  return { status: res.status, corps: corps as T };
}

/**
 * Second argument des routes dynamiques (`[id]`, `[token]`, `[dishId]`).
 * Next.js 15 le passe sous forme de promesse.
 */
export function contexte<T extends Record<string, string>>(valeurs: T): { params: Promise<T> } {
  return { params: Promise.resolve(valeurs) };
}

/**
 * Raccourci : appelle le handler et lit la réponse d'un coup.
 *
 * `C` est le type du second argument tel que le handler le déclare — une route
 * statique n'en prend aucun, une route dynamique attend `{ params }`. Le laisser
 * inférer évite une assertion de type sur chaque appel.
 */
export async function appeler<T = Record<string, unknown>, C = unknown>(
  handler: (req: Request, ctx: C) => Promise<Response> | Response,
  req: Request,
  ctx?: C,
): Promise<Resultat<T>> {
  return lire<T>(await handler(req, ctx as C));
}
