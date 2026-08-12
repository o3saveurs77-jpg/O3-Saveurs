import { describe, it, expect } from "vitest";
import { decodeJwtPayload, roleFromIdToken } from "@/lib/idTokenRole";

/**
 * C'est cette lecture qui décide si quelqu'un entre dans le back-office. Elle
 * est née d'une panne muette : le trigger posait bien le claim, le rôle était
 * bien assigné dans Auth0, et l'application voyait CLIENT — parce qu'elle le
 * cherchait dans `/userinfo` et non dans l'ID token.
 */

const CLAIM = "https://o3saveurs.fr/role";
const KNOWN = ["ADMIN", "CLIENT"] as const;

/** Fabrique un JWT non signé : seule la charge utile nous intéresse ici. */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.signature-non-verifiee`;
}

describe("décodage de la charge utile", () => {
  it("lit un jeton en base64url, sans remplissage", () => {
    // Le remplissage `=` est omis dans les JWT mais réclamé par Buffer :
    // l'oublier faisait échouer un jeton sur quatre, au hasard des longueurs.
    const payload = decodeJwtPayload(jwt({ sub: "auth0|abc", [CLAIM]: "ADMIN" }));
    expect(payload?.sub).toBe("auth0|abc");
  });

  it("ne lève sur aucune entrée douteuse", () => {
    expect(decodeJwtPayload(undefined)).toBeNull();
    expect(decodeJwtPayload(null)).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
    expect(decodeJwtPayload("pas.un.jwt")).toBeNull();
    expect(decodeJwtPayload("uneseulepartie")).toBeNull();
  });
});

describe("rôle porté par l'ID token", () => {
  it("lit le claim de rôle", () => {
    expect(roleFromIdToken(jwt({ [CLAIM]: "ADMIN" }), CLAIM, KNOWN)).toBe("ADMIN");
    expect(roleFromIdToken(jwt({ [CLAIM]: "CLIENT" }), CLAIM, KNOWN)).toBe("CLIENT");
  });

  it("normalise la casse", () => {
    expect(roleFromIdToken(jwt({ [CLAIM]: " admin " }), CLAIM, KNOWN)).toBe("ADMIN");
  });

  it("se rabat sur le claim tableau quand le claim simple manque", () => {
    // Un tenant configuré à la main peut n'avoir posé que « …/roles ».
    expect(roleFromIdToken(jwt({ [`${CLAIM}s`]: ["ADMIN"] }), CLAIM, KNOWN)).toBe("ADMIN");
  });

  it("préfère ADMIN quand les deux rôles figurent dans le tableau", () => {
    expect(roleFromIdToken(jwt({ [`${CLAIM}s`]: ["CLIENT", "ADMIN"] }), CLAIM, KNOWN)).toBe(
      "ADMIN",
    );
  });

  it("renvoie null quand le claim est absent", () => {
    // `null` signifie « je ne sais pas », pas « CLIENT » : c'est l'appelant qui
    // décide de la valeur par défaut, et qui journalise l'anomalie.
    expect(roleFromIdToken(jwt({ sub: "auth0|abc" }), CLAIM, KNOWN)).toBeNull();
  });

  it("ignore un rôle inconnu de l'application", () => {
    expect(roleFromIdToken(jwt({ [CLAIM]: "SUPERUSER" }), CLAIM, KNOWN)).toBeNull();
  });

  it("ignore une valeur qui n'est pas une chaîne", () => {
    expect(roleFromIdToken(jwt({ [CLAIM]: { name: "ADMIN" } }), CLAIM, KNOWN)).toBeNull();
    expect(roleFromIdToken(jwt({ [CLAIM]: 42 }), CLAIM, KNOWN)).toBeNull();
  });

  it("ne lève pas sur un jeton absent", () => {
    expect(roleFromIdToken(undefined, CLAIM, KNOWN)).toBeNull();
  });
});
