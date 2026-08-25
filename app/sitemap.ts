import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { PUBLIC_ROUTES, abs } from "@/lib/seo";

/* `/sitemap.xml` — il n'y en avait aucun.
 *
 * Un site de dix pages finit par être exploré sans plan, mais le plan apporte
 * deux choses qu'aucun maillage interne ne remplace : la date de dernière
 * modification, qui déclenche une réexploration quand la carte change, et la
 * liste explicite des pages *voulues* à l'index — ce qui, avec les canoniques,
 * ferme la porte aux variantes d'URL.
 *
 * Les dates viennent de la base : modifier un plat au back-office change la
 * date de `/carte`, et Google revient. Une date figée à l'heure de compilation
 * aurait l'effet inverse — toutes les pages « modifiées » à chaque
 * déploiement, donc plus aucun signal exploitable.
 */

// La revalidation évite de rejouer les requêtes à chaque passage de robot.
export const revalidate = 3600;

/** Date de dernière modification par page, quand la base peut la fournir. */
async function lastModified(): Promise<Record<string, Date>> {
  try {
    const [dish, formula, sections] = await Promise.all([
      prisma.dish.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
      prisma.formula.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
      prisma.pageSection.findMany({
        orderBy: { updatedAt: "desc" },
        select: { page: true, updatedAt: true },
      }),
    ]);

    const out: Record<string, Date> = {};
    if (dish) out["/carte"] = dish.updatedAt;
    if (formula) out["/formules"] = formula.updatedAt;
    /* `findMany` est trié : la première occurrence d'une page est la plus
       récente, les suivantes sont ignorées. */
    for (const s of sections) {
      const path = s.page === "accueil" ? "/" : `/${s.page}`;
      if (!(path in out)) out[path] = s.updatedAt;
    }
    return out;
  } catch {
    // Base injoignable : un plan sans dates vaut mieux qu'une 500.
    return {};
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dates = await lastModified();

  return PUBLIC_ROUTES.map((route) => ({
    url: abs(route.path),
    lastModified: dates[route.path],
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
