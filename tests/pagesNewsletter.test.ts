import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import ConfirmationPage, { metadata as metaConfirmation } from "@/app/newsletter/confirmation/page";
import DesinscriptionPage, {
  metadata as metaDesinscription,
} from "@/app/newsletter/desinscription/page";
import {
  ETATS_CONFIRMATION,
  ETATS_DESINSCRIPTION,
  panneauConfirmation,
  panneauDesinscription,
  type Panneau,
} from "@/app/newsletter/etats";

/**
 * Les deux pages de newsletter, telles qu'un client de messagerie les atteint.
 *
 * `tests/newsletterEtats.test.ts` éprouve déjà la table de textes. Ce qui
 * n'avait jamais été vérifié, c'est le **câblage** : les deux pages sont des
 * composants serveur asynchrones qui doivent lire `etat` dans un `searchParams`
 * promis (Next 15) et le passer à **leur** table — pas à celle de l'autre page.
 * Une page de désinscription branchée sur `panneauConfirmation` annoncerait
 * « vous êtes inscrit(e) » à quelqu'un qui vient de s'opposer : opposition non
 * constatable, donc signalement en indésirable et obligation manquée
 * (art. L34-5 CPCE, RGPD art. 21).
 *
 * On éprouve aussi le **contrat avec les routes** : ces pages ne décrivent que
 * ce que `/api/newsletter/confirm` et `/api/newsletter/unsubscribe` émettent
 * réellement. Un état ajouté dans une route et oublié ici afficherait « ce lien
 * n'est plus valable » sur une inscription pourtant enregistrée.
 *
 * Aucune base, aucun email : ces pages ne lisent et n'écrivent rien.
 */

/** Ce qu'une page remet à `PanneauNewsletter`. */
interface ProprietesPanneau {
  kicker: string;
  panneau: Panneau;
}

type Requete = Record<string, string | string[] | undefined>;
type PageNewsletter = (args: { searchParams: Promise<Requete> }) => Promise<unknown>;

/** Ouvre la page comme Next le fait : `searchParams` arrive en promesse. */
async function ouvrir(page: PageNewsletter, query: Requete): Promise<ProprietesPanneau> {
  const element = (await page({ searchParams: Promise.resolve(query) })) as {
    props: ProprietesPanneau;
  };
  return element.props;
}

/** États littéraux écrits dans une route, dans l'ordre de lecture du fichier. */
function etatsEmisPar(chemin: string): string[] {
  const source = readFileSync(new URL(chemin, import.meta.url), "utf8");
  return [...new Set([...source.matchAll(/etat:\s*"([a-z]+)"/g)].map((m) => m[1]))];
}

/* Paramètres qu'aucune route n'émet : lien coupé par Outlook, URL tapée à la
 * main, clé mal orthographiée, valeur répétée. Tous doivent mener au repli. */
const PARAMETRES_HOSTILES: Requete[] = [
  {},
  { etat: undefined },
  { etat: "" },
  { etat: "OK" },
  { etat: "ok " },
  { etat: "succes" },
  { etat: "<script>alert(1)</script>" },
  { etat: ["ok", "invalide"] },
  { etat: ["ok"] },
  { Etat: "ok" },
  { état: "ok" },
  { token: "abc" },
  { etats: "ok" },
];

describe("page de confirmation d'inscription", () => {
  it("passe à l'affichage l'état lu dans l'URL, pour chacun de ceux que la route émet", async () => {
    for (const etat of ETATS_CONFIRMATION) {
      const { panneau } = await ouvrir(ConfirmationPage, { etat });
      expect(panneau, etat).toEqual(panneauConfirmation(etat));
    }
  });

  it("est branchée sur la table des confirmations, pas sur celle des désinscriptions", async () => {
    /* `desinscrit` n'existe que côté confirmation : si la page lisait l'autre
     * table, elle retomberait sur « nous n'avons pas pu vous désinscrire ». */
    const { panneau } = await ouvrir(ConfirmationPage, { etat: "desinscrit" });
    expect(panneau.titre).toBe(panneauConfirmation("desinscrit").titre);
    expect(panneau.titre).not.toBe(panneauDesinscription("invalide").titre);
  });

  it("n'annonce l'inscription que sur « ok »", async () => {
    const { panneau } = await ouvrir(ConfirmationPage, { etat: "ok" });
    expect(panneau.ton).toBe("ok");

    for (const etat of ETATS_CONFIRMATION.filter((e) => e !== "ok")) {
      const autre = await ouvrir(ConfirmationPage, { etat });
      expect(autre.panneau.ton, etat).not.toBe("ok");
    }
  });

  it("dit qu'aucune inscription n'a été enregistrée dès que le jeton ne vaut rien", async () => {
    // Le cas qui compte : un lien coupé en deux lignes ne doit jamais passer
    // pour un succès, sinon la personne attend des emails qui ne viendront pas.
    const repli = panneauConfirmation("invalide");

    for (const query of PARAMETRES_HOSTILES) {
      const { panneau } = await ouvrir(ConfirmationPage, query);
      const quoi = JSON.stringify(query);
      expect(panneau.titre, quoi).toBe(repli.titre);
      expect(panneau.ton, quoi).not.toBe("ok");
      expect(panneau.corps.join(" "), quoi).toMatch(/n'a donc pas été confirmée/);
      // Et une autre voie : refaire l'inscription, ou nous écrire.
      expect(panneau.formulaire, quoi).toBe(true);
      expect(panneau.contact, quoi).toBe(true);
    }
  });
});

describe("page de désinscription", () => {
  it("passe à l'affichage l'état lu dans l'URL, pour chacun de ceux que la route émet", async () => {
    for (const etat of ETATS_DESINSCRIPTION) {
      const { panneau } = await ouvrir(DesinscriptionPage, { etat });
      expect(panneau, etat).toEqual(panneauDesinscription(etat));
    }
  });

  it("est branchée sur la table des désinscriptions, pas sur celle des confirmations", async () => {
    const { panneau } = await ouvrir(DesinscriptionPage, { etat: "ok" });
    expect(panneau.titre).toBe(panneauDesinscription("ok").titre);
    expect(panneau.titre).not.toBe(panneauConfirmation("ok").titre);
    expect(panneau.corps.join(" ")).toMatch(/ne recevrez plus|prend effet immédiatement/);
  });

  it("ne confirme l'opposition que sur « ok »", async () => {
    for (const etat of ETATS_DESINSCRIPTION.filter((e) => e !== "ok")) {
      const { panneau } = await ouvrir(DesinscriptionPage, { etat });
      expect(panneau.ton, etat).not.toBe("ok");
      expect(panneau.titre, etat).not.toBe(panneauDesinscription("ok").titre);
    }
  });

  it("dit qu'aucune désinscription n'a été enregistrée, et donne une voie sans jeton", async () => {
    /* Le cas le plus sensible du module : la personne a *voulu* se désinscrire
     * et le lien n'a pas pu agir. Sans autre issue, elle clique sur
     * « indésirable » — et c'est tout le domaine d'envoi qui en paie le prix,
     * factures et confirmations de commande comprises. */
    const repli = panneauDesinscription("invalide");

    for (const query of PARAMETRES_HOSTILES) {
      const { panneau } = await ouvrir(DesinscriptionPage, query);
      const quoi = JSON.stringify(query);
      expect(panneau.titre, quoi).toBe(repli.titre);
      expect(panneau.ton, quoi).not.toBe("ok");
      expect(panneau.corps.join(" "), quoi).toMatch(/Aucune désinscription n'a été enregistrée/);
      expect(panneau.contact, quoi).toBe(true);
      expect(panneau.corps.join(" "), quoi).toMatch(/Contact/);
      // Et surtout pas le formulaire d'inscription sous le nez de quelqu'un
      // qui essaie de partir.
      expect(panneau.formulaire, quoi).toBe(false);
    }
  });

  it("distingue l'essai de campagne d'un lien cassé, sans prétendre désinscrire", async () => {
    const { panneau } = await ouvrir(DesinscriptionPage, { etat: "test" });
    expect(panneau.titre).toMatch(/test/i);
    expect(panneau.corps.join(" ")).toMatch(/aucune adresse n'a été retirée/i);
    expect(panneau.titre).not.toBe(panneauDesinscription("invalide").titre);
    expect(panneau.ton).not.toBe("ok");
  });

  it("ne redemande jamais l'adresse de quelqu'un qui vient de s'opposer", async () => {
    for (const etat of ETATS_DESINSCRIPTION) {
      const { panneau } = await ouvrir(DesinscriptionPage, { etat });
      expect(panneau.formulaire, etat).toBe(false);
    }
  });
});

describe("contrat avec les routes qui redirigent vers ces pages", () => {
  it("décrit exactement les états émis par /api/newsletter/confirm", () => {
    const emis = etatsEmisPar("../app/api/newsletter/confirm/route.ts");
    expect(emis.length).toBeGreaterThan(0);
    expect([...emis].sort()).toEqual([...ETATS_CONFIRMATION].sort());
  });

  it("décrit exactement les états émis par /api/newsletter/unsubscribe, plus l'essai", () => {
    const emis = etatsEmisPar("../app/api/newsletter/unsubscribe/route.ts");
    expect(emis.length).toBeGreaterThan(0);
    // « test » ne vient pas de la route mais du lien de l'email d'essai.
    expect([...emis, "test"].sort()).toEqual([...ETATS_DESINSCRIPTION].sort());
  });

  it("répond au lien de désinscription que l'email d'essai met dans la campagne", () => {
    const envoi = readFileSync(
      new URL("../app/api/campaigns/[id]/send/route.ts", import.meta.url),
      "utf8",
    );
    const lien = envoi.match(/\/newsletter\/desinscription\?etat=([a-z]+)/);
    expect(lien, "l'email d'essai ne pointe plus vers la page de désinscription").not.toBeNull();
    expect(ETATS_DESINSCRIPTION as readonly string[]).toContain(lien?.[1]);
  });
});

describe("en-tête des deux pages", () => {
  it("garde ces pages hors de l'index : elles sont atteintes par un lien personnel", () => {
    for (const meta of [metaConfirmation, metaDesinscription]) {
      expect(meta.robots).toMatchObject({ index: false, follow: true });
    }
  });

  it("déclare son propre canonical, sans hériter celui du layout", () => {
    // Sans canonical déclaré page par page, Next sert celui du layout : les
    // deux adresses se présenteraient alors comme l'accueil.
    expect(metaConfirmation.alternates?.canonical).toBe("/newsletter/confirmation");
    expect(metaDesinscription.alternates?.canonical).toBe("/newsletter/desinscription");
  });
});
