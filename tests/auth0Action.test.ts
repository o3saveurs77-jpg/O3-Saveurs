import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * Trigger Auth0 « Post Login » (`auth0/actions/add-role-claim.js`).
 *
 * Ce code tourne chez Auth0, hors de toute compilation : rien ici ne le
 * vérifie au build. Or une exception non rattrapée dans une Action Post-Login
 * **fait échouer la connexion de tout le monde**, clientes comprises. D'où ces
 * tests : ils rejouent localement les cas qu'Auth0 lui enverra.
 *
 * Le fichier est chargé tel quel (CommonJS, comme l'exige le runtime Auth0),
 * sans copie ni adaptation — c'est bien l'objet déployé qu'on teste.
 */

const require_ = createRequire(import.meta.url);
const actionPath = fileURLToPath(
  new URL("../auth0/actions/add-role-claim.js", import.meta.url),
);
const { onExecutePostLogin } = require_(actionPath) as {
  onExecutePostLogin: (event: unknown, api: unknown) => Promise<void>;
};

const ROLE_CLAIM = "https://o3saveurs.fr/role";
const ROLES_CLAIM = "https://o3saveurs.fr/roles";

/** Faux `api` Auth0 : mémorise les claims posés sur chacun des deux tokens. */
function fakeApi() {
  const idToken: Record<string, unknown> = {};
  const accessToken: Record<string, unknown> = {};
  return {
    idToken: { setCustomClaim: (k: string, v: unknown) => void (idToken[k] = v) },
    accessToken: { setCustomClaim: (k: string, v: unknown) => void (accessToken[k] = v) },
    claims: idToken,
    accessClaims: accessToken,
  };
}

const userEvent = (over: Record<string, unknown> = {}) => ({
  user: { user_id: "auth0|abc", app_metadata: {} },
  authorization: { roles: [] },
  ...over,
});

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rôle depuis RBAC", () => {
  it("retient ADMIN quand il est assigné", async () => {
    const api = fakeApi();
    await onExecutePostLogin(userEvent({ authorization: { roles: ["ADMIN"] } }), api);
    expect(api.claims[ROLE_CLAIM]).toBe("ADMIN");
  });

  it("pose le claim sur le token d'identité **et** sur le token d'accès", async () => {
    // `auth.ts` lit l'un, une API tierce pourrait lire l'autre : les deux
    // doivent porter la même valeur, sans quoi les droits diffèrent selon
    // le token présenté.
    const api = fakeApi();
    await onExecutePostLogin(userEvent({ authorization: { roles: ["ADMIN"] } }), api);
    expect(api.accessClaims[ROLE_CLAIM]).toBe("ADMIN");
    expect(api.accessClaims[ROLES_CLAIM]).toEqual(["ADMIN"]);
  });

  it("retombe sur CLIENT quand aucun rôle n'est assigné", async () => {
    const api = fakeApi();
    await onExecutePostLogin(userEvent({ authorization: { roles: [] } }), api);
    expect(api.claims[ROLE_CLAIM]).toBe("CLIENT");
  });

  it("préfère ADMIN quand les deux rôles sont assignés", async () => {
    const api = fakeApi();
    await onExecutePostLogin(userEvent({ authorization: { roles: ["CLIENT", "ADMIN"] } }), api);
    expect(api.claims[ROLE_CLAIM]).toBe("ADMIN");
  });

  it("expose les rôles inconnus sans les promouvoir", async () => {
    // Ajouter « LIVREUR » dans Auth0 ne doit ni casser la connexion, ni
    // accorder quoi que ce soit tant que l'application ne le reconnaît pas.
    const api = fakeApi();
    await onExecutePostLogin(userEvent({ authorization: { roles: ["LIVREUR"] } }), api);
    expect(api.claims[ROLE_CLAIM]).toBe("CLIENT");
    expect(api.claims[ROLES_CLAIM]).toEqual(["LIVREUR"]);
  });

  it("normalise la casse et les espaces", async () => {
    const api = fakeApi();
    await onExecutePostLogin(userEvent({ authorization: { roles: [" admin "] } }), api);
    expect(api.claims[ROLE_CLAIM]).toBe("ADMIN");
  });

  it("ignore les entrées qui ne sont pas des chaînes", async () => {
    const api = fakeApi();
    await onExecutePostLogin(
      userEvent({ authorization: { roles: [null, 42, {}, "ADMIN"] } }),
      api,
    );
    expect(api.claims[ROLE_CLAIM]).toBe("ADMIN");
    expect(api.claims[ROLES_CLAIM]).toEqual(["ADMIN"]);
  });
});

describe("RBAC indisponible", () => {
  it("se rabat sur app_metadata quand `authorization` est absent", async () => {
    // Cas réel : RBAC décoché sur l'application. Sans ce filet, la gérante
    // perdait son back-office sans le moindre signe.
    const api = fakeApi();
    await onExecutePostLogin(
      { user: { user_id: "auth0|abc", app_metadata: { roles: ["ADMIN"] } } },
      api,
    );
    expect(api.claims[ROLE_CLAIM]).toBe("ADMIN");
  });

  it("journalise quand aucune source de rôles n'est consultable", async () => {
    const api = fakeApi();
    await onExecutePostLogin({ user: { user_id: "auth0|abc" } }, api);
    expect(api.claims[ROLE_CLAIM]).toBe("CLIENT");
    expect(logs.join("\n")).toContain("Aucune source de rôles");
  });

  it("ne confond pas « aucun rôle » avec « aucune information »", async () => {
    const api = fakeApi();
    await onExecutePostLogin(userEvent({ authorization: { roles: [] } }), api);
    expect(logs.join("\n")).not.toContain("Aucune source de rôles");
  });
});

describe("ne bloque jamais la connexion", () => {
  it("survit à un événement vide", async () => {
    const api = fakeApi();
    await expect(onExecutePostLogin({}, api)).resolves.toBeUndefined();
    expect(api.claims[ROLE_CLAIM]).toBe("CLIENT");
  });

  it("survit à un événement nul", async () => {
    const api = fakeApi();
    await expect(onExecutePostLogin(null, api)).resolves.toBeUndefined();
    expect(api.claims[ROLE_CLAIM]).toBe("CLIENT");
  });

  it("survit à un `api` qui lève", async () => {
    // Si poser le claim échoue, la connexion doit quand même aboutir : la
    // personne entre sans droits plutôt que de rester à la porte.
    const exploding = {
      idToken: {
        setCustomClaim: () => {
          throw new Error("panne Auth0");
        },
      },
      accessToken: { setCustomClaim: () => {} },
    };
    await expect(onExecutePostLogin(userEvent(), exploding)).resolves.toBeUndefined();
  });

  it("survit à des rôles d'un type inattendu", async () => {
    const api = fakeApi();
    await expect(
      onExecutePostLogin(userEvent({ authorization: { roles: "ADMIN" } }), api),
    ).resolves.toBeUndefined();
    // `roles` n'est pas un tableau : source inexploitable, donc CLIENT.
    expect(api.claims[ROLE_CLAIM]).toBe("CLIENT");
  });
});
