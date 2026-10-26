/**
 * Mesure de distance de livraison vérifiée (`measureDelivery`, lib/geo.ts).
 *
 * C'est elle qui choisit le palier facturé quand la livraison est réglée « à la
 * distance ». Chaque test est une façon de facturer une course au mauvais
 * palier — ou d'envoyer le livreur ailleurs que là où le tarif a été calculé.
 *
 * Aucun appel ne sort sur le réseau : `fetch` est remplacé, et répond comme le
 * feraient les API Geocoding et Distance Matrix de Google.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { measureDelivery, zipMismatchMessage } from "@/lib/geo";

/** Restaurant, Pontault-Combault. */
const ORIGINE = { lat: 48.8013, lng: 2.6075 };

interface Reponses {
  /** Résultat Geocoding (premier résultat), ou `null` pour ZERO_RESULTS. */
  lieu: {
    lat: number;
    lng: number;
    zip?: string;
    ville?: string;
    partiel?: boolean;
    precision?: string;
  } | null;
  /** Distance routière renvoyée par Distance Matrix, en mètres. */
  metres: number | null;
}

let reponses: Reponses;
let appels: string[];

beforeEach(() => {
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "cle-de-test");
  appels = [];
  vi.stubGlobal("fetch", async (url: string) => {
    appels.push(url);
    if (url.includes("/geocode/")) {
      const l = reponses.lieu;
      return Response.json(
        l
          ? {
              status: "OK",
              results: [
                {
                  partial_match: l.partiel ?? false,
                  geometry: { location: { lat: l.lat, lng: l.lng }, location_type: l.precision ?? "ROOFTOP" },
                  address_components: [
                    ...(l.zip ? [{ long_name: l.zip, types: ["postal_code"] }] : []),
                    ...(l.ville ? [{ long_name: l.ville, types: ["locality", "political"] }] : []),
                  ],
                },
              ],
            }
          : { status: "ZERO_RESULTS", results: [] },
      );
    }
    if (url.includes("/distancematrix/")) {
      return Response.json(
        reponses.metres === null
          ? { status: "OK", rows: [{ elements: [{ status: "NOT_FOUND" }] }] }
          : { status: "OK", rows: [{ elements: [{ status: "OK", distance: { value: reponses.metres } }] }] },
      );
    }
    throw new Error(`appel inattendu : ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/* Chaque test emploie une adresse et un point distincts : les caches de
 * lib/geo.ts sont propres au module (géocodage par adresse, distance par
 * coordonnées), et un résultat mémorisé par un test fausserait le suivant. */
let n = 0;
const adresse = (zip = "77340") => ({ address: `${++n} rue des Prés, ${zip} Pontault-Combault`, zip });
let k = 0;
/** Un point à ~3 km du restaurant, jamais deux fois le même. */
const ici = () => ({ lat: 48.79 + ++k / 10_000, lng: 2.63 });

describe("mesure retenue", () => {
  it("rend la distance routière quand l'adresse est reconnue et cohérente", async () => {
    reponses = { lieu: { ...ici(), zip: "77340", ville: "Pontault-Combault" }, metres: 3200 };
    expect(await measureDelivery(ORIGINE, adresse())).toEqual({ kind: "ok", km: 3.2 });
  });

  it("mesure le trajet vers le point vérifié, pas vers le texte brut", async () => {
    const point = ici();
    reponses = { lieu: { ...point, zip: "77340" }, metres: 3200 };
    await measureDelivery(ORIGINE, adresse());
    const matrice = appels.find((u) => u.includes("/distancematrix/"))!;
    expect(new URL(matrice).searchParams.get("destinations")).toBe(`${point.lat},${point.lng}`);
  });

  it("garde la suggestion choisie par le client comme destination", async () => {
    reponses = { lieu: { ...ici(), zip: "77340" }, metres: 3200 };
    await measureDelivery(ORIGINE, { placeId: `place-${++n}`, address: "x", zip: "77340" });
    const geocodage = appels.find((u) => u.includes("/geocode/"))!;
    const matrice = appels.find((u) => u.includes("/distancematrix/"))!;
    expect(new URL(geocodage).searchParams.get("place_id")).toBe(`place-${n}`);
    expect(new URL(matrice).searchParams.get("destinations")).toBe(`place_id:place-${n}`);
  });
});

describe("adresse et code postal discordants", () => {
  /* Le client a choisi « rue des Prés, Pontault » dans la liste, puis tapé
   * 77185 (Lognes) dans le code postal. Le livreur irait à Lognes, le tarif
   * serait celui de Pontault. */
  it("refuse, en donnant le code postal où se trouve réellement l'adresse", async () => {
    reponses = { lieu: { ...ici(), zip: "77340", ville: "Pontault-Combault" }, metres: 3200 };

    const m = await measureDelivery(ORIGINE, adresse("77185"));

    expect(m).toEqual({ kind: "zip_mismatch", zip: "77340", city: "Pontault-Combault" });
    expect(appels.some((u) => u.includes("/distancematrix/"))).toBe(false);
    expect(zipMismatchMessage(m as { zip: string; city: string })).toContain("77340 Pontault-Combault");
  });

  it("ne refuse pas quand Google ne donne aucun code postal", async () => {
    reponses = { lieu: { ...ici() }, metres: 3200 };
    expect((await measureDelivery(ORIGINE, adresse())).kind).toBe("ok");
  });
});

describe("mesures écartées — repli sur les zones", () => {
  /* Rue inconnue : Google renvoie le centre de la commune. La distance
   * mesurée serait celle de la mairie, pas celle du client. */
  it("écarte une saisie que Google n'a reconnue qu'en partie", async () => {
    reponses = { lieu: { ...ici(), zip: "77340", partiel: true }, metres: 3200 };
    expect(await measureDelivery(ORIGINE, adresse())).toEqual({ kind: "unknown" });
  });

  it("écarte une localisation approximative", async () => {
    reponses = { lieu: { ...ici(), zip: "77340", precision: "APPROXIMATE" }, metres: 3200 };
    expect(await measureDelivery(ORIGINE, adresse())).toEqual({ kind: "unknown" });
  });

  /* Le garde-fou existait sans être appelé : une route plus courte que le vol
   * d'oiseau est impossible, c'est un point mal placé. */
  it("écarte une distance routière plus courte que le vol d'oiseau", async () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // ~10 km à vol d'oiseau, annoncé à 2 km par la route.
    reponses = { lieu: { lat: 48.8013, lng: 2.744, zip: "77340" }, metres: 2000 };
    expect(await measureDelivery(ORIGINE, adresse())).toEqual({ kind: "unknown" });
    journal.mockRestore();
  });

  it("replie quand l'adresse est introuvable", async () => {
    reponses = { lieu: null, metres: 3200 };
    expect(await measureDelivery(ORIGINE, adresse())).toEqual({ kind: "unknown" });
  });

  it("replie quand aucun trajet n'est trouvé", async () => {
    reponses = { lieu: { ...ici(), zip: "77340" }, metres: null };
    expect(await measureDelivery(ORIGINE, adresse())).toEqual({ kind: "unknown" });
  });

  it("ne sort pas sur le réseau sans clé Google", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    reponses = { lieu: { ...ici(), zip: "77340" }, metres: 3200 };
    expect(await measureDelivery(ORIGINE, adresse())).toEqual({ kind: "unknown" });
    expect(appels).toHaveLength(0);
  });
});
