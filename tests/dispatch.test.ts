import { describe, it, expect } from "vitest";
import {
  availableFor,
  checkClaim,
  isClaimable,
  MAX_COURSES_EN_COURS,
  type ClaimableOrder,
} from "@/lib/dispatch";

/**
 * En libre-service, c'est le premier qui appuie qui emporte la course. Ces
 * règles décident qui repart avec quoi — et empêchent un livreur de prendre
 * tout, ce qui laisserait les autres à vide et des clients à attendre.
 */

const course = (over: Partial<ClaimableOrder> = {}): ClaimableOrder => ({
  id: "o1",
  mode: "livraison",
  status: "confirmee",
  driverId: null,
  ...over,
});

describe("course à prendre", () => {
  it("accepte une commande confirmée sans livreur", () => {
    expect(isClaimable(course())).toBe(true);
  });

  it("accepte une commande en cuisine — le livreur s'organise pendant qu'elle cuit", () => {
    expect(isClaimable(course({ status: "cuisine" }))).toBe(true);
  });

  it("refuse une commande déjà prise", () => {
    expect(isClaimable(course({ driverId: "d1" }))).toBe(false);
  });

  it("refuse une commande à emporter — le client vient la chercher", () => {
    expect(isClaimable(course({ mode: "emporter" }))).toBe(false);
  });

  it("refuse une commande non payée, déjà partie, livrée ou annulée", () => {
    for (const status of ["en_attente_paiement", "route", "livree", "annulee"] as const) {
      expect(isClaimable(course({ status })), status).toBe(false);
    }
  });
});

describe("prise en charge", () => {
  it("autorise un livreur qui a de la place", () => {
    expect(checkClaim(course(), 0)).toEqual({ ok: true });
    expect(checkClaim(course(), MAX_COURSES_EN_COURS - 1)).toEqual({ ok: true });
  });

  it("refuse au-delà de la limite, en expliquant", () => {
    const r = checkClaim(course(), MAX_COURSES_EN_COURS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Terminez-en une");
  });

  it("dit clairement qu'un autre livreur a été plus rapide", () => {
    /* Deux livreurs appuient en même temps : celui qui perd doit comprendre
     * pourquoi la course a disparu de son écran. */
    const r = checkClaim(course({ driverId: "autre" }), 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Un autre livreur");
  });

  it("distingue une commande impayée d'une commande déjà partie", () => {
    const impayee = checkClaim(course({ status: "en_attente_paiement" }), 0);
    expect(impayee.ok).toBe(false);
    if (!impayee.ok) expect(impayee.error).toContain("pas encore payée");

    const partie = checkClaim(course({ status: "route" }), 0);
    expect(partie.ok).toBe(false);
    if (!partie.ok) expect(partie.error).toContain("plus à prendre");
  });

  it("refuse une course évaporée entre l'affichage et l'appui", () => {
    expect(checkClaim(null, 0).ok).toBe(false);
  });
});

describe("ce qu'on propose à l'écran", () => {
  it("ne montre que les courses réellement prenables", () => {
    const liste = [
      course({ id: "libre" }),
      course({ id: "prise", driverId: "d1" }),
      course({ id: "emporter", mode: "emporter" }),
      course({ id: "livree", status: "livree" }),
    ];
    expect(availableFor(liste, 0).map((o) => o.id)).toEqual(["libre"]);
  });

  it("n'en montre aucune quand la limite est atteinte", () => {
    // Inutile de faire miroiter des courses qu'on ne peut pas prendre.
    expect(availableFor([course()], MAX_COURSES_EN_COURS)).toEqual([]);
  });
});
