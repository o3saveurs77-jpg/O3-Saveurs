"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthContext";
import { useOrders } from "@/components/providers/OrdersContext";
import { useDishes } from "@/components/providers/DishesContext";
import { fmtPrice } from "@/lib/menu";
import { STATUS_LABEL } from "@/lib/types";
import type { OrderStatus } from "@/lib/types";
import { Icon, type IconName } from "@/components/Icon";

// Contrastes revus : `text-primary` sur `bg-primary-soft` plafonnait à 2,48:1 et
// `text-teal` à 2,46:1, tous deux sous le seuil WCAG AA de 4,5:1.
const STATUS_COLOR: Record<OrderStatus, string> = {
  en_attente_paiement: "bg-brick/10 text-brick",
  confirmee: "bg-gold/20 text-[#7a5f00]",
  cuisine: "bg-primary-soft text-brick",
  route: "bg-teal/15 text-[#0f6b5e]",
  livree: "bg-[#e9f7f4] text-[#0f6b5e]",
  annulee: "bg-brick/10 text-brick",
};

type Tab = "commandes" | "factures" | "adresses" | "favoris" | "profil";

const TABS: { k: Tab; label: string; icon: IconName }[] = [
  { k: "commandes", label: "Mes commandes", icon: "list" },
  { k: "factures", label: "Factures", icon: "euro" },
  { k: "adresses", label: "Adresses", icon: "pin" },
  { k: "favoris", label: "Favoris", icon: "heart" },
  { k: "profil", label: "Profil", icon: "user" },
];

export function AccountClient() {
  const { user, ready, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("commandes");

  if (!ready) return <div className="wrap py-24 text-center text-ink-2">Chargement…</div>;

  if (!user) return <AuthForm />;

  return (
    <div className="wrap py-10">
      {/* en-tête */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">Bonjour, {user.name.split(" ")[0]} 👋</h1>
          <p className="text-ink-2">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {user.role === "ADMIN" && (
            <Link
              href="/admin"
              className="rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:brightness-105"
            >
              Back-office
            </Link>
          )}
          <button
            onClick={logout}
            className="rounded-full border border-line bg-panel px-5 py-2.5 font-semibold hover:bg-panel-2"
          >
            Se déconnecter
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        {/* onglets — rail défilant sous `md`, colonne au-delà */}
        <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-3 text-left font-semibold transition ${
                tab === t.k ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-panel-2"
              }`}
            >
              <Icon name={t.icon} size={18} /> {t.label}
            </button>
          ))}
        </nav>

        {/* contenu */}
        <div>
          {tab === "commandes" && <OrdersTab />}
          {tab === "factures" && <InvoicesTab />}
          {tab === "adresses" && <AddressesTab />}
          {tab === "favoris" && <FavoritesTab />}
          {tab === "profil" && <ProfileTab />}
        </div>
      </div>
    </div>
  );
}

function AuthForm() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res =
      mode === "login"
        ? await login(email, password)
        : await register(name, email, password);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Une erreur est survenue.");
  };

  const cls =
    "w-full rounded-xl border border-line bg-panel-2 px-4 py-3 outline-none focus:border-primary";

  return (
    <div className="wrap flex justify-center py-16">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-panel p-8 shadow-[var(--shadow-soft)]">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
          <Icon name="user" size={28} />
        </div>
        <h1 className="mt-4 text-center text-2xl">
          {mode === "login" ? "Votre espace" : "Créer un compte"}
        </h1>
        <p className="mt-2 text-center text-sm text-ink-2">
          {mode === "login"
            ? "Connectez-vous pour suivre vos commandes, factures et favoris."
            : "Inscrivez-vous pour commander plus vite la prochaine fois."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === "register" && (
            <input
              className={cls}
              placeholder="Nom complet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          )}
          <input
            className={cls}
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className={cls}
            type="password"
            required
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {error && <p className="text-sm font-semibold text-brick">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-primary px-6 py-3.5 font-bold text-white hover:brightness-105 disabled:opacity-60"
          >
            {busy ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="mt-4 w-full text-center text-sm font-semibold text-primary hover:underline"
        >
          {mode === "login" ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}

function useMyOrders() {
  const { user } = useAuth();
  const { orders } = useOrders();
  return orders.filter((o) => o.customer.email === user?.email);
}

function dateFr(ts: number) {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function OrdersTab() {
  const mine = useMyOrders();
  if (mine.length === 0)
    return (
      <Empty icon="list" title="Aucune commande pour l'instant">
        <Link href="/carte" className="rounded-full bg-primary px-5 py-2.5 font-bold text-white">
          Commander
        </Link>
      </Empty>
    );
  return (
    <ul className="space-y-3">
      {mine.map((o) => (
        <li key={o.id} className="rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-bold">{o.ref}</span>
              <span className="ml-2 text-sm text-ink-2">{dateFr(o.createdAt)}</span>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_COLOR[o.status]}`}>
              {STATUS_LABEL[o.status]}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-2">
            {o.lines.map((l) => `${l.qty}× ${l.name}`).join(" · ")}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="font-bold text-brick">{fmtPrice(o.totalCents)}</span>
            <div className="flex gap-2">
              <Link href={`/commande/${o.id}`} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel-2">
                Suivre
              </Link>
              <Link href={`/facture/${o.id}`} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-105">
                Facture
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function InvoicesTab() {
  const mine = useMyOrders().filter((o) => o.paid);
  if (mine.length === 0) return <Empty icon="euro" title="Aucune facture disponible" />;
  return (
    /* `overflow-hidden` seul rognait la table sur téléphone : les quatre
       colonnes ne tiennent pas sous 460 px et la colonne « PDF » était
       simplement coupée, sans moyen de l'atteindre. On défile. */
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]">
      <table className="w-full min-w-[30rem] text-sm">
        <thead className="bg-panel-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-3 font-semibold">Référence</th>
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-4 py-3 font-semibold">Montant</th>
            <th className="px-4 py-3"><span className="sr-only">Télécharger</span></th>
          </tr>
        </thead>
        <tbody>
          {mine.map((o) => (
            <tr key={o.id} className="border-t border-line">
              <td className="px-4 py-3 font-semibold">{o.ref}</td>
              <td className="px-4 py-3 text-ink-2">{dateFr(o.createdAt)}</td>
              <td className="px-4 py-3 font-semibold">{fmtPrice(o.totalCents)}</td>
              <td className="px-4 py-3 text-right">
                <Link href={`/facture/${o.id}`} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                  <Icon name="arrow" size={15} /> PDF
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddressesTab() {
  const { user, addAddress, removeAddress } = useAuth();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ label: "Domicile", address: "", zip: "", city: "" });
  const cls = "w-full rounded-[var(--radius-soft)] border border-line bg-page px-3 py-2.5 outline-none focus:border-primary";

  return (
    <div className="space-y-3">
      {user!.addresses.map((a) => (
        <div key={a.id} className="flex items-start justify-between rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]">
          <div className="flex gap-3">
            <Icon name="pin" size={20} className="mt-0.5 text-primary" />
            <div>
              <p className="font-bold">{a.label}</p>
              <p className="text-sm text-ink-2">{a.address}, {a.zip} {a.city}</p>
            </div>
          </div>
          <button onClick={() => removeAddress(a.id)} className="text-ink-2 hover:text-brick" aria-label="Supprimer">
            <Icon name="x" size={18} />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-panel p-4">
          <input className={cls} placeholder="Libellé (Domicile, Bureau…)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <input className={cls} placeholder="Adresse" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className={cls} placeholder="Code postal" value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} />
            <input className={cls} placeholder="Ville" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (f.address && f.city) {
                  addAddress(f);
                  setF({ label: "Domicile", address: "", zip: "", city: "" });
                  setAdding(false);
                }
              }}
              className="rounded-full bg-primary px-5 py-2.5 font-bold text-white"
            >
              Enregistrer
            </button>
            <button onClick={() => setAdding(false)} className="rounded-full border border-line px-5 py-2.5 font-semibold">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line py-4 font-semibold text-ink-2 hover:bg-panel-2"
        >
          <Icon name="plus" size={18} /> Ajouter une adresse
        </button>
      )}
    </div>
  );
}

function FavoritesTab() {
  const { user, toggleFavorite } = useAuth();
  const { dishes } = useDishes();
  const favs = dishes.filter((i) => user!.favorites.includes(i.id));
  if (favs.length === 0)
    return (
      <Empty icon="heart" title="Aucun favori">
        <p className="text-sm text-ink-2">Touchez le ♥ sur un plat de la carte pour l'ajouter.</p>
      </Empty>
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {favs.map((d) => (
        <div key={d.id} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-panel p-3 shadow-[var(--shadow-soft)]">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
            {d.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.photo} alt={d.name} className="h-full w-full object-cover" />
            ) : (
              <div className="ph h-full w-full"><span className="glyph text-xl">Ô3</span></div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{d.name}</p>
            <p className="text-sm text-brick">
              {d.priceCents != null ? fmtPrice(d.priceCents) : "Bientôt"}
            </p>
          </div>
          <button onClick={() => toggleFavorite(d.id)} className="text-brick" aria-label="Retirer des favoris">
            <Icon name="heart" size={20} fill />
          </button>
        </div>
      ))}
    </div>
  );
}

function ProfileTab() {
  const { user, update } = useAuth();
  const [f, setF] = useState({ name: user!.name, email: user!.email, phone: user!.phone });
  const [saved, setSaved] = useState(false);
  const cls = "w-full rounded-[var(--radius-soft)] border border-line bg-page px-4 py-3 outline-none focus:border-primary";
  return (
    <div className="max-w-md rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
      <h2 className="mb-4 text-lg">Vos informations</h2>
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink-2">Nom</label>
          <input className={cls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink-2">Email</label>
          <input className={cls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink-2">Téléphone</label>
          <input className={cls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <button
          onClick={() => {
            update(f);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
          className="rounded-full bg-primary px-6 py-3 font-bold text-white hover:brightness-105"
        >
          {saved ? "Enregistré ✓" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function Empty({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line bg-panel py-16 text-center shadow-[var(--shadow-soft)]">
      <Icon name={icon} size={44} className="text-ink-2 opacity-30" />
      <p className="text-lg font-bold">{title}</p>
      {children}
    </div>
  );
}
