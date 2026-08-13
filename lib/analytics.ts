/* Agrégations du tableau de bord — fonctions **pures**, en centimes, heure de Paris.
 *
 * Trois corrections structurelles par rapport à la version précédente (AUDIT §4.4
 * et §4.6) :
 *
 *  · **Centimes.** Les montants étaient des flottants (`o.total`) : la somme de
 *    centaines de lignes divergeait des relevés Stripe. Tout est désormais un
 *    entier de centimes (`…Cents`), formaté seulement à l'affichage.
 *
 *  · **CA commandé ≠ CA encaissé.** `kpis()` sommait toutes les commandes non
 *    annulées, payées ou non, tandis que l'écran Facturation ne gardait que
 *    `o.paid` : deux écrans voisins affichaient des chiffres contradictoires.
 *    Les deux notions sont maintenant calculées et nommées séparément partout —
 *    `orderedCents` (ce qui a été commandé) et `collectedCents` (ce qui est
 *    réellement rentré).
 *
 *  · **Heure de Paris, pas celle du navigateur.** Les tranches journalières
 *    utilisaient `Date#setHours`, donc le fuseau de la machine qui consulte, et
 *    un `DAY = 86400000` fixe qui décale les journées aux changements d'heure.
 *    Les bornes sont ici calculées en `Europe/Paris` ; l'agrégation lourde est
 *    faite côté serveur par `GET /api/stats`, ce module ne fournit que les
 *    fonctions pures qu'il utilise (et que les tests couvrent).
 */

import { PARIS_TZ, parisStartOfDay } from "./hours";
import type { Order, OrderMode, OrderStatus } from "./types";
import { ORDER_STATUSES } from "./types";
import type { LowStockDish } from "./stock";

const DAY_MS = 86_400_000;
const NOON_MS = 12 * 3_600_000;

// ─── Bornes de temps en heure de Paris ─────────────────────────

/**
 * Décalage UTC de Paris à cet instant, en ms (+2 h en été, +1 h en hiver).
 * Déduit de l'heure murale rendue par `Intl` : aucune table de fuseaux à
 * maintenir, et le passage à l'heure d'hiver est géré par la plateforme.
 */
export function parisOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  // `at` peut porter des millisecondes que l'heure murale ne restitue pas.
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * **Instant réel** de minuit à Paris pour la journée en cours.
 *
 * `parisStartOfDay()` de `lib/hours.ts` renvoie minuit **UTC** de la date
 * parisienne : c'est une clé de regroupement (elle sert de `DeliveryRun.date`),
 * pas une borne de comparaison. Utilisée telle quelle sur `createdAt`, elle
 * range les commandes de 22 h – minuit dans la journée suivante. On lui retire
 * donc le décalage de Paris, en le relisant à l'instant visé pour être juste la
 * nuit du changement d'heure.
 */
export function parisDayStart(at: Date = new Date()): Date {
  const key = parisStartOfDay(at).getTime();
  const rough = key - parisOffsetMs(at);
  return new Date(key - parisOffsetMs(new Date(rough)));
}

/** Minuit à Paris, `days` jours après (ou avant) la journée de `at`. */
export function parisShiftDays(at: Date, days: number): Date {
  // Midi UTC de la date parisienne : à ± 12 h d'écart, aucun changement
  // d'heure ne peut faire basculer la date visée.
  const noon = parisStartOfDay(at).getTime() + NOON_MS + days * DAY_MS;
  return parisDayStart(new Date(noon));
}

/** Minuit du lundi de la semaine en cours, à Paris. */
export function parisWeekStart(at: Date = new Date()): Date {
  const key = parisStartOfDay(at);
  const back = (key.getUTCDay() + 6) % 7; // lundi = 0
  return parisShiftDays(at, -back);
}

/** Minuit du 1er du mois en cours, à Paris. */
export function parisMonthStart(at: Date = new Date()): Date {
  const key = parisStartOfDay(at);
  return parisDayStart(new Date(Date.UTC(key.getUTCFullYear(), key.getUTCMonth(), 1, 12)));
}

/** Minuit du 1er du mois décalé de `months`, à Paris. */
export function parisMonthShift(at: Date, months: number): Date {
  const key = parisStartOfDay(at);
  return parisDayStart(
    new Date(Date.UTC(key.getUTCFullYear(), key.getUTCMonth() + months, 1, 12)),
  );
}

/** « 12/06 » — étiquette d'axe, en heure de Paris. */
export function parisDayLabel(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(ts));
}

/** Heure locale parisienne (0-23) d'un horodatage. */
export function parisHourOf(ts: number): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: PARIS_TZ,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(ts)),
  );
}

// ─── Sélecteurs ────────────────────────────────────────────────

/** Commandes valides : tout sauf les annulées. */
export const valid = (orders: Order[]): Order[] => orders.filter((o) => o.status !== "annulee");

/** Commandes réellement encaissées (et non annulées). */
export const collected = (orders: Order[]): Order[] => valid(orders).filter((o) => o.paid);

/**
 * Commandes qui existent **pour la comptabilité** : celles qui ont donné lieu à
 * une facture.
 *
 * Le critère n'est pas « non annulée » mais « facturée », et la différence
 * n'est pas théorique. Une facture émise ne se modifie ni ne s'efface (art. 242
 * nonies A CGI) : rembourser produit un avoir, une pièce distincte, pas la
 * disparition de la vente. Une commande annulée après facturation — un plat sur
 * commande refusé par le restaurant, typiquement — doit donc rester au journal,
 * compensée par son avoir. L'écarter creuserait dans la numérotation un trou
 * que rien n'expliquerait devant un contrôle.
 *
 * `collected` reste le bon filtre pour le pilotage (« qu'ai-je vendu ? ») ;
 * celui-ci est le bon pour la déclaration (« qu'ai-je facturé ? »).
 */
export const invoiced = (orders: Order[]): Order[] =>
  orders.filter((o) => o.paid && o.invoiceNumber !== null);

/**
 * Montant réellement acquis sur une commande : facturé moins ce qui a été rendu.
 *
 * C'est cette base-là qui porte la TVA collectée. La ventiler sur `totalCents`
 * fait déclarer — et payer — la taxe sur des sommes rendues au client.
 */
export const netCollectedCents = (o: Order): number =>
  Math.max(0, o.totalCents - o.refundedCents);

/** Commandes créées dans `[start, end)`. */
export const inRange = (orders: Order[], start: number, end: number): Order[] =>
  orders.filter((o) => o.createdAt >= start && o.createdAt < end);

const sum = (orders: Order[]) => orders.reduce((s, o) => s + o.totalCents, 0);

/** **CA commandé** : total des commandes non annulées, payées ou non. */
export const orderedCents = (orders: Order[]): number => sum(valid(orders));

/** **CA encaissé** : total des commandes non annulées et payées. */
export const collectedCents = (orders: Order[]): number => sum(collected(orders));

/** Reste à encaisser : commandé moins encaissé. */
export const pendingCents = (orders: Order[]): number =>
  sum(valid(orders).filter((o) => !o.paid));

// ─── Indicateurs de période ────────────────────────────────────

export interface PeriodStats {
  /** bornes en ms, `[start, end)` */
  start: number;
  end: number;
  /** commandes valides (annulées exclues) */
  orders: number;
  canceled: number;
  /** annulées / (valides + annulées), en % */
  cancelRatePct: number;
  /** CA commandé — non annulées, payées ou non */
  orderedCents: number;
  /** CA encaissé — non annulées et payées */
  collectedCents: number;
  /** reste à encaisser sur la période */
  pendingCents: number;
  /** panier moyen sur le CA commandé */
  avgBasketCents: number;
}

export function periodStats(orders: Order[], start: number, end: number): PeriodStats {
  const all = inRange(orders, start, end);
  const ok = valid(all);
  const ko = all.length - ok.length;
  const ordered = sum(ok);
  return {
    start,
    end,
    orders: ok.length,
    canceled: ko,
    cancelRatePct: all.length ? Math.round((ko / all.length) * 1000) / 10 : 0,
    orderedCents: ordered,
    collectedCents: sum(ok.filter((o) => o.paid)),
    pendingCents: sum(ok.filter((o) => !o.paid)),
    avgBasketCents: ok.length ? Math.round(ordered / ok.length) : 0,
  };
}

/**
 * Variation en %, `null` quand la référence est nulle : afficher « +100 % »
 * parce qu'on est passé de 0 à 1 commande n'informe personne, et « 0 % »
 * serait un mensonge.
 */
export function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export interface PeriodComparison {
  /** « Aujourd'hui », « Cette semaine », « Ce mois-ci » */
  label: string;
  /** « hier », « semaine précédente », « mois précédent » */
  previousLabel: string;
  current: PeriodStats;
  previous: PeriodStats;
  orderedTrendPct: number | null;
  collectedTrendPct: number | null;
  ordersTrendPct: number | null;
}

export function comparePeriod(
  orders: Order[],
  label: string,
  previousLabel: string,
  bounds: { start: number; end: number; prevStart: number; prevEnd: number },
): PeriodComparison {
  const current = periodStats(orders, bounds.start, bounds.end);
  const previous = periodStats(orders, bounds.prevStart, bounds.prevEnd);
  return {
    label,
    previousLabel,
    current,
    previous,
    orderedTrendPct: trendPct(current.orderedCents, previous.orderedCents),
    collectedTrendPct: trendPct(current.collectedCents, previous.collectedCents),
    ordersTrendPct: trendPct(current.orders, previous.orders),
  };
}

/** Jour / semaine / mois et la période précédente équivalente, en heure de Paris. */
export function parisPeriodBounds(now: Date = new Date()) {
  const dayStart = parisDayStart(now).getTime();
  const weekStart = parisWeekStart(now).getTime();
  const monthStart = parisMonthStart(now).getTime();
  const end = now.getTime() + 1; // borne haute inclusive de l'instant courant

  return {
    day: {
      start: dayStart,
      end,
      prevStart: parisShiftDays(now, -1).getTime(),
      prevEnd: dayStart,
    },
    week: {
      start: weekStart,
      end,
      prevStart: parisShiftDays(new Date(weekStart + NOON_MS), -7).getTime(),
      prevEnd: weekStart,
    },
    month: {
      start: monthStart,
      end,
      prevStart: parisMonthShift(now, -1).getTime(),
      prevEnd: monthStart,
    },
  };
}

// ─── Séries et répartitions ────────────────────────────────────

export interface DayPoint {
  /** « 12/06 » */
  day: string;
  /** minuit à Paris, en ms */
  ts: number;
  orderedCents: number;
  collectedCents: number;
  orders: number;
}

/** CA commandé, CA encaissé et nombre de commandes par journée parisienne. */
export function revenueByDay(orders: Order[], now: Date | number, days = 14): DayPoint[] {
  const at = typeof now === "number" ? new Date(now) : now;
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = parisShiftDays(at, -i).getTime();
    const end = parisShiftDays(at, -i + 1).getTime();
    const slice = inRange(orders, start, end);
    const ok = valid(slice);
    out.push({
      day: parisDayLabel(start),
      ts: start,
      orderedCents: sum(ok),
      collectedCents: sum(ok.filter((o) => o.paid)),
      orders: ok.length,
    });
  }
  return out;
}

/** Compte par statut, tous les statuts présents (zéros compris, ordre du flux). */
export function ordersByStatus(orders: Order[]): Record<OrderStatus, number> {
  const out = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
    OrderStatus,
    number
  >;
  for (const o of orders) out[o.status] += 1;
  return out;
}

export interface ModeSplit {
  mode: OrderMode;
  orders: number;
  orderedCents: number;
  sharePct: number;
}

/** Répartition livraison / emporter sur les commandes valides. */
export function modeSplit(orders: Order[]): ModeSplit[] {
  const ok = valid(orders);
  const modes: OrderMode[] = ["livraison", "emporter"];
  return modes.map((mode) => {
    const slice = ok.filter((o) => o.mode === mode);
    return {
      mode,
      orders: slice.length,
      orderedCents: sum(slice),
      sharePct: ok.length ? Math.round((slice.length / ok.length) * 1000) / 10 : 0,
    };
  });
}

export interface ZoneSplit {
  /** null = commande à emporter, sans zone */
  zoneIdx: number | null;
  orders: number;
  orderedCents: number;
  feeCents: number;
}

/** Répartition par zone de livraison, triée par CA décroissant. */
export function zoneSplit(orders: Order[]): ZoneSplit[] {
  const map = new Map<string, ZoneSplit>();
  for (const o of valid(orders)) {
    const key = String(o.zoneIdx);
    const e = map.get(key) ?? { zoneIdx: o.zoneIdx, orders: 0, orderedCents: 0, feeCents: 0 };
    e.orders += 1;
    e.orderedCents += o.totalCents;
    e.feeCents += o.feeCents;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.orderedCents - a.orderedCents);
}

export interface HourPoint {
  hour: number;
  /** « 19 h » */
  label: string;
  orders: number;
  orderedCents: number;
}

/** Heures de pointe : 24 tranches, en heure de Paris. */
export function peakHours(orders: Order[]): HourPoint[] {
  const buckets: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour} h`,
    orders: 0,
    orderedCents: 0,
  }));
  for (const o of valid(orders)) {
    const b = buckets[parisHourOf(o.createdAt)];
    if (!b) continue;
    b.orders += 1;
    b.orderedCents += o.totalCents;
  }
  return buckets;
}

export interface DishStat {
  dishId: string;
  name: string;
  qty: number;
  /** CA commandé attribué au plat, depuis les lignes archivées */
  orderedCents: number;
}

/**
 * Top plats depuis les `lines` archivées des commandes.
 * Le regroupement se fait sur `dishId` : deux plats homonymes de catégories
 * différentes ne se confondent pas, et un plat renommé garde son historique.
 */
export function topDishes(orders: Order[], limit = 6): DishStat[] {
  const map = new Map<string, DishStat>();
  for (const o of valid(orders)) {
    for (const l of o.lines) {
      /* Une ligne formule n'a pas de `dishId` : elle est comptée sous son
       * propre identifiant, sans quoi toutes les formules se cumuleraient sur
       * une même clé vide. Savoir laquelle se vend est une information utile en
       * soi — c'est le produit que la cliente met en avant. */
      const key = l.formulaId ? `formule:${l.formulaId}` : l.dishId;
      const e = map.get(key) ?? { dishId: key, name: l.name, qty: 0, orderedCents: 0 };
      e.qty += l.qty;
      e.orderedCents += l.lineTotalCents;
      map.set(key, e);
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || b.orderedCents - a.orderedCents).slice(0, limit);
}

export interface MarginEstimate {
  /** CA commandé des seules lignes dont le coût matière est connu */
  coveredCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number;
  /** part du CA commandé pour laquelle un coût est renseigné, en % */
  coveragePct: number;
}

/**
 * Marge estimée : ne porte que sur les lignes dont `Dish.costCents` est
 * renseigné. `coveragePct` dit sur quelle part du CA l'estimation porte —
 * sans quoi une marge calculée sur trois plats sur quarante passerait pour la
 * marge du restaurant.
 */
export function estimatedMargin(
  orders: Order[],
  costByDish: Map<string, number | null>,
): MarginEstimate {
  let covered = 0;
  let cost = 0;
  let total = 0;
  for (const o of valid(orders)) {
    for (const l of o.lines) {
      total += l.lineTotalCents;

      /* Le coût d'une formule est celui des plats qui la composent. Il n'est
       * retenu que si **tous** sont chiffrés : additionner deux plats sur
       * quatre gonflerait artificiellement la marge de la formule. */
      if (l.formulaId) {
        const picks = l.picks ?? [];
        if (picks.length === 0) continue;
        let sum = 0;
        let complete = true;
        for (const p of picks) {
          const unit = costByDish.get(p.dishId);
          if (unit === null || unit === undefined) {
            complete = false;
            break;
          }
          sum += unit;
        }
        if (!complete) continue;
        covered += l.lineTotalCents;
        cost += sum * l.qty;
        continue;
      }

      const unitCost = costByDish.get(l.dishId);
      if (unitCost === null || unitCost === undefined) continue;
      covered += l.lineTotalCents;
      cost += unitCost * l.qty;
    }
  }
  const margin = covered - cost;
  return {
    coveredCents: covered,
    costCents: cost,
    marginCents: margin,
    marginPct: covered ? Math.round((margin / covered) * 1000) / 10 : 0,
    coveragePct: total ? Math.round((covered / total) * 1000) / 10 : 0,
  };
}

// ─── Délais réels ──────────────────────────────────────────────

export type StageKey = "paiement" | "priseEnCharge" | "preparation" | "livraison" | "total";

export interface StageDelay {
  key: StageKey;
  label: string;
  /** moyenne en minutes, null si aucune commande n'a franchi l'étape */
  avgMinutes: number | null;
  medianMinutes: number | null;
  count: number;
}

const STAGES: { key: StageKey; label: string; from: (o: Order) => number | null; to: (o: Order) => number | null }[] = [
  { key: "paiement", label: "Commande → confirmation", from: (o) => o.createdAt, to: (o) => o.timeline.confirmedAt },
  { key: "priseEnCharge", label: "Confirmation → cuisine", from: (o) => o.timeline.confirmedAt, to: (o) => o.timeline.cookingAt },
  { key: "preparation", label: "Cuisine → départ", from: (o) => o.timeline.cookingAt, to: (o) => o.timeline.routeAt },
  { key: "livraison", label: "Départ → livraison", from: (o) => o.timeline.routeAt, to: (o) => o.timeline.deliveredAt },
  { key: "total", label: "Commande → livraison", from: (o) => o.createdAt, to: (o) => o.timeline.deliveredAt },
];

/**
 * Délais réels moyens et médians par étape, en minutes, depuis les
 * horodatages de `Order.timeline`. La médiane est donnée parce qu'une seule
 * commande oubliée toute une nuit suffit à rendre la moyenne inexploitable.
 */
export function stageDelays(orders: Order[]): StageDelay[] {
  return STAGES.map(({ key, label, from, to }) => {
    const durations: number[] = [];
    for (const o of valid(orders)) {
      const a = from(o);
      const b = to(o);
      if (a === null || b === null || b < a) continue;
      durations.push((b - a) / 60_000);
    }
    if (durations.length === 0) {
      return { key, label, avgMinutes: null, medianMinutes: null, count: 0 };
    }
    durations.sort((x, y) => x - y);
    const mid = Math.floor(durations.length / 2);
    const median =
      durations.length % 2 === 0 ? (durations[mid - 1] + durations[mid]) / 2 : durations[mid];
    return {
      key,
      label,
      avgMinutes: Math.round(durations.reduce((s, d) => s + d, 0) / durations.length),
      medianMinutes: Math.round(median),
      count: durations.length,
    };
  });
}

// ─── Alertes ───────────────────────────────────────────────────

/** Au-delà de ce délai sans être livrée, une commande active est « en retard ». */
export const LATE_AFTER_MINUTES = 60;
/** Une commande restée impayée au-delà de ce délai est un panier abandonné. */
export const ABANDONED_AFTER_MINUTES = 30;

/** Étapes où la commande est en cuisine ou en route : elle doit avancer. */
const ACTIVE: OrderStatus[] = ["confirmee", "cuisine", "route"];

export const isActive = (o: Order): boolean => ACTIVE.includes(o.status);

/**
 * Minutes écoulées depuis la confirmation (ou, à défaut, depuis la création :
 * une commande confirmée sans horodatage ne doit pas apparaître comme
 * instantanée en cuisine).
 *
 * N'exige que les deux champs utiles, pour être appelable sur une projection
 * partielle (les alertes ne sélectionnent pas toute la commande).
 */
export function elapsedMinutes(
  o: { createdAt: number; timeline: { confirmedAt: number | null } },
  now: number,
): number {
  const from = o.timeline.confirmedAt ?? o.createdAt;
  return Math.max(0, Math.floor((now - from) / 60_000));
}

/** Commande active qui traîne : à traiter en priorité en cuisine. */
export function isLate(o: Order, now: number, thresholdMinutes = LATE_AFTER_MINUTES): boolean {
  return isActive(o) && elapsedMinutes(o, now) >= thresholdMinutes;
}

/** Panier abandonné : resté « en attente de paiement » au-delà du délai. */
export function isAbandoned(
  o: Order,
  now: number,
  thresholdMinutes = ABANDONED_AFTER_MINUTES,
): boolean {
  if (o.status !== "en_attente_paiement") return false;
  return now - o.createdAt >= thresholdMinutes * 60_000;
}

// ─── Forme de la réponse de `GET /api/stats` ───────────────────

/** Commande réduite au strict nécessaire pour une alerte du tableau de bord. */
export interface AlertOrder {
  id: string;
  ref: string;
  customerName: string;
  totalCents: number;
  status: OrderStatus;
  createdAt: number;
  /** minutes écoulées depuis la confirmation (retards) ou la création */
  minutes: number;
}

export interface StatsAlerts {
  lowStock: LowStockDish[];
  unpaid: { count: number; totalCents: number; orders: AlertOrder[] };
  late: { count: number; totalCents: number; orders: AlertOrder[] };
  abandoned: { count: number; totalCents: number; orders: AlertOrder[] };
}

export interface StatsResponse {
  generatedAt: number;
  /** nombre de jours de la série temporelle */
  days: number;
  periods: {
    day: PeriodComparison;
    week: PeriodComparison;
    month: PeriodComparison;
  };
  series: DayPoint[];
  byStatus: Record<OrderStatus, number>;
  modes: ModeSplit[];
  zones: ZoneSplit[];
  hours: HourPoint[];
  topDishes: DishStat[];
  margin: MarginEstimate;
  delays: StageDelay[];
  alerts: StatsAlerts;
}

// ─── Client : lecture de `/api/orders` ─────────────────────────

/** `GET /api/orders` renvoie une page, pas un tableau (CONTRIBUTING §8). */
export interface OrdersPage {
  orders: Order[];
  total: number;
  take: number;
  skip: number;
}

export interface OrdersQuery {
  status?: OrderStatus;
  paid?: boolean;
  /** borne basse sur `createdAt`, en ms */
  since?: number;
  take?: number;
  skip?: number;
}

export function ordersQueryString(q: OrdersQuery): string {
  const p = new URLSearchParams();
  if (q.status) p.set("status", q.status);
  if (q.paid !== undefined) p.set("paid", String(q.paid));
  if (q.since !== undefined) p.set("since", new Date(q.since).toISOString());
  if (q.take !== undefined) p.set("take", String(q.take));
  if (q.skip !== undefined) p.set("skip", String(q.skip));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Une page de commandes. Lève sur réponse non-2xx pour que l'écran l'affiche. */
export async function fetchOrdersPage(q: OrdersQuery = {}): Promise<OrdersPage> {
  const res = await fetch(`/api/orders${ordersQueryString(q)}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Lecture des commandes impossible");
  }
  return (await res.json()) as OrdersPage;
}

/** Plafond de sécurité : on ne charge pas l'historique entier dans un onglet. */
export const MAX_FETCHED_ORDERS = 2000;

/**
 * Toutes les commandes correspondant au filtre, page après page.
 * Les écrans Clients et Facturation ont besoin de l'historique complet ; ils le
 * reconstituent à partir de ce que l'API renvoie déjà à un ADMIN, sans route
 * dédiée qui exposerait davantage.
 */
export async function fetchAllOrders(
  q: OrdersQuery = {},
  { max = MAX_FETCHED_ORDERS, pageSize = 200 }: { max?: number; pageSize?: number } = {},
): Promise<{ orders: Order[]; total: number; truncated: boolean }> {
  const out: Order[] = [];
  let total = 0;
  let skip = 0;
  for (;;) {
    const page = await fetchOrdersPage({ ...q, take: pageSize, skip });
    total = page.total;
    out.push(...page.orders);
    skip += page.orders.length;
    if (page.orders.length === 0 || out.length >= Math.min(total, max)) break;
  }
  return { orders: out, total, truncated: total > out.length };
}
