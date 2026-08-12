import { describe, it, expect } from "vitest";
import {
  accessExpiry,
  cashToCollect,
  checkDelivery,
  checkRunAccess,
  codeMatches,
  RUN_ACCESS_HOURS,
} from "@/lib/deliveryAccess";

/**
 * Un lien de tournée ouvre les adresses et les téléphones des clients du jour.
 * Ce qui le protège tient dans ce module : il vaut d'être vérifié.
 */

const NOW = new Date("2026-08-09T12:00:00.000Z");
const run = (over: Partial<{ accessToken: string | null; accessExpiresAt: Date | null }> = {}) => ({
  accessToken: "jeton-valide",
  accessExpiresAt: new Date(NOW.getTime() + 3600_000),
  ...over,
});

describe("accès à une tournée", () => {
  it("ouvre avec le bon jeton", () => {
    expect(checkRunAccess(run(), "jeton-valide", NOW)).toEqual({ ok: true });
  });

  it("refuse un jeton inconnu", () => {
    const r = checkRunAccess(run(), "autre-jeton", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("refuse une tournée sans jeton — le partage n'a jamais été activé", () => {
    const r = checkRunAccess(run({ accessToken: null }), "n-importe-quoi", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("refuse une tournée inexistante", () => {
    expect(checkRunAccess(null, "jeton-valide", NOW).ok).toBe(false);
  });

  it("distingue « expiré » d'« inconnu »", () => {
    /* Au livreur qui rouvre le lien d'hier, il faut dire d'en demander un
     * nouveau — pas le laisser croire à une panne du site. */
    const r = checkRunAccess(run({ accessExpiresAt: new Date(NOW.getTime() - 1) }), "jeton-valide", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(410);
      expect(r.error).toContain("expiré");
    }
  });

  it("régénérer un jeton révoque l'ancien", () => {
    // C'est ce qui coupe l'accès d'un livreur qui s'en va.
    expect(checkRunAccess(run({ accessToken: "nouveau" }), "jeton-valide", NOW).ok).toBe(false);
  });

  it("fixe l'expiration à la durée d'un service", () => {
    expect(accessExpiry(NOW).getTime() - NOW.getTime()).toBe(RUN_ACCESS_HOURS * 3600_000);
  });
});

describe("code de remise", () => {
  it("accepte le bon code", () => {
    expect(codeMatches("4821", "4821")).toBe(true);
    expect(codeMatches("4821", " 4821 ")).toBe(true);
  });

  it("refuse un mauvais code, une longueur différente, un code absent", () => {
    expect(codeMatches("4821", "4822")).toBe(false);
    expect(codeMatches("4821", "482")).toBe(false);
    expect(codeMatches(null, "4821")).toBe(false);
  });
});

describe("clôture d'un arrêt", () => {
  it("se clôt avec le code du client", () => {
    expect(checkDelivery("4821", "4821", "")).toEqual({ ok: true, withoutCode: false });
  });

  it("refuse un code erroné", () => {
    const r = checkDelivery("4821", "1111", "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ne correspond pas");
  });

  it("autorise la livraison sans code, contre une explication", () => {
    /* Un client qui a laissé son téléphone à l'intérieur ne doit pas bloquer
     * la tournée. Mais la commande gardera la mention. */
    expect(checkDelivery("4821", "", "Client sans son téléphone")).toEqual({
      ok: true,
      withoutCode: true,
    });
  });

  it("refuse de livrer sans code et sans explication", () => {
    const r = checkDelivery("4821", "", "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("indiquez");
  });

  it("refuse une explication vide de sens", () => {
    expect(checkDelivery("4821", "", "  x ").ok).toBe(false);
  });
});

describe("espèces à rendre en fin de tournée", () => {
  const stop = (over: Partial<{ paid: boolean; paymentMethod: string; totalCents: number; status: string }> = {}) => ({
    paid: false,
    paymentMethod: "Espèces sur place",
    totalCents: 2000,
    status: "route",
    ...over,
  });

  it("additionne les commandes en espèces non encaissées", () => {
    expect(cashToCollect([stop(), stop({ totalCents: 1500 })])).toBe(3500);
  });

  it("ignore ce qui est déjà payé par carte", () => {
    expect(cashToCollect([stop({ paid: true, paymentMethod: "Carte bancaire" })])).toBe(0);
  });

  it("ignore une commande en espèces déjà encaissée", () => {
    expect(cashToCollect([stop({ paid: true })])).toBe(0);
  });

  it("ignore une commande annulée", () => {
    // Elle ne sera pas livrée : compter son montant fausserait la caisse.
    expect(cashToCollect([stop({ status: "annulee" })])).toBe(0);
  });
});
