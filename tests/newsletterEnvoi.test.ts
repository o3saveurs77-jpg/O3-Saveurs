import { describe, it, expect } from "vitest";
import { messageEnvoi, resumeAudience } from "@/components/admin/NewsletterAdmin";

/**
 * Deux phrases décident ici de beaucoup : celle qui annonce à qui la campagne
 * va partir — lue juste avant un clic irréversible — et celle qui raconte ce
 * qui est parti. Toutes deux se vérifient sans envoyer un seul email, ce qui
 * est la seule façon acceptable de les vérifier.
 */

describe("à qui la campagne va partir", () => {
  it("annonce un compte exact pour « tous »", () => {
    const texte = resumeAudience("tous", 128);
    expect(texte).toContain("128 adresses");
    expect(texte).not.toContain("au plus");
  });

  it("dit « au plus » pour les audiences recoupées avec les commandes", () => {
    /* `reachable` compte les joignables, pas les actifs : la route croise
     * ensuite avec les commandes des 90 derniers jours. Annoncer le chiffre
     * brut, c'est promettre une portée qu'on n'a pas. */
    for (const audience of ["actifs", "inactifs"]) {
      expect(resumeAudience(audience, 128), audience).toContain("au plus 128 adresses");
    }
    expect(resumeAudience("actifs", 128)).not.toBe(resumeAudience("inactifs", 128));
  });

  it("accorde le pluriel, y compris sur une seule adresse", () => {
    expect(resumeAudience("tous", 1)).toContain("1 adresse.");
    expect(resumeAudience("tous", 0)).toContain("0 adresse.");
  });

  it("rappelle qu'une adresse désinscrite n'est jamais retenue", () => {
    expect(resumeAudience("tous", 10)).toContain("désinscrite");
  });
});

describe("ce que l'écran dit après l'envoi", () => {
  it("un envoi complet est un succès", () => {
    expect(messageEnvoi({ sentCount: 42, failedCount: 0 })).toEqual({
      tone: "ok",
      text: "42 emails envoyés.",
    });
  });

  it("un envoi partiel n'est pas un succès", () => {
    /* Les destinataires en échec n'ont rien reçu, et la campagne — déjà
     * marquée envoyée — ne peut plus être relancée. L'afficher en vert, c'est
     * exactement le mensonge qu'on corrige ailleurs dans cet écran. */
    const m = messageEnvoi({ sentCount: 40, failedCount: 2 });
    expect(m.tone).toBe("attention");
    expect(m.text).toContain("2 refusés");
    expect(m.text).toContain("rien reçu");
  });

  it("zéro envoi est un échec, et se dit comme tel", () => {
    const m = messageEnvoi({ sentCount: 0, failedCount: 12 });
    expect(m.tone).toBe("erreur");
    expect(m.text).toContain("Aucun email n'est parti");
    // La route a posé `sentAt` : une relance repartirait en 409.
    expect(m.text).toContain("nouvelle campagne");
  });

  it("un résultat illisible ne passe pas pour un succès", () => {
    // Corps de réponse vide ou tronqué : on ne sait rien, on n'annonce rien.
    expect(messageEnvoi({}).tone).toBe("erreur");
  });

  it("reprend le message de la route pour l'essai", () => {
    const m = messageEnvoi({ test: true, ok: true, message: "Email de test envoyé à laila@x.fr." });
    expect(m).toEqual({ tone: "ok", text: "Email de test envoyé à laila@x.fr." });
  });

  it("un essai refusé est une erreur, bien qu'il revienne en 200", () => {
    /* La route répond 200 avec `ok: false` quand Resend refuse le test. Pris
     * pour un succès, l'écran inviterait à relire un email jamais arrivé. */
    const m = messageEnvoi({ test: true, ok: false, message: "Le test n'a pas pu être envoyé." });
    expect(m.tone).toBe("erreur");
    expect(m.text).toBe("Le test n'a pas pu être envoyé.");
  });
});
