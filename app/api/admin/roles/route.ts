import { NextResponse } from "next/server";
import { requireAdmin, readJson, badRequest, conflict, serverError } from "@/lib/guard";
import {
  adminMembers,
  assignRole,
  isManagedRole,
  listAccounts,
  removeRole,
  roleIds,
} from "@/lib/auth0Admin";

export const dynamic = "force-dynamic";

/**
 * Accès et rôles — **administration uniquement**.
 *
 * Deux garde-fous, parce qu'une erreur ici enferme tout le monde dehors et que
 * seul un passage par le dashboard Auth0 permettrait alors de rentrer :
 *
 *  · on ne retire pas son propre rôle ADMIN ;
 *  · on ne retire pas le dernier ADMIN du tenant.
 *
 * Les deux sont vérifiés côté serveur, jamais seulement dans l'écran : c'est
 * la seule barrière qu'un appel direct ne contourne pas.
 */

/** GET /api/admin/roles — comptes du tenant et rôles portés. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const result = await listAccounts();
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({ accounts: result.accounts, me: guard.user.email });
}

/**
 * PATCH /api/admin/roles — donne ou retire le rôle ADMIN à un compte.
 * `{ userId, role: "ADMIN" | "CLIENT", grant: boolean }`
 */
export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<{ userId?: unknown; role?: unknown; grant?: unknown }>(req);
  if (!body) return badRequest("Requête invalide");

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) return badRequest("Compte manquant");
  if (!isManagedRole(body.role)) return badRequest("Rôle inconnu");
  if (typeof body.grant !== "boolean") return badRequest("Action manquante");

  const { role, grant } = body;

  const ids = await roleIds();
  if ("error" in ids) return NextResponse.json({ error: ids.error }, { status: 502 });

  const roleId = ids.get(role);
  if (!roleId) {
    return conflict(
      `Le rôle « ${role} » n'existe pas dans Auth0. Lancez \`npm run auth0:setup\` pour le créer.`,
    );
  }

  // ── Garde-fous sur le retrait d'ADMIN ──
  if (role === "ADMIN" && !grant) {
    const adminRoleId = ids.get("ADMIN");
    if (!adminRoleId) return conflict("Le rôle ADMIN est introuvable dans Auth0.");

    const members = await adminMembers(adminRoleId);
    if ("error" in members) {
      return NextResponse.json({ error: members.error }, { status: 502 });
    }

    if (members.userIds.length <= 1 && members.userIds.includes(userId)) {
      return conflict(
        "C'est le dernier administrateur : lui retirer le rôle fermerait le back-office à tout " +
          "le monde. Nommez d'abord quelqu'un d'autre.",
      );
    }

    /* On compare sur l'identifiant Auth0 du demandeur, pas sur l'email : deux
     * comptes peuvent partager une adresse selon la connexion utilisée. */
    const accounts = await listAccounts();
    if (!("error" in accounts)) {
      const moi = accounts.accounts.find(
        (a) => a.email.toLowerCase() === guard.user.email.toLowerCase(),
      );
      if (moi && moi.userId === userId) {
        return conflict(
          "Vous ne pouvez pas retirer votre propre accès administrateur — vous perdriez cet écran " +
            "dans la seconde. Demandez à un autre administrateur de le faire.",
        );
      }
    }
  }

  const result = grant ? await assignRole(userId, roleId) : await removeRole(userId, roleId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });

  /* Le changement ne prend effet chez la personne concernée qu'à la relecture
   * de son rôle — au plus tard cinq minutes (voir `ROLE_TTL_MS` dans
   * `auth.ts`). Le dire ici évite de croire l'écran en panne. */
  return NextResponse.json({
    ok: true,
    message: grant
      ? `Rôle ${role} attribué. La personne y aura accès sous cinq minutes, ou immédiatement en se reconnectant.`
      : `Rôle ${role} retiré. L'accès sera coupé sous cinq minutes.`,
  });
}

export function POST() {
  return serverError("Utilisez PATCH pour modifier un rôle.");
}
