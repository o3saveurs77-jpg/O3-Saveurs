"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Accès & rôles.
 *
 * Qui entre dans le back-office, et comment l'y autoriser ou l'en sortir, sans
 * passer par le dashboard Auth0. Les rôles vivent chez Auth0 — cet écran ne
 * fait que les lire et les écrire ; la base applicative n'a pas voix au
 * chapitre sur les droits d'administration.
 */

interface Account {
  userId: string;
  email: string;
  name: string;
  picture: string | null;
  lastLogin: string | null;
  loginsCount: number;
  roles: string[];
}

type Notice = { tone: "ok" | "erreur"; text: string } | null;

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function RolesAdmin() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [me, setMe] = useState("");
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roles", { cache: "no-store" });
      const data = (await res.json()) as { accounts?: Account[]; me?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Chargement impossible");
      setAccounts(data.accounts ?? []);
      setMe(data.me ?? "");
    } catch (e) {
      setNotice({
        tone: "erreur",
        text: e instanceof Error ? e.message : "Les comptes n'ont pas pu être chargés.",
      });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const admins = useMemo(() => accounts.filter((a) => a.roles.includes("ADMIN")), [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.email.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const setRole = async (account: Account, grant: boolean) => {
    setBusy(account.userId);
    setNotice(null);
    setConfirmRevoke(null);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account.userId, role: "ADMIN", grant }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Modification refusée");
      setNotice({ tone: "ok", text: data.message ?? "C'est fait." });
      await load();
    } catch (e) {
      setNotice({
        tone: "erreur",
        text: e instanceof Error ? e.message : "Modification impossible.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Accès &amp; rôles</h1>
        <p className="max-w-2xl text-ink-2">
          Qui peut entrer dans le back-office. Les comptes viennent d&apos;Auth0 : une personne
          apparaît ici après s&apos;être connectée au moins une fois sur le site.
        </p>
      </div>

      <div aria-live="polite" className="min-h-6">
        {notice && (
          <p
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
              notice.tone === "ok" ? "bg-teal/10 text-teal" : "bg-brick/10 text-brick"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      {!ready ? (
        <p className="py-20 text-center text-ink-2">Chargement des comptes…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2">
              <strong className="text-ink">{admins.length}</strong> administrateur
              {admins.length > 1 ? "s" : ""} · {accounts.length} compte
              {accounts.length > 1 ? "s" : ""}
            </p>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un email…"
              aria-label="Rechercher un compte"
              className="w-full max-w-xs rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-3">
            {filtered.map((a) => {
              const admin = a.roles.includes("ADMIN");
              const cestMoi = a.email.toLowerCase() === me.toLowerCase();
              const dernierAdmin = admin && admins.length <= 1;
              const bloque = cestMoi || dernierAdmin;

              return (
                <div
                  key={a.userId}
                  className="rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel-2 font-bold text-brick">
                      {(a.email || a.name).charAt(0).toUpperCase()}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="truncate">{a.email || a.name}</span>
                        {admin && (
                          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-white">
                            Administrateur
                          </span>
                        )}
                        {cestMoi && (
                          <span className="rounded-full bg-panel-2 px-2.5 py-0.5 text-xs font-bold text-ink-2">
                            Vous
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-ink-2">
                        {a.lastLogin
                          ? `Dernière connexion ${dateFmt.format(new Date(a.lastLogin))}`
                          : "Jamais connecté"}
                        {a.loginsCount > 0 && ` · ${a.loginsCount} connexion${a.loginsCount > 1 ? "s" : ""}`}
                        {/* Les rôles hors ADMIN/CLIENT sont montrés mais pas
                            modifiables : cet écran ne prétend pas remplacer le
                            dashboard Auth0 pour des rôles qu'il ne connaît pas. */}
                        {a.roles.filter((r) => r !== "ADMIN" && r !== "CLIENT").length > 0 &&
                          ` · ${a.roles.filter((r) => r !== "ADMIN" && r !== "CLIENT").join(", ")}`}
                      </p>
                    </div>

                    {admin ? (
                      confirmRevoke === a.userId ? (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmRevoke(null)}
                            className="rounded-full border border-line px-4 py-2 text-sm font-semibold"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={() => setRole(a, false)}
                            disabled={busy === a.userId}
                            className="rounded-full bg-brick px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            Retirer l&apos;accès
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRevoke(a.userId)}
                          disabled={bloque || busy === a.userId}
                          title={
                            cestMoi
                              ? "Vous ne pouvez pas retirer votre propre accès"
                              : dernierAdmin
                                ? "C'est le dernier administrateur"
                                : undefined
                          }
                          className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold text-brick transition hover:bg-brick/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Retirer l&apos;accès
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRole(a, true)}
                        disabled={busy === a.userId}
                        className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-50"
                      >
                        {busy === a.userId ? "…" : "Nommer administrateur"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <p className="rounded-[var(--radius-card)] border border-dashed border-line p-10 text-center text-ink-2">
                Aucun compte ne correspond.
              </p>
            )}
          </div>

          <p className="flex items-start gap-2 rounded-[var(--radius-card)] bg-panel-2 p-4 text-sm text-ink-2">
            <Icon name="clock" size={17} className="mt-0.5 shrink-0 text-primary" />
            Un changement de rôle prend effet sous cinq minutes pour une personne déjà connectée,
            ou immédiatement si elle se reconnecte. Le dernier administrateur ne peut pas être
            rétrogradé, et personne ne peut retirer son propre accès : ce serait s&apos;enfermer
            dehors.
          </p>
        </>
      )}
    </div>
  );
}
