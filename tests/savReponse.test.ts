import { describe, it, expect } from "vitest";
import { messageReponse } from "@/components/admin/SavAdmin";

/**
 * L'écran annonçait « Réponse envoyée » dès que la route répondait 201 —
 * c'est-à-dire dès que le message était en base, alors que l'email pouvait
 * avoir été refusé par Resend. Le restaurant classait la réclamation, le client
 * n'avait jamais rien reçu, et le litige reprenait quinze jours plus tard.
 *
 * Ce qui se vérifie ici n'est donc pas une formulation mais une règle : rien ne
 * s'annonce comme envoyé sans que le serveur l'ait confirmé.
 */

describe("ce que l'écran dit après une réponse", () => {
  it("confirme l'envoi, avec l'adresse atteinte", () => {
    const m = messageReponse({ sent: true, to: "client@exemple.fr" }, "Nadia");
    expect(m.tone).toBe("ok");
    expect(m.text).toContain("client@exemple.fr");
  });

  it("dit qu'il faut rappeler quand l'email n'est pas parti", () => {
    const m = messageReponse({ sent: false, to: "client@exemple.fr" }, "Nadia");
    expect(m.tone).toBe("erreur");
    // Le message reste dans le fil : le dire évite de le retaper.
    expect(m.text).toContain("enregistrée dans le fil");
    // Et surtout : la suite à donner, nommément.
    expect(m.text).toContain("Rappelez Nadia");
  });

  it("n'invente pas d'adresse quand il n'y en a aucune", () => {
    /* Cas réel : un message du client alors que `RESTAURANT_NOTIFY_EMAIL` n'est
     * pas configuré — il n'y a personne à notifier, et rien n'est parti. */
    const m = messageReponse({ sent: false, to: null }, "Nadia");
    expect(m.tone).toBe("erreur");
    expect(m.text).not.toContain("null");
    expect(m.text).not.toContain("undefined");
  });

  it("ne promet rien quand le serveur n'a rien dit", () => {
    // Champ absent : réponse d'une version plus ancienne de la route, ou corps
    // illisible. Le doute s'affiche comme un doute, pas comme un succès.
    const m = messageReponse(undefined, "Nadia");
    expect(m.tone).toBe("attention");
    expect(m.text).toContain("Nadia");
  });
});
