import { describe, it, expect, vi } from "vitest";

/* `lib/settings.ts` importe `lib/prisma` pour lire les réglages ; seuls
 * `SETTING_DEFAULTS` et des fonctions pures sont exercés ici, sans base. */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  invoiceHeading,
  missingLegalMentions,
  sellerFromSettings,
  sellerLegalComplete,
  settlementLine,
  type InvoiceSeller,
} from "@/lib/invoice";
import { SETTING_DEFAULTS } from "@/lib/settings";
import { rowToOrder } from "@/lib/serialize";
import { renderInvoicePdf } from "@/lib/pdf/renderInvoicePdf";
import type { Order as OrderRow } from "@prisma/client";

/**
 * Ces règles décident de ce qu'un document **affirme être**. Une pièce titrée
 * « FACTURE » sans dénomination ni SIRET est une facture irrégulière au regard
 * de l'art. 242 nonies A du CGI, et une facture émise ne se corrige pas : la
 * seule vérification possible après coup serait d'en envoyer une pour voir.
 */

const complet: InvoiceSeller = {
  name: "Ô 3 Saveurs",
  tagline: "Chez Laila",
  company: "Ô 3 SAVEURS",
  legalForm: "SARL au capital de 5 000 €",
  address: "12 rue des Lilas, 93200 Saint-Denis",
  phone: "01 02 03 04 05",
  email: "contact@o3saveurs.fr",
  siret: "123 456 789 00012",
  vatNumber: "FR12345678900012",
};

const avec = (champs: Partial<InvoiceSeller>): InvoiceSeller => ({ ...complet, ...champs });

describe("mentions obligatoires du vendeur", () => {
  it("ne relève rien sur une identité complète", () => {
    expect(missingLegalMentions(complet)).toEqual([]);
    expect(sellerLegalComplete(complet)).toBe(true);
  });

  it("relève les trois mentions sur l'état réel des réglages", () => {
    // `legal.company`, `legal.legalForm` et `legal.siret` sont vides en base.
    const vendeur = sellerFromSettings(SETTING_DEFAULTS);
    expect(missingLegalMentions(vendeur)).toHaveLength(3);
    expect(sellerLegalComplete(vendeur)).toBe(false);
  });

  it("compte une saisie d'espaces comme une mention manquante", () => {
    // « SIRET :   » sur une facture ne vaut pas mieux que pas de SIRET.
    expect(missingLegalMentions(avec({ siret: "   " }))).toEqual(["le SIRET"]);
  });

  it("n'exige pas le numéro de TVA intracommunautaire", () => {
    // Il ne s'impose pas à tout vendeur ; l'absence ne doit pas disqualifier
    // une facture par ailleurs complète.
    expect(sellerLegalComplete(avec({ vatNumber: "" }))).toBe(true);
  });
});

describe("ce que le document se présente être", () => {
  it("reste une facture quand les mentions sont réunies", () => {
    const h = invoiceHeading(complet);
    expect(h.valid).toBe(true);
    expect(h.title).toBe("FACTURE");
    expect(h.notice).toBe("");
  });

  it("devient un justificatif dès qu'une mention manque", () => {
    const h = invoiceHeading(avec({ siret: "" }));
    expect(h.valid).toBe(false);
    expect(h.title).toBe("JUSTIFICATIF DE COMMANDE");
    expect(h.title).not.toContain("FACTURE");
    expect(h.notice).toContain("ne vaut pas facture");
    expect(h.notice).toContain("242 nonies A");
    // Le client garde sa preuve d'achat : on marque, on ne refuse pas.
    expect(h.notice).toContain("atteste la commande");
  });

  it("accorde le verbe au nombre de mentions manquantes", () => {
    expect(invoiceHeading(avec({ siret: "" })).notice).toContain("le SIRET du vendeur manque");
    expect(invoiceHeading(avec({ company: "", siret: "" })).notice).toContain(
      "la dénomination sociale et le SIRET du vendeur manquent",
    );
  });

  it("applique la même règle à l'avoir", () => {
    // Un avoir porte les mêmes mentions obligatoires : le présenter comme
    // régulier serait le même faux.
    expect(invoiceHeading(complet, true).title).toBe("AVOIR");
    const h = invoiceHeading(avec({ legalForm: "" }), true);
    expect(h.title).toBe("JUSTIFICATIF DE REMBOURSEMENT");
    expect(h.notice).toContain("ne vaut pas avoir");
  });

  it("nomme le fichier selon la pièce, pas selon la séquence comptable", () => {
    expect(invoiceHeading(complet).filenamePrefix).toBe("facture");
    expect(invoiceHeading(avec({ company: "" })).filenamePrefix).toBe("justificatif");
  });
});

/* Délai relevé à 30 s : fabriquer un PDF prend ici 300 ms à vide, mais jusqu'à
 * six fois plus quand la suite tourne en entier — `@react-pdf` charge et
 * mesure ses polices, et se dispute le processeur avec la cinquantaine
 * d'autres fichiers. Le test échouait donc sur le délai par défaut de 5 s
 * uniquement en suite complète, jamais seul : un faux négatif, pas une lenteur
 * de la facture. */
describe("le PDF sort bien, marqué", { timeout: 30_000 }, () => {
  /* La page HTML et le PDF partagent le même gabarit : un bandeau ou un style
   * refusé par `@react-pdf` ne casserait pas la page mais ferait échouer la
   * route de téléchargement et l'email de facture, là où personne ne regarde. */
  const ligne =
    '[{"dishId":"d1","name":"Tcheb","photo":null,"unitPriceCents":1100,' +
    '"qty":2,"lineTotalCents":2200,"opts":{},"formule":null,"note":""}]';

  const commande = (): OrderRow => ({
    id: "o1",
    ref: "#AB12CD",
    invoiceNumber: 4,
    ticketNumber: null,
    ticketDate: null,
    userId: null,
    mode: "livraison",
    status: "livree",
    zoneIdx: 0,
    distanceKm: null,
    slot: "asap",
    preorder: false,
    scheduledFor: null,
    refusalReason: "",
    customerName: "Awa",
    customerEmail: "awa@x.fr",
    customerPhone: "0612345678",
    address: "1 rue des Lilas",
    city: "Lognes",
    zip: "77185",
    subtotalCents: 2200,
    discountCents: 0,
    feeCents: 250,
    totalCents: 2450,
    vatRateBp: 1000,
    promotionId: null,
    promoCode: null,
    paid: true,
    paymentStatus: "paye",
    paymentMethod: "Espèces à la livraison",
    refundedCents: 0,
    creditNoteNumber: null,
    refundedAt: null,
    refundReason: "",
    deliveryCode: null,
    deliveredWithoutCode: false,
    driverNote: "",
    incidentAt: null,
    cancelRequestedAt: null,
    cancelReason: "",
    stripeSessionId: null,
    stripePaymentIntentId: null,
    driverId: null,
    deliveryRunId: null,
    runPosition: null,
    lines: ligne,
    confirmedAt: new Date("2026-06-01T12:00:00.000Z"),
    cookingAt: null,
    routeAt: null,
    deliveredAt: null,
    canceledAt: null,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
  });

  it("rend le document quand les mentions manquent", async () => {
    const pdf = await renderInvoicePdf(rowToOrder(commande()), avec({ siret: "" }));
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  it("rend le document quand elles sont réunies", async () => {
    const pdf = await renderInvoicePdf(rowToOrder(commande()), complet);
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});

describe("phrase de règlement", () => {
  it("parle de facture acquittée sur une facture régulière", () => {
    const h = invoiceHeading(complet);
    expect(settlementLine(h, true)).toContain("Facture acquittée");
    expect(settlementLine(h, false)).toContain("Facture non acquittée");
  });

  it("ne parle jamais de facture sur un justificatif", () => {
    const h = invoiceHeading(avec({ siret: "" }));
    for (const paid of [true, false]) {
      expect(settlementLine(h, paid).toLowerCase()).not.toContain("facture");
    }
    expect(settlementLine(h, true)).toContain("Somme réglée");
    expect(settlementLine(h, false)).toContain("Somme non réglée");
  });
});
