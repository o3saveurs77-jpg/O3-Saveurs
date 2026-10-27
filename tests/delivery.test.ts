import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIERS,
  formatKm,
  haversineKm,
  maxDeliveryKm,
  outOfRangeMessage,
  sortTiers,
  tierForDistance,
  tierForTrip,
  tierLabel,
  type DeliveryTier,
} from "@/lib/delivery";

const tiers: DeliveryTier[] = [
  { idx: 0, maxKm: 3, maxMinutes: null, feeCents: 200, minimumCents: 1500 },
  { idx: 1, maxKm: 6, maxMinutes: null, feeCents: 350, minimumCents: 2000 },
  { idx: 2, maxKm: 10, maxMinutes: null, feeCents: 500, minimumCents: 2500 },
];

describe("sortTiers", () => {
  it("trie par borne croissante, quel que soit l'ordre de saisie", () => {
    const desordre = [tiers[2], tiers[0], tiers[1]];
    expect(sortTiers(desordre).map((t) => t.maxKm)).toEqual([3, 6, 10]);
  });

  it("écarte les bornes nulles, négatives ou non numériques", () => {
    const sales = [
      ...tiers,
      { idx: 3, maxKm: 0, maxMinutes: null, feeCents: 100, minimumCents: 0 },
      { idx: 4, maxKm: -5, maxMinutes: null, feeCents: 100, minimumCents: 0 },
      { idx: 5, maxKm: Number.NaN, maxMinutes: null, feeCents: 100, minimumCents: 0 },
    ];
    expect(sortTiers(sales).map((t) => t.idx)).toEqual([0, 1, 2]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const source = [tiers[2], tiers[0]];
    sortTiers(source);
    expect(source[0].maxKm).toBe(10);
  });
});

describe("tierForDistance", () => {
  it("retient le premier palier qui couvre la distance", () => {
    expect(tierForDistance(tiers, 1)!.feeCents).toBe(200);
    expect(tierForDistance(tiers, 4.5)!.feeCents).toBe(350);
    expect(tierForDistance(tiers, 8)!.feeCents).toBe(500);
  });

  it("inclut la borne haute", () => {
    expect(tierForDistance(tiers, 3)!.idx).toBe(0);
    expect(tierForDistance(tiers, 6)!.idx).toBe(1);
    expect(tierForDistance(tiers, 10)!.idx).toBe(2);
  });

  it("bascule au palier suivant juste au-dessus de la borne", () => {
    expect(tierForDistance(tiers, 3.01)!.idx).toBe(1);
  });

  it("facture le tarif court même si les paliers sont saisis dans le désordre", () => {
    // Régression : trier sur `idx` plutôt que sur `maxKm` ferait tomber une
    // course de 1 km dans le premier palier *listé*, donc au tarif le plus cher.
    const desordre = [tiers[2], tiers[1], tiers[0]];
    expect(tierForDistance(desordre, 1)!.feeCents).toBe(200);
  });

  it("refuse au-delà du dernier palier", () => {
    expect(tierForDistance(tiers, 10.1)).toBeNull();
    expect(tierForDistance(tiers, 40)).toBeNull();
  });

  it("traite le départ du restaurant comme le premier palier", () => {
    expect(tierForDistance(tiers, 0)!.idx).toBe(0);
  });

  it("ne devine aucun tarif quand la distance est inconnue", () => {
    // Le point le plus important : une distance non mesurée ne doit jamais
    // tomber sur un tarif par défaut, qui livrerait 14 km au prix de 2 km.
    expect(tierForDistance(tiers, null)).toBeNull();
    expect(tierForDistance(tiers, undefined)).toBeNull();
    expect(tierForDistance(tiers, Number.NaN)).toBeNull();
    expect(tierForDistance(tiers, -1)).toBeNull();
  });

  it("refuse tout quand aucun palier n'est défini", () => {
    expect(tierForDistance([], 2)).toBeNull();
  });
});

/* Distance et durée : chaque critère désigne son palier, on facture le plus
 * cher des deux. */
describe("tierForTrip", () => {
  const avecDuree: DeliveryTier[] = [
    { idx: 0, maxKm: 3, maxMinutes: 8, feeCents: 200, minimumCents: 1500 },
    { idx: 1, maxKm: 6, maxMinutes: 15, feeCents: 350, minimumCents: 2000 },
    { idx: 2, maxKm: 10, maxMinutes: 22, feeCents: 500, minimumCents: 2500 },
  ];
  const palier = (km: number, min: number) => {
    const r = tierForTrip(avecDuree, km, min);
    return r?.ok ? r.tier.idx : r;
  };

  it("prend le palier de la distance quand le trajet est fluide", () => {
    expect(palier(2, 5)).toBe(0);
    expect(palier(5, 12)).toBe(1);
  });

  /* 4 km de centre-ville aux heures chargées occupent le livreur autant
   * qu'une course plus longue : c'est la durée qui fixe le palier. */
  it("monte au palier de la durée quand la course est courte mais lente", () => {
    expect(palier(4, 17)).toBe(2);
    expect(palier(2, 10)).toBe(1);
  });

  it("garde le palier de la distance quand c'est lui le plus cher", () => {
    expect(palier(9, 6)).toBe(2);
  });

  it("refuse au-delà de la dernière durée, en disant que c'est la durée", () => {
    expect(palier(4, 30)).toEqual({ ok: false, over: "minutes" });
  });

  it("refuse au-delà de la dernière distance, en disant que c'est la distance", () => {
    expect(palier(12, 10)).toEqual({ ok: false, over: "km" });
  });

  it("ignore la durée pour un palier qui n'en fixe pas", () => {
    // Paliers d'avant la mesure de durée : la facturation ne change pas.
    expect(tierForTrip(tiers, 4.5, 90)).toEqual({ ok: true, tier: tiers[1] });
  });

  it("ne devine rien sur une mesure invalide", () => {
    expect(tierForTrip(avecDuree, Number.NaN, 5)).toBeNull();
    expect(tierForTrip(avecDuree, 2, -1)).toBeNull();
    expect(tierForTrip([], 2, 5)).toBeNull();
  });

  it("dit dans le refus de quelle limite il s'agit", () => {
    expect(outOfRangeMessage(avecDuree, 4, 30, { ok: false, over: "minutes" })).toContain(
      "30 min de route, au-delà de notre limite de livraison de 22 min",
    );
    expect(outOfRangeMessage(avecDuree, 12, 10, { ok: false, over: "km" })).toContain(
      "12 km, au-delà de notre rayon de livraison de 10 km",
    );
  });
});

describe("maxDeliveryKm", () => {
  it("renvoie la borne la plus lointaine", () => {
    expect(maxDeliveryKm(tiers)).toBe(10);
    expect(maxDeliveryKm([tiers[2], tiers[0]])).toBe(10);
  });

  it("renvoie null sans palier", () => {
    expect(maxDeliveryKm([])).toBeNull();
  });
});

describe("tierLabel", () => {
  it("borne chaque palier par le précédent", () => {
    expect(tierLabel(tiers, tiers[0])).toBe("0 – 3 km");
    expect(tierLabel(tiers, tiers[1])).toBe("3 – 6 km");
    expect(tierLabel(tiers, tiers[2])).toBe("6 – 10 km");
  });
});

describe("formatKm", () => {
  it("arrondit au dixième sans décimale inutile", () => {
    expect(formatKm(3)).toBe("3");
    expect(formatKm(3.04)).toBe("3");
    expect(formatKm(2.55)).toBe("2,6");
  });
});

describe("haversineKm", () => {
  const lognes = { lat: 48.8347, lng: 2.6295 };

  it("renvoie zéro pour un point sur lui-même", () => {
    expect(haversineKm(lognes, lognes)).toBeCloseTo(0, 5);
  });

  it("mesure une distance connue avec une tolérance raisonnable", () => {
    // Lognes → Notre-Dame de Paris : ~24 km à vol d'oiseau.
    const paris = { lat: 48.853, lng: 2.3499 };
    expect(haversineKm(lognes, paris)).toBeGreaterThan(19);
    expect(haversineKm(lognes, paris)).toBeLessThan(26);
  });

  it("est symétrique", () => {
    const torcy = { lat: 48.8503, lng: 2.6531 };
    expect(haversineKm(lognes, torcy)).toBeCloseTo(haversineKm(torcy, lognes), 9);
  });
});

describe("DEFAULT_TIERS", () => {
  it("forme un barème cohérent et croissant", () => {
    const sorted = sortTiers(DEFAULT_TIERS);
    expect(sorted).toHaveLength(DEFAULT_TIERS.length);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].maxKm).toBeGreaterThan(sorted[i - 1].maxKm);
      // Plus loin ne doit jamais coûter moins cher.
      expect(sorted[i].feeCents).toBeGreaterThanOrEqual(sorted[i - 1].feeCents);
    }
  });
});
