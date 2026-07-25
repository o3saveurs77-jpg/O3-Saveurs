"use client";

/* Écran « Plats » — édition complète de la carte.
 *
 * Trois principes, hérités de CONTRIBUTING.md :
 *
 *  · **Centimes en base, euros à la saisie.** Les champs monétaires sont tenus
 *    en chaîne pendant l'édition (`"11,97"`) et convertis par `toCents()` au
 *    moment d'enregistrer. Convertir à chaque frappe empêcherait d'effacer un
 *    champ (« 1 » → 100 → « 1,00 » → …) et ferait réapparaître les flottants.
 *  · **Aucun `alert()`.** Les erreurs et confirmations passent par une zone
 *    `aria-live`, présente dans le DOM en permanence pour être annoncée.
 *  · **Tout champ a un `id` associé à son `label`.** Un `<label>` sans `htmlFor`
 *    ne rend pas le libellé cliquable et n'est pas lu par un lecteur d'écran.
 *
 * L'enregistrement passe par un `fetch` direct plutôt que par les helpers
 * optimistes du contexte : ceux-ci ignorent la réponse du serveur, donc une
 * validation refusée en 400 restait invisible et l'écran affichait une valeur
 * que la base n'avait pas acceptée. Après un enregistrement, `reset()` resynchronise.
 */

import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useDishes } from "@/components/providers/DishesContext";
import { cats as seedCats, fmtPrice } from "@/lib/menu";
import type { Badge, Dish, DishOption } from "@/lib/menu";
import { toCents, toEuros } from "@/lib/money";
import { ALLERGENS, ALLERGEN_LABEL } from "@/lib/types";
import type { Allergen } from "@/lib/types";
import { Icon } from "@/components/Icon";

const BADGES: Badge[] = [null, "Healthy", "Nouveau", "Bientôt"];
const SPICE_LABEL = ["Aucun", "Doux", "Relevé", "Très piquant"];

interface CatOption {
  slug: string;
  label: string;
}

/** Message de la zone `aria-live`. */
type Notice = { kind: "error" | "info"; text: string } | null;

const INPUT =
  "w-full rounded-[var(--radius-soft)] border border-line bg-page px-3 py-2.5 outline-none focus:border-primary";
const LABEL = "mb-1 block text-sm font-semibold text-ink-2";

/** Tri d'affichage d'une catégorie : la position, puis le nom en cas d'égalité. */
const byPosition = (a: Dish, b: Dish) =>
  a.position - b.position || a.name.localeCompare(b.name, "fr");

/**
 * `next/image` ne sait optimiser que les sources locales et les hôtes déclarés
 * dans `next.config.mjs`. Une URL saisie à la main vers un autre domaine doit
 * donc passer en `unoptimized`, sinon l'optimiseur répond 400 et l'admin voit
 * une vignette cassée.
 */
const isOptimizable = (src: string) =>
  src.startsWith("/") || /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(src);

/** Catégories depuis la base, avec les données de seed en repli hors-ligne. */
function useCategories(): CatOption[] {
  const [list, setList] = useState<CatOption[]>(() =>
    seedCats.map((c) => ({ slug: c.id, label: c.label })),
  );

  useEffect(() => {
    let alive = true;
    fetch("/api/categories", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<CatOption[]>) : null))
      .then((rows) => {
        if (alive && rows && rows.length) {
          setList(rows.map((c) => ({ slug: c.slug, label: c.label })));
        }
      })
      .catch(() => {
        /* on garde le repli : l'écran reste utilisable */
      });
    return () => {
      alive = false;
    };
  }, []);

  return list;
}

function Thumb({ src, size }: { src: string | null; size: number }) {
  if (!src) {
    return (
      <div className="ph h-full w-full">
        <span className="glyph text-base">Ô3</span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      unoptimized={!isOptimizable(src)}
      className="h-full w-full object-cover"
    />
  );
}

function PhotoUploader({
  photo,
  onUploaded,
  onError,
}: {
  photo: string | null;
  onUploaded: (url: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Téléversement échoué.");
      onUploaded(body.url);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Téléversement échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-soft)] border border-line bg-panel-2">
        <Thumb src={photo} size={64} />
      </div>
      <label
        htmlFor={inputId}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel-2"
      >
        <Icon name="upload" size={16} />
        {busy ? "Envoi…" : "Téléverser une photo"}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function PlatsAdmin() {
  const { dishes, ready, toggleAvailable, togglePopular, update, reset } = useDishes();
  const categories = useCategories();

  const [editing, setEditing] = useState<Dish | "new" | null>(null);
  const [catFilter, setCatFilter] = useState("all");
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const labelOf = useCallback(
    (slug: string) => categories.find((c) => c.slug === slug)?.label ?? slug,
    [categories],
  );

  /** Plats regroupés par catégorie et triés par position : c'est l'ordre de la carte. */
  const groups = useMemo(() => {
    const wanted = catFilter === "all" ? categories : categories.filter((c) => c.slug === catFilter);
    const out = wanted.map((c) => ({
      cat: c,
      items: dishes.filter((d) => d.cat === c.slug).sort(byPosition),
    }));

    // Une catégorie supprimée en base peut laisser des plats orphelins : les
    // masquer les rendrait impossibles à corriger depuis l'écran.
    const known = new Set(categories.map((c) => c.slug));
    const orphans = dishes.filter((d) => !known.has(d.cat));
    if (orphans.length && catFilter === "all") {
      out.push({ cat: { slug: "__orphelins", label: "Catégorie inconnue" }, items: orphans.sort(byPosition) });
    }
    return out.filter((g) => g.items.length > 0);
  }, [dishes, categories, catFilter]);

  /**
   * Réordonnancement : renumérote toute la catégorie de 0 à n-1 après échange.
   * Un simple échange des deux valeurs ne suffit pas — des plats importés avec
   * `position = 0` partout ne bougeraient jamais.
   */
  const move = (dish: Dish, dir: -1 | 1) => {
    const siblings = dishes.filter((d) => d.cat === dish.cat).sort(byPosition);
    const i = siblings.findIndex((d) => d.id === dish.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= siblings.length) return;

    const reordered = [...siblings];
    const a = reordered[i];
    const b = reordered[j];
    reordered[i] = b;
    reordered[j] = a;
    reordered.forEach((d, index) => {
      if (d.position !== index) update(d.id, { position: index });
    });
  };

  /** Prix rapide dans le tableau : euros saisis, centimes enregistrés. */
  const setPrice = (dish: Dish, raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      update(dish.id, { priceCents: null });
      return;
    }
    const cents = toCents(trimmed);
    if (cents === null || cents < 0) {
      setNotice({ kind: "error", text: `Prix illisible pour « ${dish.name} » : attendu par exemple 11,97.` });
      return;
    }
    setNotice(null);
    update(dish.id, { priceCents: cents });
  };

  const save = async (payload: Omit<Dish, "id">, id: string | null) => {
    const res = await fetch(id ? `/api/dishes/${id}` : "/api/dishes", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? "Enregistrement impossible.");
    setNotice({
      kind: "info",
      text: id ? `« ${payload.name} » a été enregistré.` : `« ${payload.name} » a été ajouté à la carte.`,
    });
    setEditing(null);
    reset();
  };

  const doDelete = async (dish: Dish) => {
    setBusy(true);
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/dishes/${dish.id}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        archived?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setNotice({ kind: "error", text: body.error ?? "Suppression impossible." });
        return;
      }
      setNotice({
        kind: "info",
        text: body.message ?? `« ${dish.name} » a été supprimé de la carte.`,
      });
      reset();
    } catch {
      setNotice({ kind: "error", text: "Le serveur n'a pas répondu, rien n'a été supprimé." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Gestion des plats</h1>
          <p className="text-ink-2">
            {dishes.length} plats au catalogue · l&apos;ordre d&apos;affichage sur la carte suit
            l&apos;ordre de ce tableau.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setNotice(null);
              reset();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2.5 text-sm font-semibold hover:bg-panel-2"
          >
            <Icon name="refresh" size={16} /> Recharger
          </button>
          <button
            onClick={() => {
              setNotice(null);
              setEditing("new");
            }}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white hover:brightness-105"
          >
            <Icon name="plus" size={16} /> Ajouter un plat
          </button>
        </div>
      </div>

      {/* Zone d'annonce : toujours montée, sinon un lecteur d'écran n'annonce
          pas le premier message inséré. */}
      <div aria-live="polite" role="status" className="empty:hidden">
        {notice && (
          <p
            className={`flex items-start gap-2 rounded-[var(--radius-soft)] border px-4 py-3 text-sm font-semibold ${
              notice.kind === "error"
                ? "border-brick/40 bg-brick/5 text-brick"
                : "border-teal/40 bg-teal/5 text-teal"
            }`}
          >
            <Icon name={notice.kind === "error" ? "warning" : "check"} size={18} />
            {notice.text}
          </p>
        )}
      </div>

      {/* filtre catégorie */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Chip on={catFilter === "all"} onClick={() => setCatFilter("all")}>
          Toutes
        </Chip>
        {categories.map((c) => (
          <Chip key={c.slug} on={catFilter === c.slug} onClick={() => setCatFilter(c.slug)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {!ready ? (
        <p className="py-20 text-center text-ink-2">Chargement…</p>
      ) : groups.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-line bg-panel px-4 py-10 text-center text-ink-2">
          Aucun plat dans cette catégorie.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(({ cat, items }) => (
            <section
              key={cat.slug}
              className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]"
            >
              <h2 className="border-b border-line bg-panel-2 px-4 py-3 text-lg">
                {cat.label} <span className="text-sm font-normal text-ink-2">· {items.length}</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <caption className="sr-only">
                    Plats de la catégorie {cat.label}, dans leur ordre d&apos;affichage
                  </caption>
                  <thead className="bg-panel text-left text-ink-2">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-semibold">Ordre</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Plat</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Prix (€)</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Stock</th>
                      <th scope="col" className="px-4 py-2 text-center font-semibold">Populaire</th>
                      <th scope="col" className="px-4 py-2 text-center font-semibold">Disponible</th>
                      <th scope="col" className="px-4 py-2">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((d, index) => (
                      <tr key={d.id} className="border-t border-line">
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => move(d, -1)}
                              disabled={index === 0}
                              aria-label={`Monter ${d.name}`}
                              className="grid h-7 w-7 place-items-center rounded-full border border-line hover:bg-panel-2 disabled:opacity-30"
                            >
                              <Icon name="chevDown" size={14} className="rotate-180" />
                            </button>
                            <button
                              onClick={() => move(d, 1)}
                              disabled={index === items.length - 1}
                              aria-label={`Descendre ${d.name}`}
                              className="grid h-7 w-7 place-items-center rounded-full border border-line hover:bg-panel-2 disabled:opacity-30"
                            >
                              <Icon name="chevDown" size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                              <Thumb src={d.photo} size={40} />
                            </div>
                            <div>
                              <p className="font-semibold">{d.name}</p>
                              <p className="text-xs text-ink-2">
                                {d.badge && <span className="mr-2">{d.badge}</span>}
                                {d.allergens.length > 0
                                  ? `${d.allergens.length} allergène${d.allergens.length > 1 ? "s" : ""}`
                                  : "Allergènes non saisis"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <PriceEdit dish={d} onCommit={setPrice} />
                          {d.costCents !== null && d.priceCents !== null && (
                            <p className="mt-1 text-xs text-ink-2">
                              marge {fmtPrice(d.priceCents - d.costCents)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StockCell dish={d} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Toggle
                            on={d.popular}
                            onClick={() => togglePopular(d.id)}
                            label={`Mise en avant de ${d.name}`}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Toggle
                            on={d.available}
                            onClick={() => toggleAvailable(d.id)}
                            label={`Disponibilité de ${d.name}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {confirmDelete === d.id ? (
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => doDelete(d)}
                                disabled={busy}
                                className="rounded-full bg-brick px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                              >
                                Confirmer
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
                              >
                                Annuler
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => {
                                  setNotice(null);
                                  setEditing(d);
                                }}
                                className="grid h-8 w-8 place-items-center rounded-full hover:bg-panel-2"
                                aria-label={`Modifier ${d.name}`}
                              >
                                <Icon name="edit" size={16} />
                              </button>
                              <button
                                onClick={() => setConfirmDelete(d.id)}
                                className="grid h-8 w-8 place-items-center rounded-full text-brick hover:bg-brick/10"
                                aria-label={`Supprimer ${d.name}`}
                              >
                                <Icon name="trash" size={16} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <DishEditor
          dish={editing === "new" ? null : editing}
          categories={categories}
          catLabel={labelOf}
          onClose={() => setEditing(null)}
          onSave={(payload) => save(payload, editing === "new" ? null : editing.id)}
        />
      )}
    </div>
  );
}

/** Champ de prix du tableau : euros à l'écran, centimes à l'enregistrement. */
function PriceEdit({ dish, onCommit }: { dish: Dish; onCommit: (d: Dish, raw: string) => void }) {
  const id = useId();
  const [raw, setRaw] = useState(() => toEuros(dish.priceCents));

  // Le prix peut changer ailleurs (resynchronisation) : on suit la valeur amont
  // tant que le champ n'est pas en cours d'édition.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setRaw(toEuros(dish.priceCents));
  }, [dish.priceCents, focused]);

  return (
    <>
      <label htmlFor={id} className="sr-only">
        Prix de {dish.name} en euros
      </label>
      <input
        id={id}
        value={raw}
        inputMode="decimal"
        onFocus={() => setFocused(true)}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          setFocused(false);
          if (raw.trim() !== toEuros(dish.priceCents)) onCommit(dish, raw);
        }}
        placeholder="À définir"
        className="w-24 rounded-lg border border-line bg-page px-2 py-1.5 text-sm outline-none focus:border-primary"
      />
    </>
  );
}

/** Stock en lecture seule : il se pilote depuis l'écran Stocks, avec un motif. */
function StockCell({ dish }: { dish: Dish }) {
  if (dish.stock === null) {
    return <span className="text-xs font-semibold text-ink-2">Illimité</span>;
  }
  const low = dish.stockAlert !== null && dish.stock <= dish.stockAlert;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        dish.stock === 0
          ? "bg-brick/10 text-brick"
          : low
            ? "bg-gold/25 text-[#8a6d00]"
            : "bg-panel-2 text-ink-2"
      }`}
    >
      {dish.stock === 0 ? "Épuisé" : `${dish.stock} en stock`}
    </span>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-6 w-11 rounded-full transition ${on ? "bg-teal" : "bg-line"}`}
      aria-pressed={on}
      aria-label={label}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        on ? "bg-brick text-white" : "bg-panel-2 text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Éditeur de plat ──────────────────────────────────────────

/** Choix d'un groupe d'options, supplément en euros pendant la saisie. */
interface ChoiceForm {
  l: string;
  price: string;
}
interface OptionForm {
  name: string;
  required: boolean;
  choices: ChoiceForm[];
}
interface FormuleForm {
  label: string;
  price: string;
}

/**
 * État du formulaire. Les montants et les entiers facultatifs sont des
 * **chaînes** : c'est ce qui permet de vider un champ (stock illimité, prix à
 * définir) sans qu'une conversion intermédiaire n'y remette 0.
 */
interface DishForm {
  cat: string;
  name: string;
  desc: string;
  price: string;
  cost: string;
  badge: Badge;
  photo: string | null;
  options: OptionForm[];
  formules: FormuleForm[];
  tags: string[];
  spice: number;
  popular: boolean;
  available: boolean;
  allergens: Allergen[];
  stock: string;
  stockAlert: string;
  position: string;
}

function toForm(dish: Dish | null, fallbackCat: string): DishForm {
  if (!dish) {
    return {
      cat: fallbackCat,
      name: "",
      desc: "",
      price: "",
      cost: "",
      badge: null,
      photo: null,
      options: [],
      formules: [],
      tags: [],
      spice: 0,
      popular: false,
      available: true,
      allergens: [],
      stock: "",
      stockAlert: "",
      position: "",
    };
  }
  return {
    cat: dish.cat,
    name: dish.name,
    desc: dish.desc,
    price: toEuros(dish.priceCents),
    cost: toEuros(dish.costCents),
    badge: dish.badge,
    photo: dish.photo,
    options: dish.options.map((o) => ({
      name: o.name,
      required: o.required,
      choices: o.choices.map((c) => ({ l: c.l, price: toEuros(c.priceCents ?? null) })),
    })),
    formules: (dish.formules ?? []).map(([label, cents]) => ({
      label,
      price: toEuros(cents),
    })),
    tags: [...dish.tags],
    spice: dish.spice,
    popular: dish.popular,
    available: dish.available,
    allergens: [...dish.allergens],
    stock: dish.stock === null ? "" : String(dish.stock),
    stockAlert: dish.stockAlert === null ? "" : String(dish.stockAlert),
    position: String(dish.position),
  };
}

/** Euros facultatifs → centimes. `null` = champ vide, `undefined` = illisible. */
function optionalCents(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === "") return null;
  const cents = toCents(t);
  if (cents === null || cents < 0) return undefined;
  return cents;
}

/** Entier facultatif. `null` = champ vide, `undefined` = illisible. */
function optionalInt(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function DishEditor({
  dish,
  categories,
  catLabel,
  onClose,
  onSave,
}: {
  dish: Dish | null;
  categories: CatOption[];
  catLabel: (slug: string) => string;
  onClose: () => void;
  onSave: (payload: Omit<Dish, "id">) => Promise<void>;
}) {
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  const [f, setF] = useState<DishForm>(() =>
    toForm(dish, dish?.cat ?? categories[0]?.slug ?? "entrees"),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const patch = (p: Partial<DishForm>) => setF((cur) => ({ ...cur, ...p }));

  // Échap ferme la modale (les modales du back-office n'étaient fermables qu'à
  // la souris). Le clic sur le fond ne ferme pas : sur un formulaire aussi long,
  // un clic à côté effaçait toute la saisie sans avertissement.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    const name = f.name.trim();
    if (name.length < 2) return setError("Le nom du plat est requis (2 caractères minimum).");

    const priceCents = optionalCents(f.price);
    if (priceCents === undefined) return setError("Le prix est illisible : attendu par exemple 11,97.");
    const costCents = optionalCents(f.cost);
    if (costCents === undefined) return setError("Le coût matière est illisible : attendu par exemple 4,20.");

    const stock = optionalInt(f.stock);
    if (stock === undefined) return setError("Le stock doit être un nombre entier positif (vide = illimité).");
    const stockAlert = optionalInt(f.stockAlert);
    if (stockAlert === undefined) return setError("Le seuil d'alerte doit être un nombre entier positif.");
    const position = optionalInt(f.position);
    if (position === undefined) return setError("La position doit être un nombre entier positif.");

    // Options : un groupe sans nom ou sans choix ne serait pas affichable côté
    // client, et un groupe « requis » sans choix bloquerait la commande.
    const options: DishOption[] = [];
    for (const g of f.options) {
      const groupName = g.name.trim();
      if (!groupName) return setError("Chaque groupe d'options doit avoir un nom.");
      const choices = [];
      for (const c of g.choices) {
        const l = c.l.trim();
        if (!l) return setError(`Un choix du groupe « ${groupName} » n'a pas de libellé.`);
        const supp = optionalCents(c.price);
        if (supp === undefined) {
          return setError(`Le supplément de « ${l} » est illisible : attendu par exemple 1,50.`);
        }
        choices.push(supp === null || supp === 0 ? { l } : { l, priceCents: supp });
      }
      if (choices.length === 0) return setError(`Le groupe « ${groupName} » doit avoir au moins un choix.`);
      options.push({ name: groupName, required: g.required, choices });
    }

    const formules: [string, number][] = [];
    for (const item of f.formules) {
      const label = item.label.trim();
      if (!label) return setError("Chaque formule doit avoir un libellé.");
      const cents = optionalCents(item.price);
      if (cents === undefined || cents === null) {
        return setError(`Le prix de la formule « ${label} » est requis et doit être un montant.`);
      }
      formules.push([label, cents]);
    }

    setError(null);
    setSaving(true);
    try {
      await onSave({
        cat: f.cat,
        name,
        desc: f.desc.trim(),
        priceCents,
        badge: f.badge,
        photo: f.photo,
        options,
        formules,
        tags: f.tags,
        spice: f.spice,
        popular: f.popular,
        available: f.available,
        allergens: f.allergens,
        stock,
        stockAlert,
        // Un nouveau plat sans position explicite se place en fin de catégorie,
        // ce que fait déjà `POST /api/dishes`.
        position: position ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={fid("title")}
        className="my-auto w-full max-w-2xl rounded-2xl bg-page p-6 shadow-[var(--shadow-lg)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={fid("title")} className="text-xl">
            {dish ? `Modifier « ${dish.name} »` : "Nouveau plat"}
          </h2>
          <button onClick={onClose} aria-label="Fermer sans enregistrer">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div aria-live="assertive" role="alert" className="empty:hidden">
          {error && (
            <p className="mb-4 flex items-start gap-2 rounded-[var(--radius-soft)] border border-brick/40 bg-brick/5 px-4 py-3 text-sm font-semibold text-brick">
              <Icon name="warning" size={18} />
              {error}
            </p>
          )}
        </div>

        <div className="space-y-5">
          {/* ── Identité ── */}
          <div className="space-y-3">
            <div>
              <label htmlFor={fid("name")} className={LABEL}>
                Nom du plat
              </label>
              <input
                id={fid("name")}
                className={INPUT}
                value={f.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={fid("desc")} className={LABEL}>
                Description
              </label>
              <textarea
                id={fid("desc")}
                className={INPUT}
                rows={2}
                value={f.desc}
                onChange={(e) => patch({ desc: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor={fid("cat")} className={LABEL}>
                  Catégorie
                </label>
                <select
                  id={fid("cat")}
                  className={INPUT}
                  value={f.cat}
                  onChange={(e) => patch({ cat: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                  {!categories.some((c) => c.slug === f.cat) && (
                    <option value={f.cat}>{catLabel(f.cat)}</option>
                  )}
                </select>
              </div>
              <div>
                <label htmlFor={fid("badge")} className={LABEL}>
                  Badge
                </label>
                <select
                  id={fid("badge")}
                  className={INPUT}
                  value={f.badge ?? ""}
                  onChange={(e) => patch({ badge: (e.target.value || null) as Badge })}
                >
                  {BADGES.map((b) => (
                    <option key={b ?? "none"} value={b ?? ""}>
                      {b ?? "Aucun"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={fid("position")} className={LABEL}>
                  Position dans la catégorie
                </label>
                <input
                  id={fid("position")}
                  className={INPUT}
                  inputMode="numeric"
                  value={f.position}
                  onChange={(e) => patch({ position: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* ── Prix ── */}
          <Section title="Prix et marge">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={fid("price")} className={LABEL}>
                  Prix de vente (€)
                </label>
                <input
                  id={fid("price")}
                  className={INPUT}
                  inputMode="decimal"
                  value={f.price}
                  onChange={(e) => patch({ price: e.target.value })}
                  placeholder="À définir"
                  aria-describedby={fid("price-help")}
                />
                <p id={fid("price-help")} className="mt-1 text-xs text-ink-2">
                  Laisser vide pour un plat « bientôt » : il ne sera pas commandable.
                </p>
              </div>
              <div>
                <label htmlFor={fid("cost")} className={LABEL}>
                  Coût matière (€)
                </label>
                <input
                  id={fid("cost")}
                  className={INPUT}
                  inputMode="decimal"
                  value={f.cost}
                  onChange={(e) => patch({ cost: e.target.value })}
                  placeholder="Optionnel"
                  aria-describedby={fid("cost-help")}
                />
                <p id={fid("cost-help")} className="mt-1 text-xs text-ink-2">
                  Sert au calcul de marge du tableau de bord. Jamais affiché au client.
                </p>
              </div>
            </div>
          </Section>

          {/* ── Photo ── */}
          <Section title="Photo">
            <div>
              <label htmlFor={fid("photo")} className={LABEL}>
                Adresse de l&apos;image
              </label>
              <input
                id={fid("photo")}
                className={INPUT}
                value={f.photo ?? ""}
                onChange={(e) => patch({ photo: e.target.value || null })}
                placeholder="/photos/p00.jpg ou https://…"
              />
            </div>
            <PhotoUploader
              photo={f.photo}
              onUploaded={(url) => patch({ photo: url })}
              onError={setError}
            />
          </Section>

          {/* ── Allergènes ── */}
          <Section title="Allergènes">
            <p className="text-xs text-ink-2">
              Déclaration obligatoire avant la commande (règlement INCO 1169/2011, annexe II).
              Cocher les 14 substances réellement présentes dans la recette.
            </p>
            <fieldset className="mt-2">
              <legend className="sr-only">Allergènes présents dans ce plat</legend>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {ALLERGENS.map((a) => (
                  <label
                    key={a}
                    htmlFor={fid(`allergen-${a}`)}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      id={fid(`allergen-${a}`)}
                      type="checkbox"
                      checked={f.allergens.includes(a)}
                      onChange={(e) =>
                        patch({
                          allergens: e.target.checked
                            ? [...f.allergens, a]
                            : f.allergens.filter((x) => x !== a),
                        })
                      }
                    />
                    {ALLERGEN_LABEL[a]}
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          {/* ── Options ── */}
          <Section title="Groupes d'options">
            <p className="text-xs text-ink-2">
              Un groupe « requis » oblige le client à choisir avant d&apos;ajouter au panier
              (la sauce d&apos;un sandwich). Le supplément s&apos;ajoute au prix de base.
            </p>
            <div className="space-y-3">
              {f.options.map((g, gi) => (
                <div key={gi} className="rounded-[var(--radius-soft)] border border-line bg-panel p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[10rem] flex-1">
                      <label htmlFor={fid(`opt-${gi}-name`)} className={LABEL}>
                        Nom du groupe {gi + 1}
                      </label>
                      <input
                        id={fid(`opt-${gi}-name`)}
                        className={INPUT}
                        value={g.name}
                        placeholder="Sauce, Riz, Viande…"
                        onChange={(e) => {
                          const options = [...f.options];
                          options[gi] = { ...g, name: e.target.value };
                          patch({ options });
                        }}
                      />
                    </div>
                    <label
                      htmlFor={fid(`opt-${gi}-req`)}
                      className="flex items-center gap-2 pb-3 text-sm font-semibold"
                    >
                      <input
                        id={fid(`opt-${gi}-req`)}
                        type="checkbox"
                        checked={g.required}
                        onChange={(e) => {
                          const options = [...f.options];
                          options[gi] = { ...g, required: e.target.checked };
                          patch({ options });
                        }}
                      />
                      Choix obligatoire
                    </label>
                    <button
                      onClick={() => patch({ options: f.options.filter((_, i) => i !== gi) })}
                      className="mb-2 grid h-9 w-9 place-items-center rounded-full text-brick hover:bg-brick/10"
                      aria-label={`Supprimer le groupe ${g.name || gi + 1}`}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>

                  <div className="mt-3 space-y-2 border-t border-line pt-3">
                    {g.choices.map((c, ci) => (
                      <div key={ci} className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[8rem] flex-1">
                          <label htmlFor={fid(`opt-${gi}-c-${ci}-l`)} className={LABEL}>
                            Choix {ci + 1}
                          </label>
                          <input
                            id={fid(`opt-${gi}-c-${ci}-l`)}
                            className={INPUT}
                            value={c.l}
                            onChange={(e) => {
                              const options = [...f.options];
                              const choices = [...g.choices];
                              choices[ci] = { ...c, l: e.target.value };
                              options[gi] = { ...g, choices };
                              patch({ options });
                            }}
                          />
                        </div>
                        <div className="w-28">
                          <label htmlFor={fid(`opt-${gi}-c-${ci}-p`)} className={LABEL}>
                            Supplément (€)
                          </label>
                          <input
                            id={fid(`opt-${gi}-c-${ci}-p`)}
                            className={INPUT}
                            inputMode="decimal"
                            value={c.price}
                            placeholder="0"
                            onChange={(e) => {
                              const options = [...f.options];
                              const choices = [...g.choices];
                              choices[ci] = { ...c, price: e.target.value };
                              options[gi] = { ...g, choices };
                              patch({ options });
                            }}
                          />
                        </div>
                        <button
                          onClick={() => {
                            const options = [...f.options];
                            options[gi] = { ...g, choices: g.choices.filter((_, i) => i !== ci) };
                            patch({ options });
                          }}
                          className="mb-2 grid h-9 w-9 place-items-center rounded-full text-brick hover:bg-brick/10"
                          aria-label={`Supprimer le choix ${c.l || ci + 1}`}
                        >
                          <Icon name="minus" size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const options = [...f.options];
                        options[gi] = { ...g, choices: [...g.choices, { l: "", price: "" }] };
                        patch({ options });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-panel-2"
                    >
                      <Icon name="plus" size={14} /> Ajouter un choix
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() =>
                  patch({
                    options: [...f.options, { name: "", required: false, choices: [{ l: "", price: "" }] }],
                  })
                }
                className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel-2"
              >
                <Icon name="plus" size={16} /> Ajouter un groupe d&apos;options
              </button>
            </div>
          </Section>

          {/* ── Formules ── */}
          <Section title="Formules">
            <p className="text-xs text-ink-2">
              Variantes vendues à un prix propre (« + Frites », « + Frites + Boisson »). Le prix
              d&apos;une formule remplace le prix de base.
            </p>
            <div className="space-y-2">
              {f.formules.map((item, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[10rem] flex-1">
                    <label htmlFor={fid(`formule-${i}-l`)} className={LABEL}>
                      Libellé de la formule {i + 1}
                    </label>
                    <input
                      id={fid(`formule-${i}-l`)}
                      className={INPUT}
                      value={item.label}
                      placeholder="+ Frites"
                      onChange={(e) => {
                        const formules = [...f.formules];
                        formules[i] = { ...item, label: e.target.value };
                        patch({ formules });
                      }}
                    />
                  </div>
                  <div className="w-32">
                    <label htmlFor={fid(`formule-${i}-p`)} className={LABEL}>
                      Prix (€)
                    </label>
                    <input
                      id={fid(`formule-${i}-p`)}
                      className={INPUT}
                      inputMode="decimal"
                      value={item.price}
                      onChange={(e) => {
                        const formules = [...f.formules];
                        formules[i] = { ...item, price: e.target.value };
                        patch({ formules });
                      }}
                    />
                  </div>
                  <button
                    onClick={() => patch({ formules: f.formules.filter((_, x) => x !== i) })}
                    className="mb-2 grid h-9 w-9 place-items-center rounded-full text-brick hover:bg-brick/10"
                    aria-label={`Supprimer la formule ${item.label || i + 1}`}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => patch({ formules: [...f.formules, { label: "", price: "" }] })}
                className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel-2"
              >
                <Icon name="plus" size={16} /> Ajouter une formule
              </button>
            </div>
          </Section>

          {/* ── Tags & piment ── */}
          <Section title="Étiquettes et piment">
            <TagsEditor
              tags={f.tags}
              inputId={fid("tag-new")}
              onChange={(tags) => patch({ tags })}
            />
            <div className="max-w-xs">
              <label htmlFor={fid("spice")} className={LABEL}>
                Niveau de piment : {SPICE_LABEL[f.spice]}
              </label>
              <input
                id={fid("spice")}
                type="range"
                min={0}
                max={3}
                step={1}
                value={f.spice}
                onChange={(e) => patch({ spice: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          </Section>

          {/* ── Stock ── */}
          <Section title="Stock">
            <p className="text-xs text-ink-2">
              Un stock vide signifie <strong>illimité</strong> (boissons, plats préparés à la
              demande). Sinon, chaque commande décrémente et le plat passe automatiquement
              indisponible à 0. Les entrées et sorties du quotidien se saisissent dans l&apos;écran
              Stocks, qui garde une trace de chaque mouvement.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={fid("stock")} className={LABEL}>
                  Stock actuel
                </label>
                <input
                  id={fid("stock")}
                  className={INPUT}
                  inputMode="numeric"
                  value={f.stock}
                  onChange={(e) => patch({ stock: e.target.value })}
                  placeholder="Illimité"
                />
              </div>
              <div>
                <label htmlFor={fid("stockAlert")} className={LABEL}>
                  Seuil d&apos;alerte
                </label>
                <input
                  id={fid("stockAlert")}
                  className={INPUT}
                  inputMode="numeric"
                  value={f.stockAlert}
                  onChange={(e) => patch({ stockAlert: e.target.value })}
                  placeholder="Aucune alerte"
                />
              </div>
            </div>
          </Section>

          {/* ── Mise en vente ── */}
          <Section title="Mise en vente">
            <div className="flex flex-wrap gap-5">
              <label htmlFor={fid("popular")} className="flex items-center gap-2 text-sm font-semibold">
                <input
                  id={fid("popular")}
                  type="checkbox"
                  checked={f.popular}
                  onChange={(e) => patch({ popular: e.target.checked })}
                />
                Mise en avant
              </label>
              <label htmlFor={fid("available")} className="flex items-center gap-2 text-sm font-semibold">
                <input
                  id={fid("available")}
                  type="checkbox"
                  checked={f.available}
                  onChange={(e) => patch({ available: e.target.checked })}
                />
                Disponible à la vente
              </label>
            </div>
          </Section>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-line px-5 py-2.5 font-semibold hover:bg-panel-2"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-full bg-primary px-6 py-2.5 font-bold text-white hover:brightness-105 disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[var(--radius-soft)] border border-line bg-panel-2 p-4">
      <h3 className="text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

function TagsEditor({
  tags,
  inputId,
  onChange,
}: {
  tags: string[];
  inputId: string;
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value || tags.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...tags, value]);
    setDraft("");
  };

  return (
    <div>
      <label htmlFor={inputId} className={LABEL}>
        Étiquettes (« 4 pièces », « Végé », « 50 cl »…)
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          className={INPUT}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Saisir puis Entrée"
        />
        <button
          onClick={add}
          className="shrink-0 rounded-full border border-line px-4 text-sm font-semibold hover:bg-panel"
        >
          Ajouter
        </button>
      </div>
      {tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t}>
              <button
                onClick={() => onChange(tags.filter((x) => x !== t))}
                className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1 text-xs font-semibold hover:bg-brick/10 hover:text-brick"
                aria-label={`Retirer l'étiquette ${t}`}
              >
                {t}
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
