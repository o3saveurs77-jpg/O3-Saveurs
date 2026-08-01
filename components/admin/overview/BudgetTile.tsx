"use client";

/**
 * Tuile de raccourci vers « Courses & budget » (`/admin/budget`).
 *
 * Chargée indépendamment de `/api/stats` : un budget prévisionnel qui échoue à
 * charger ne doit pas priver l'écran du reste des statistiques, et inversement.
 */
import { useEffect, useState } from "react";
import { fmtCents } from "@/lib/money";
import { Tile } from "./KpiTiles";

interface BudgetSummary {
  coutMatierePct: number | null;
  budgetParJourCents: number | null;
  totalMatieresCents: number;
}

export function BudgetTile() {
  const [data, setData] = useState<BudgetSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/budget", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<BudgetSummary>) : null))
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        /* silencieux : une tuile de raccourci ne doit pas afficher d'erreur bloquante */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value =
    data?.coutMatierePct != null
      ? `${data.coutMatierePct.toFixed(1).replace(".", ",")} %`
      : data
        ? fmtCents(data.totalMatieresCents)
        : "…";

  return (
    <Tile
      label="Coût matière (prévisionnel)"
      value={value}
      icon="cart"
      sub={
        data?.budgetParJourCents != null
          ? `${fmtCents(data.budgetParJourCents)} / jour · voir la liste de courses`
          : "Voir la liste de courses & budget"
      }
      href="/admin/budget"
    />
  );
}
