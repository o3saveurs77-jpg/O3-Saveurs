"use client";

import { useMemo, useState } from "react";
import { useDishes } from "@/components/providers/DishesContext";
import { cats, fmtPrice } from "@/lib/menu";
import type { Dish, Badge } from "@/lib/menu";
import { Icon } from "@/components/Icon";

const BADGES: Badge[] = [null, "Healthy", "Nouveau", "Bientôt"];

function PhotoUploader({
  photo,
  onUploaded,
}: {
  photo: string | null;
  onUploaded: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (file: File) => {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Upload échoué.");
      onUploaded(body.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-soft)] border border-line bg-panel-2">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink-2">
            <Icon name="image" size={20} />
          </div>
        )}
      </div>
      <div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel-2">
          <Icon name="upload" size={16} />
          {busy ? "Envoi…" : "Téléverser une photo"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
        </label>
        {err && <p className="mt-1 text-xs font-semibold text-brick">{err}</p>}
      </div>
    </div>
  );
}

export function PlatsAdmin() {
  const { dishes, ready, toggleAvailable, togglePopular, update, add, remove, reset } = useDishes();
  const [editing, setEditing] = useState<Dish | "new" | null>(null);
  const [catFilter, setCatFilter] = useState("all");

  const shown = useMemo(
    () => (catFilter === "all" ? dishes : dishes.filter((d) => d.cat === catFilter)),
    [dishes, catFilter]
  );

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Gestion des plats</h1>
          <p className="text-ink-2">{dishes.length} plats au catalogue.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="rounded-full border border-line bg-panel px-4 py-2.5 text-sm font-semibold hover:bg-panel-2"
          >
            Recharger
          </button>
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white hover:brightness-105"
          >
            <Icon name="plus" size={16} /> Ajouter un plat
          </button>
        </div>
      </div>

      {/* filtre catégorie */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Chip on={catFilter === "all"} onClick={() => setCatFilter("all")}>
          Toutes
        </Chip>
        {cats.map((c) => (
          <Chip key={c.id} on={catFilter === c.id} onClick={() => setCatFilter(c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-panel-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-3 font-semibold">Plat</th>
              <th className="px-4 py-3 font-semibold">Catégorie</th>
              <th className="px-4 py-3 font-semibold">Prix</th>
              <th className="px-4 py-3 text-center font-semibold">Populaire</th>
              <th className="px-4 py-3 text-center font-semibold">Disponible</th>
              <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                      {d.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.photo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="ph h-full w-full"><span className="glyph text-base">Ô3</span></div>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold">{d.name}</p>
                      {d.badge && <span className="text-xs text-ink-2">{d.badge}</span>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-2">{cats.find((c) => c.id === d.cat)?.label}</td>
                <td className="px-4 py-3">
                  <PriceEdit value={d.price} onChange={(price) => update(d.id, { price })} />
                </td>
                <td className="px-4 py-3 text-center">
                  <Toggle on={d.popular} onClick={() => togglePopular(d.id)} label={`Mise en avant ${d.name}`} />
                </td>
                <td className="px-4 py-3 text-center">
                  <Toggle on={d.available} onClick={() => toggleAvailable(d.id)} label={`Disponibilité ${d.name}`} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setEditing(d)}
                      className="grid h-8 w-8 place-items-center rounded-full hover:bg-panel-2"
                      aria-label="Modifier"
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      onClick={() => remove(d.id)}
                      className="grid h-8 w-8 place-items-center rounded-full text-brick hover:bg-brick/10"
                      aria-label="Supprimer"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <DishEditor
          dish={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === "new") add(data);
            else update(editing.id, data);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PriceEdit({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = parseFloat(v.replace(",", "."));
        onChange(isNaN(n) ? null : n);
      }}
      placeholder="—"
      className="w-20 rounded-lg border border-line bg-page px-2 py-1.5 text-sm outline-none focus:border-primary"
    />
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-6 w-11 rounded-full transition ${on ? "bg-teal" : "bg-line"}`}
      aria-pressed={on}
      aria-label={label ?? "Basculer"}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        on ? "bg-brick text-white" : "bg-panel-2 text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function DishEditor({
  dish,
  onClose,
  onSave,
}: {
  dish: Dish | null;
  onClose: () => void;
  onSave: (data: Omit<Dish, "id">) => void;
}) {
  const [f, setF] = useState<Omit<Dish, "id">>(
    dish ?? {
      cat: cats[0].id,
      name: "",
      desc: "",
      price: null,
      badge: null,
      photo: null,
      options: [],
      tags: [],
      spice: 0,
      popular: false,
      available: true,
    }
  );
  const cls = "w-full rounded-[var(--radius-soft)] border border-line bg-page px-3 py-2.5 outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-page p-6 shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl">{dish ? "Modifier le plat" : "Nouveau plat"}</h2>
          <button onClick={onClose} aria-label="Fermer"><Icon name="x" size={20} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-2">Nom</label>
            <input className={cls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-2">Description</label>
            <textarea className={cls} rows={2} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-2">Catégorie</label>
              <select className={cls} value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-2">Prix (€)</label>
              <input
                className={cls}
                value={f.price == null ? "" : f.price}
                onChange={(e) => {
                  const n = parseFloat(e.target.value.replace(",", "."));
                  setF({ ...f, price: isNaN(n) ? null : n });
                }}
                placeholder="À définir"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-2">Badge</label>
              <select
                className={cls}
                value={f.badge ?? ""}
                onChange={(e) => setF({ ...f, badge: (e.target.value || null) as Badge })}
              >
                {BADGES.map((b) => (
                  <option key={b ?? "none"} value={b ?? ""}>{b ?? "Aucun"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-2">Photo (URL)</label>
              <input
                className={cls}
                value={f.photo ?? ""}
                onChange={(e) => setF({ ...f, photo: e.target.value || null })}
                placeholder="/photos/p00.jpg ou https://…"
              />
            </div>
          </div>
          <PhotoUploader photo={f.photo} onUploaded={(url) => setF({ ...f, photo: url })} />
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={f.popular} onChange={(e) => setF({ ...f, popular: e.target.checked })} />
              Mise en avant
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} />
              Disponible
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-line px-5 py-2.5 font-semibold hover:bg-panel-2">
            Annuler
          </button>
          <button
            onClick={() => f.name && onSave(f)}
            className="rounded-full bg-primary px-6 py-2.5 font-bold text-white hover:brightness-105"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
