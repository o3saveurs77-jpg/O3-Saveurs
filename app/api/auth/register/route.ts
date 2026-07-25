import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rowToUser } from "@/lib/serialize";
import { readJson, badRequest } from "@/lib/guard";
import { collect, email as vEmail, str, phone as vPhone } from "@/lib/validate";
import { hit, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** 12 tours : recommandation actuelle, contre 10 auparavant. */
const BCRYPT_ROUNDS = 12;

/** bcrypt tronque silencieusement au-delà de 72 octets : autant le refuser. */
const MAX_PASSWORD_LENGTH = 72;
const MIN_PASSWORD_LENGTH = 10;

/**
 * POST /api/auth/register — création d'un compte client.
 * La connexion se fait ensuite par NextAuth (`signIn("credentials")`).
 *
 * Trois corrections : limitation de débit (la route permettait la création
 * massive de comptes), validation réelle du format de l'email et de la longueur
 * du mot de passe, et **réponse identique** que le compte existe ou non — un 409
 * explicite « Un compte existe déjà avec cet email » transformait la route en
 * outil d'énumération d'adresses.
 */
export async function POST(req: Request) {
  const limit = hit(clientKey(req, "register"), LIMITS.register.limit, LIMITS.register.windowMs);
  if (!limit.ok) return tooManyRequests(limit);

  const body = await readJson<{
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
  }>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    email: vEmail(body.email),
    password: str(body.password, "Le mot de passe", {
      min: MIN_PASSWORD_LENGTH,
      max: MAX_PASSWORD_LENGTH,
      trim: false,
    }),
    name: str(body.name, "Le nom", { max: 80, required: false }),
    phone: vPhone(body.phone, { required: false }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const { email, password, name, phone } = fields.value;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    // Réponse volontairement indiscernable d'une création réussie : la présence
    // d'une adresse dans la base n'est pas une information publique. Le vrai
    // propriétaire du compte le découvre en tentant de se connecter.
    return NextResponse.json(
      { ok: true, message: "Votre compte est prêt, vous pouvez vous connecter." },
      { status: 201 },
    );
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const row = await prisma.user.create({
    data: {
      email,
      name: name || email.split("@")[0] || "Client",
      phone,
      password: hash,
      // Le rôle est forcé : envoyer `role: "ADMIN"` dans le corps est sans effet.
      role: "CLIENT",
      favorites: "[]",
      addresses: "[]",
    },
  });

  return NextResponse.json(
    { ok: true, message: "Votre compte est prêt, vous pouvez vous connecter.", user: rowToUser(row) },
    { status: 201 },
  );
}
