"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Icon, ICONS, type IconName } from "@/components/Icon";
import { toCents, toEuros } from "@/lib/money";
import { photo } from "@/lib/menu";
import {
  COLUMNS,
  KIND_GROUPS,
  KIND_META,
  PAGES,
  PAGE_LABEL,
  PAGE_PATH,
  THEMES,
  THEME_LABEL,
  isAllowedPhoto,
  type ItemField,
  type PageSectionView,
  type PageSlug,
  type SectionContent,
  type SectionField,
  type SectionItem,
  type SectionKind,
} from "@/lib/pageSections";

/**
 * Contenu du site.
 *
 * Le cœur de l'écran est une liste ordonnée de sections : la cliente en ajoute,
 * les déplace, les masque, les supprime, et déplie celle qu'elle veut retoucher.
 * Chaque type de bloc n'affiche que les champs qui le concernent — un bloc
 * « galerie » ne demande pas de prix, un bloc « tarifs » ne demande pas de
 * photo — parce qu'un formulaire universel de vingt champs dont trois servent
 * est le meilleur moyen de ne plus rien oser toucher.
 *
 * Les blocs reliés à la base (plats, formules, zones, horaires) n'exposent que
 * leur habillage : leur contenu appartient aux écrans qui en sont responsables.
 */

const INPUT =
  "w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-primary";
const LABEL = "mb-1 block text-xs font-semibold text-ink-2";
const CHIP = "rounded-full px-3 py-1.5 text-sm font-semibold transition";

/* Les 42 visuels livrés avec le site (`public/photos`). Le sélecteur les
 * propose tels quels : téléverser une photo reste possible, mais la plupart du
 * temps la cliente veut simplement en choisir une qui existe déjà. */
const LIBRARY = Array.from({ length: 42 }, (_, i) => photo(i));

const ICON_NAMES = Object.keys(ICONS) as IconName[];

type Notice = { tone: "ok" | "erreur"; text: string } | null;

// ─── Champs élémentaires ──────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className={LABEL}>{label}</span>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-2">{hint}</p>}
    </div>
  );
}

/** Sélecteur de photo : bibliothèque du site, téléversement, ou adresse saisie. */
function PhotoPicker({
  value,
  onChange,
  onError,
}: {
  value: string | null;
  onChange: (src: string | null) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
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
      onChange(body.url);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Téléversement échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-soft)] border border-line bg-panel-2">
          {value ? (
            <Image src={value} alt="" width={64} height={64} className="h-full w-full object-cover" />
          ) : (
            <div className="ph h-full w-full">
              <span className="glyph text-base">Ô3</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full border border-line px-3.5 py-2 text-sm font-semibold hover:bg-panel-2"
          >
            {open ? "Fermer" : "Choisir une photo"}
          </button>
          <label
            htmlFor={inputId}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-3.5 py-2 text-sm font-semibold hover:bg-panel-2"
          >
            <Icon name="upload" size={16} />
            {busy ? "Envoi…" : "Téléverser"}
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-full border border-line px-3.5 py-2 text-sm font-semibold text-brick hover:bg-brick/10"
            >
              Retirer
            </button>
          )}
        </div>
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

      {open && (
        <div className="mt-3 grid max-h-56 grid-cols-4 gap-2 overflow-y-auto rounded-xl border border-line bg-page p-2 sm:grid-cols-6">
          {LIBRARY.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => {
                onChange(src);
                setOpen(false);
              }}
              aria-label={`Utiliser ${src}`}
              className={`relative aspect-square overflow-hidden rounded-lg border-2 transition ${
                value === src ? "border-primary" : "border-transparent hover:border-line"
              }`}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Liste ordonnée de photos — pour les blocs « texte & photos » et « galerie ». */
function PhotoListField({
  photos,
  onChange,
  onError,
}: {
  photos: string[];
  onChange: (next: string[]) => void;
  onError: (message: string) => void;
}) {
  const move = (index: number, dir: -1 | 1) => {
    const next = [...photos];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {photos.map((src, i) => (
        <div key={`${src}-${i}`} className="flex items-center gap-3 rounded-xl border border-line p-2">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
            <Image src={src} alt="" width={56} height={56} className="h-full w-full object-cover" />
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-ink-2">{src}</p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="Monter la photo"
              className="grid h-8 w-8 place-items-center rounded-lg border border-line disabled:opacity-30"
            >
              <Icon name="chevDown" size={15} className="rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === photos.length - 1}
              aria-label="Descendre la photo"
              className="grid h-8 w-8 place-items-center rounded-lg border border-line disabled:opacity-30"
            >
              <Icon name="chevDown" size={15} />
            </button>
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              aria-label="Retirer la photo"
              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-brick hover:bg-brick/10"
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>
      ))}

      <PhotoPicker
        value={null}
        onChange={(src) => {
          if (src && isAllowedPhoto(src)) onChange([...photos, src]);
        }}
        onError={onError}
      />
      <p className="text-xs text-ink-2">
        {photos.length} photo{photos.length > 1 ? "s" : ""} — choisissez-en une pour l&apos;ajouter à
        la suite.
      </p>
    </div>
  );
}

/** Un élément (carte, atout, étape, offre) et ses seuls champs utiles. */
function ItemEditor({
  item,
  index,
  count,
  fields,
  itemLabel,
  onChange,
  onMove,
  onRemove,
  onError,
}: {
  item: SectionItem;
  index: number;
  count: number;
  fields: ItemField[];
  itemLabel: string;
  onChange: (patch: Partial<SectionItem>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onError: (message: string) => void;
}) {
  const uid = useId();

  return (
    <div className="rounded-xl border border-line bg-page p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-2">
          {itemLabel} {index + 1}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Monter ${itemLabel} ${index + 1}`}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line disabled:opacity-30"
          >
            <Icon name="chevDown" size={15} className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label={`Descendre ${itemLabel} ${index + 1}`}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line disabled:opacity-30"
          >
            <Icon name="chevDown" size={15} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Supprimer ${itemLabel} ${index + 1}`}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-brick hover:bg-brick/10"
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.includes("title") && (
          <div className={fields.includes("text") ? "" : "sm:col-span-2"}>
            <label htmlFor={`${uid}-titre`} className={LABEL}>
              Titre
            </label>
            <input
              id={`${uid}-titre`}
              className={INPUT}
              value={item.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </div>
        )}

        {fields.includes("priceCents") && (
          <div>
            <label htmlFor={`${uid}-prix`} className={LABEL}>
              Prix (€)
            </label>
            <input
              id={`${uid}-prix`}
              type="number"
              step="0.10"
              min="0"
              className={INPUT}
              value={item.priceCents === null ? "" : toEuros(item.priceCents)}
              onChange={(e) =>
                onChange({ priceCents: e.target.value === "" ? null : (toCents(e.target.value) ?? 0) })
              }
            />
          </div>
        )}

        {fields.includes("icon") && (
          <div>
            <label htmlFor={`${uid}-icone`} className={LABEL}>
              Icône
            </label>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                {item.icon && <Icon name={item.icon} size={18} />}
              </span>
              <select
                id={`${uid}-icone`}
                className={INPUT}
                value={item.icon ?? ""}
                onChange={(e) => onChange({ icon: (e.target.value || null) as IconName | null })}
              >
                <option value="">Aucune</option>
                {ICON_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {fields.includes("href") && (
          <div>
            <label htmlFor={`${uid}-lien`} className={LABEL}>
              Lien
            </label>
            <input
              id={`${uid}-lien`}
              className={INPUT}
              placeholder="/carte"
              value={item.href}
              onChange={(e) => onChange({ href: e.target.value })}
            />
          </div>
        )}

        {fields.includes("badge") && (
          <div>
            <label htmlFor={`${uid}-mention`} className={LABEL}>
              Mention
            </label>
            <input
              id={`${uid}-mention`}
              className={INPUT}
              placeholder="Sur le pouce"
              value={item.badge}
              onChange={(e) => onChange({ badge: e.target.value })}
            />
          </div>
        )}

        {fields.includes("text") && (
          <div className="sm:col-span-2">
            <label htmlFor={`${uid}-texte`} className={LABEL}>
              Description
            </label>
            <textarea
              id={`${uid}-texte`}
              rows={2}
              className={INPUT}
              value={item.text}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </div>
        )}

        {fields.includes("photo") && (
          <div className="sm:col-span-2">
            <span className={LABEL}>Photo</span>
            <PhotoPicker
              value={item.photo}
              onChange={(src) => onChange({ photo: src })}
              onError={onError}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Éditeur d'une section ────────────────────────────────────

function SectionEditor({
  section,
  onChange,
  onError,
}: {
  section: PageSectionView;
  onChange: (content: SectionContent) => void;
  onError: (message: string) => void;
}) {
  const meta = KIND_META[section.kind];
  const c = section.content;
  const uid = useId();
  const patch = (p: Partial<SectionContent>) => onChange({ ...c, ...p });

  /** Un champ n'est proposé que si le type de bloc le consomme réellement. */
  const has = (f: SectionField) => meta.fields.includes(f);

  const setItem = (index: number, p: Partial<SectionItem>) =>
    patch({ items: c.items.map((it, i) => (i === index ? { ...it, ...p } : it)) });

  const moveItem = (index: number, dir: -1 | 1) => {
    const next = [...c.items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ items: next });
  };

  const addItem = () =>
    patch({
      items: [
        ...c.items,
        {
          // Identifiant unique sans dépendre de l'horloge : la position suffit,
          // et deux ajouts successifs ne peuvent pas se retrouver avec la même
          // clé puisque la liste grandit à chaque fois.
          id: `i${c.items.length}-${c.items.length + Math.floor(Math.random() * 1000)}`,
          title: "",
          text: "",
          photo: null,
          icon: null,
          href: "",
          priceCents: has("items") && meta.itemFields.includes("priceCents") ? 0 : null,
          badge: "",
        },
      ],
    });

  return (
    <div className="space-y-5 border-t border-line bg-panel-2 p-5">
      <p className="text-sm text-ink-2">{meta.hint}</p>

      {meta.dynamic && (
        <p className="flex items-start gap-2 rounded-xl bg-teal/10 px-4 py-3 text-sm text-teal">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
          Le contenu de ce bloc vient de la base (plats, formules, zones, réglages). Vous réglez ici
          son titre et son habillage ; le reste se modifie dans l&apos;écran concerné.
        </p>
      )}

      {/* ── Textes ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {has("eyebrow") && (
          <div>
            <label htmlFor={`${uid}-accroche`} className={LABEL}>
              Accroche (petite ligne au-dessus du titre)
            </label>
            <input
              id={`${uid}-accroche`}
              className={INPUT}
              value={c.eyebrow}
              onChange={(e) => patch({ eyebrow: e.target.value })}
            />
          </div>
        )}

        {has("title") && (
          <div>
            <label htmlFor={`${uid}-titre`} className={LABEL}>
              Titre
            </label>
            <input
              id={`${uid}-titre`}
              className={INPUT}
              value={c.title}
              onChange={(e) => patch({ title: e.target.value })}
              aria-describedby={`${uid}-titre-aide`}
            />
            <p id={`${uid}-titre-aide`} className="mt-1 text-xs text-ink-2">
              Entourez un passage d&apos;étoiles pour l&apos;écrire en manuscrit doré :
              <span className="font-semibold"> Le voyage *des saveurs*</span>
            </p>
          </div>
        )}
      </div>

      {has("subtitle") && (
        <Field label="Sous-titre">
          <textarea
            rows={2}
            className={INPUT}
            value={c.subtitle}
            onChange={(e) => patch({ subtitle: e.target.value })}
          />
        </Field>
      )}

      {has("body") && (
        <Field
          label="Texte"
          hint="Laissez une ligne vide entre deux paragraphes. Encadrez un passage de deux étoiles pour le mettre en valeur : **fait maison**."
        >
          <textarea
            rows={6}
            className={INPUT}
            value={c.body}
            onChange={(e) => patch({ body: e.target.value })}
          />
        </Field>
      )}

      {/* ── Habillage ──────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {has("theme") && (
          <Field label="Fond de la section">
            <div className="flex flex-wrap gap-2">
              {THEMES.map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => patch({ theme: th })}
                  aria-pressed={c.theme === th}
                  className={`${CHIP} border ${
                    c.theme === th
                      ? "border-primary bg-primary text-white"
                      : "border-line hover:bg-panel"
                  }`}
                >
                  {THEME_LABEL[th]}
                </button>
              ))}
            </div>
          </Field>
        )}

        {has("columns") && (
          <Field label="Colonnes (sur grand écran)">
            <div className="flex flex-wrap gap-2">
              {COLUMNS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => patch({ columns: n })}
                  aria-pressed={c.columns === n}
                  className={`${CHIP} border ${
                    c.columns === n
                      ? "border-primary bg-primary text-white"
                      : "border-line hover:bg-panel"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
        )}

        {has("limit") && (
          <div>
            <label htmlFor={`${uid}-nombre`} className={LABEL}>
              Nombre d&apos;éléments affichés
            </label>
            <input
              id={`${uid}-nombre`}
              type="number"
              min="1"
              max="24"
              className={INPUT}
              value={c.limit}
              onChange={(e) => patch({ limit: Number(e.target.value) || 1 })}
            />
          </div>
        )}

        {has("reverse") && (
          <Field label="Disposition">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.reverse}
                onChange={(e) => patch({ reverse: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Texte à droite, photos à gauche
            </label>
          </Field>
        )}
      </div>

      {/* ── Boutons ────────────────────────────────────── */}
      {(has("cta") || has("alt")) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {has("cta") && (
            <div className="rounded-xl border border-line p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-2">
                Bouton principal
              </p>
              <div className="grid gap-2">
                <input
                  className={INPUT}
                  placeholder="Libellé — Commander"
                  aria-label="Libellé du bouton principal"
                  value={c.ctaLabel}
                  onChange={(e) => patch({ ctaLabel: e.target.value })}
                />
                <input
                  className={INPUT}
                  placeholder="Lien — /carte"
                  aria-label="Lien du bouton principal"
                  value={c.ctaHref}
                  onChange={(e) => patch({ ctaHref: e.target.value })}
                />
              </div>
            </div>
          )}
          {has("alt") && (
            <div className="rounded-xl border border-line p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-2">
                Bouton secondaire
              </p>
              <div className="grid gap-2">
                <input
                  className={INPUT}
                  placeholder="Libellé — Notre histoire"
                  aria-label="Libellé du bouton secondaire"
                  value={c.altLabel}
                  onChange={(e) => patch({ altLabel: e.target.value })}
                />
                <input
                  className={INPUT}
                  placeholder="Lien — /a-propos"
                  aria-label="Lien du bouton secondaire"
                  value={c.altHref}
                  onChange={(e) => patch({ altHref: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Photos ─────────────────────────────────────── */}
      {has("photos") && (
        <Field
          label="Photos"
          hint={
            section.kind === "hero"
              ? "La première sert de fond au bandeau, la seconde de vignette à droite."
              : undefined
          }
        >
          <PhotoListField
            photos={c.photos}
            onChange={(photos) => patch({ photos })}
            onError={onError}
          />
        </Field>
      )}

      {/* ── Éléments ───────────────────────────────────── */}
      {has("items") && meta.itemFields.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-2">
            {meta.itemLabel}s de la section
          </p>
          {c.items.map((item, i) => (
            <ItemEditor
              key={item.id}
              item={item}
              index={i}
              count={c.items.length}
              fields={meta.itemFields}
              itemLabel={meta.itemLabel}
              onChange={(p) => setItem(i, p)}
              onMove={(dir) => moveItem(i, dir)}
              onRemove={() => patch({ items: c.items.filter((_, j) => j !== i) })}
              onError={onError}
            />
          ))}
          <button
            type="button"
            onClick={addItem}
            disabled={c.items.length >= 12}
            className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel disabled:opacity-40"
          >
            <Icon name="plus" size={16} /> Ajouter {meta.itemArticle} {meta.itemLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Écran ────────────────────────────────────────────────────

export function ContenuAdmin() {
  const [page, setPage] = useState<PageSlug>("accueil");
  const [sections, setSections] = useState<PageSectionView[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const fail = useCallback((text: string) => setNotice({ tone: "erreur", text }), []);

  const load = useCallback(
    async (slug: PageSlug) => {
      setReady(false);
      try {
        const res = await fetch(`/api/page-sections?page=${slug}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Chargement impossible");
        setSections((await res.json()) as PageSectionView[]);
        setDirty(new Set());
      } catch {
        fail("Les sections n'ont pas pu être chargées.");
      } finally {
        setReady(true);
      }
    },
    [fail],
  );

  useEffect(() => {
    void load(page);
  }, [page, load]);

  /* Sections déjà présentes dont le type ne peut figurer qu'une fois : le menu
   * d'ajout les grise plutôt que de laisser l'API refuser après coup. */
  const usedOnce = useMemo(
    () => new Set(sections.filter((s) => KIND_META[s.kind].once).map((s) => s.kind)),
    [sections],
  );

  const editContent = (id: string, content: SectionContent) => {
    setSections((cur) => cur.map((s) => (s.id === id ? { ...s, content } : s)));
    setDirty((cur) => new Set(cur).add(id));
  };

  const save = async (section: PageSectionView) => {
    setSaving(section.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/page-sections/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: section.label, content: section.content }),
      });
      const data = (await res.json()) as PageSectionView | { error?: string };
      if (!res.ok) throw new Error(("error" in data && data.error) || "Enregistrement refusé");
      // On réinjecte la réponse : le serveur a pu écarter un lien ou une photo
      // non autorisés, et l'écran doit montrer ce qui est réellement en base.
      setSections((cur) => cur.map((s) => (s.id === section.id ? (data as PageSectionView) : s)));
      setDirty((cur) => {
        const next = new Set(cur);
        next.delete(section.id);
        return next;
      });
      setNotice({ tone: "ok", text: "Section enregistrée. La page publique est à jour." });
    } catch (e) {
      fail(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(null);
    }
  };

  const toggleVisible = async (section: PageSectionView) => {
    const visible = !section.visible;
    setSections((cur) => cur.map((s) => (s.id === section.id ? { ...s, visible } : s)));
    try {
      const res = await fetch(`/api/page-sections/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSections((cur) =>
        cur.map((s) => (s.id === section.id ? { ...s, visible: !visible } : s)),
      );
      fail("Le changement de visibilité n'a pas été enregistré.");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
    setBusy(true);
    try {
      const res = await fetch("/api/page-sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, order: next.map((s) => s.id) }),
      });
      if (!res.ok) throw new Error();
      setSections((await res.json()) as PageSectionView[]);
    } catch {
      setSections(sections); // ordre d'origine : l'écran ne ment pas sur la base
      fail("Le nouvel ordre n'a pas été enregistré.");
    } finally {
      setBusy(false);
    }
  };

  const add = async (kind: SectionKind) => {
    setAddOpen(false);
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/page-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, kind }),
      });
      const data = (await res.json()) as PageSectionView | { error?: string };
      if (!res.ok) throw new Error(("error" in data && data.error) || "Ajout refusé");
      const created = data as PageSectionView;
      setSections((cur) => [...cur, created]);
      setOpenId(created.id);
      setNotice({ tone: "ok", text: `« ${KIND_META[kind].label} » ajouté en bas de page.` });
    } catch (e) {
      fail(e instanceof Error ? e.message : "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/page-sections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSections((cur) => cur.filter((s) => s.id !== id));
      setNotice({ tone: "ok", text: "Section supprimée." });
    } catch {
      fail("La suppression a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    setBusy(true);
    try {
      const res = await fetch("/api/page-sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, reset: true }),
      });
      if (!res.ok) throw new Error();
      setSections((await res.json()) as PageSectionView[]);
      setDirty(new Set());
      setNotice({ tone: "ok", text: "Page remise dans son état d'origine." });
    } catch {
      fail("La réinitialisation a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Contenu du site</h1>
          <p className="max-w-2xl text-ink-2">
            Ajoutez, déplacez, masquez ou supprimez les sections de vos pages de présentation. Vos
            modifications apparaissent sur le site dès l&apos;enregistrement.
          </p>
        </div>
        <Link
          href={PAGE_PATH[page]}
          target="_blank"
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel-2"
        >
          <Icon name="arrow" size={16} /> Voir la page
        </Link>
      </div>

      {/* Onglets de page */}
      <div className="flex flex-wrap gap-2">
        {PAGES.map((slug) => (
          <button
            key={slug}
            type="button"
            onClick={() => {
              setPage(slug);
              setOpenId(null);
            }}
            aria-pressed={page === slug}
            className={`${CHIP} border ${
              page === slug ? "border-primary bg-primary text-white" : "border-line hover:bg-panel-2"
            }`}
          >
            {PAGE_LABEL[slug]}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="min-h-6">
        {notice && (
          <p
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
              notice.tone === "ok" ? "bg-primary-soft text-brick" : "bg-brick/10 text-brick"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      {!ready ? (
        <p className="py-20 text-center text-ink-2">Chargement…</p>
      ) : (
        <>
          <div className="space-y-3">
            {sections.map((section, index) => {
              const meta = KIND_META[section.kind];
              const open = openId === section.id;
              const modified = dirty.has(section.id);

              return (
                <div
                  key={section.id}
                  className={`overflow-hidden rounded-[var(--radius-card)] border bg-panel shadow-[var(--shadow-soft)] ${
                    open ? "border-primary/50" : "border-line"
                  } ${section.visible ? "" : "opacity-70"}`}
                >
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <Icon name={meta.icon} size={18} />
                    </span>

                    {/* Une largeur de base plutôt que `flex-1` : la barre des
                        cinq boutons est `shrink-0`, donc le nom de la section
                        était le seul à céder et il disparaissait complètement
                        sous 400 px — on déplaçait et on supprimait des sections
                        à l'aveugle. En partant de 12 rem, ce sont les boutons
                        qui passent à la ligne. */}
                    <div className="min-w-0 grow basis-48">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {section.label || meta.label}
                        {!section.visible && (
                          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-2">
                            Masquée
                          </span>
                        )}
                        {modified && (
                          <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-brick">
                            Non enregistrée
                          </span>
                        )}
                      </p>
                      <p className="truncate text-sm text-ink-2">
                        {meta.label}
                        {section.content.title ? ` · ${section.content.title}` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0 || busy}
                        aria-label="Monter la section"
                        className="grid h-9 w-9 place-items-center rounded-lg border border-line disabled:opacity-30"
                      >
                        <Icon name="chevDown" size={16} className="rotate-180" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === sections.length - 1 || busy}
                        aria-label="Descendre la section"
                        className="grid h-9 w-9 place-items-center rounded-lg border border-line disabled:opacity-30"
                      >
                        <Icon name="chevDown" size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleVisible(section)}
                        aria-label={section.visible ? "Masquer la section" : "Afficher la section"}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-line hover:bg-panel-2"
                      >
                        <Icon name={section.visible ? "check" : "lock"} size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : section.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-panel-2"
                        aria-expanded={open}
                      >
                        <Icon name="edit" size={15} /> {open ? "Fermer" : "Modifier"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(section.id)}
                        aria-label="Supprimer la section"
                        className="grid h-9 w-9 place-items-center rounded-lg border border-line text-brick hover:bg-brick/10"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>

                  {confirmDelete === section.id && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-brick/5 px-4 py-3">
                      <p className="text-sm font-semibold text-brick">
                        Supprimer « {section.label || meta.label} » ? Cette section disparaîtra du
                        site.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(section.id)}
                          className="rounded-full bg-brick px-4 py-1.5 text-sm font-bold text-white"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  )}

                  {open && (
                    <>
                      <SectionEditor
                        section={section}
                        onChange={(content) => editContent(section.id, content)}
                        onError={fail}
                      />
                      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-panel-2 px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setOpenId(null)}
                          className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel"
                        >
                          Fermer
                        </button>
                        <button
                          type="button"
                          onClick={() => save(section)}
                          disabled={saving === section.id}
                          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-50"
                        >
                          {saving === section.id ? "Enregistrement…" : "Enregistrer"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {sections.length === 0 && (
              <p className="rounded-[var(--radius-card)] border border-dashed border-line p-10 text-center text-ink-2">
                Cette page n&apos;a aucune section. Ajoutez-en une ci-dessous.
              </p>
            )}
          </div>

          {/* ── Ajouter ──────────────────────────────────── */}
          <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              aria-expanded={addOpen}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-white transition hover:brightness-105"
            >
              <Icon name="plus" size={18} /> Ajouter une section
            </button>

            {addOpen && (
              <div className="mt-4 space-y-5">
                {KIND_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-2">
                      {group.title}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {group.kinds.map((kind) => {
                        const meta = KIND_META[kind];
                        const taken = meta.once && usedOnce.has(kind);
                        return (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => add(kind)}
                            disabled={taken || busy}
                            title={taken ? "Déjà présent sur cette page" : undefined}
                            className="flex items-start gap-3 rounded-xl border border-line p-3 text-left transition hover:border-primary/50 hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                              <Icon name={meta.icon} size={17} />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold">{meta.label}</span>
                              <span className="block text-xs text-ink-2">{meta.hint}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Filet de sécurité ────────────────────────── */}
          <div className="rounded-[var(--radius-card)] border border-line bg-panel-2 p-5">
            {confirmReset ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-brick">
                  Remettre « {PAGE_LABEL[page]} » dans son état d&apos;origine ? Toutes vos
                  modifications sur cette page seront perdues.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-full bg-brick px-4 py-1.5 text-sm font-bold text-white"
                  >
                    Réinitialiser
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-2">
                  Une manipulation malheureuse ? Vous pouvez revenir au contenu d&apos;origine de
                  cette page.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel disabled:opacity-40"
                >
                  <Icon name="refresh" size={16} /> Réinitialiser la page
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
