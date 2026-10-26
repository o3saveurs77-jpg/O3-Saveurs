/* Carte et tableau des allergènes en PDF, tirés de la base — `npm run pdf:site`.
 *
 * Le site servait une carte du 19 août (65 pages, 12 Mo) et des allergènes du
 * 7 juin : des prix et des allergènes que la base ne portait plus, offerts au
 * téléchargement depuis chaque pied de page. Le dépliant imprimé ne peut pas
 * les remplacer, ses formules sont aux prix d'avant le Pack d'octobre. Les deux
 * fichiers sont donc régénérés depuis la base, seule source de vérité, et se
 * relancent après chaque changement de carte.
 *
 * Écrit `public/carte-o3-saveurs.pdf` et `public/tableau-allergenes-o3-saveurs.pdf`.
 *
 * Polices standard Helvetica : aucune police à embarquer. Pas de `lineHeight`
 * sur la page — il fait disparaître le pied de page de @react-pdf sans erreur.
 */

import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToFile } from "@react-pdf/renderer";
import { PrismaClient } from "@prisma/client";

import { cats } from "../lib/menu";
import { ALLERGENS, ALLERGEN_LABEL, ALLERGEN_SHORT, type Allergen } from "../lib/types";
import { ALLERGENES_PAR_PLAT } from "../lib/allergenes";
import { WEEKDAY_LABEL } from "../lib/hours";

const prisma = new PrismaClient();

const C = { bordeaux: "#6b0f1a", or: "#c9952b", creme: "#fbf5ea", encre: "#2b1d16", gris: "#6f625a", ligne: "#e6d6bd" };

/* Helvetica standard ignore le signe moins typographique et les espaces fines
 * des libellés saisis dans l'admin : « −10 % » sortait « 10 %». */
const winAnsi = (t: string) => t.replace(/−/g, "-").replace(/[  ]/g, " ");

const eur = (c: number | null) => (c === null ? "" : `${(c / 100).toFixed(2).replace(".", ",")} €`);
const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date());

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 34, fontFamily: "Helvetica", fontSize: 9, color: C.encre },
  bandeau: { backgroundColor: C.bordeaux, color: "#ffffff", padding: 12, marginBottom: 12 },
  titre: { fontFamily: "Helvetica-Bold", fontSize: 20 },
  sousTitre: { fontSize: 9, color: "#f3e3c0", marginTop: 3 },
  section: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.bordeaux, borderBottomWidth: 1, borderBottomColor: C.or, paddingBottom: 2, marginTop: 10, marginBottom: 4 },
  ligne: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5, borderBottomWidth: 0.4, borderBottomColor: C.ligne },
  nom: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  desc: { fontSize: 7.6, color: C.gris, marginTop: 1 },
  prix: { fontFamily: "Helvetica-Bold", fontSize: 9, color: C.bordeaux, marginLeft: 8 },
  note: { fontSize: 7.6, color: C.gris, marginTop: 4 },
  encart: { backgroundColor: C.creme, borderWidth: 0.6, borderColor: C.ligne, padding: 7, marginTop: 10 },
  pied: { position: "absolute", bottom: 18, left: 34, right: 34, fontSize: 7, color: C.gris, textAlign: "center" },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "center", color: "#ffffff" },
  td: { fontSize: 7.4, textAlign: "center" },
});

interface Plat { id: string; cat: string; name: string; desc: string; priceCents: number | null; allergens: Allergen[] }

function Pied({ texte }: { texte: string }) {
  return (
    <Text
      style={s.pied}
      fixed
      render={({ pageNumber, totalPages }) => `${texte} · page ${pageNumber} / ${totalPages}`}
    />
  );
}

async function main() {
  const [rows, formules, speciaux, promos, reglages] = await Promise.all([
    prisma.dish.findMany({ where: { available: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    prisma.formula.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { code: "asc" }] }),
    prisma.dailySpecial.findMany({ where: { active: true, weekday: { not: null } }, orderBy: { weekday: "asc" } }),
    prisma.promotion.findMany({ where: { active: true, auto: true } }),
    prisma.setting.findMany(),
  ]);
  const r = Object.fromEntries(reglages.map((x) => [x.key, x.value]));
  const tel = r["restaurant.phone"] ?? "";
  const adresse = `${r["restaurant.address"] ?? ""}, ${r["restaurant.zip"] ?? ""} ${r["restaurant.city"] ?? ""}`;
  const identite = [r["legal.company"], r["legal.legalForm"]?.split(" — ")[0], r["legal.rcs"]].filter(Boolean).join(" · ");
  const pied = `Ô3 Saveurs · ${adresse} · ${tel} · o3saveurs.fr`;

  const plats: Plat[] = rows.map((d) => ({
    id: d.id, cat: d.cat, name: d.name, desc: d.desc, priceCents: d.priceCents,
    allergens: JSON.parse(d.allergens || "[]") as Allergen[],
  }));
  const groupes = cats
    .map((c) => ({ cat: c, plats: plats.filter((p) => p.cat === c.id) }))
    .filter((g) => g.plats.length);

  // ── Carte ──────────────────────────────────────────────────
  const carte = (
    <Document title="Carte — Ô3 Saveurs" author="Ô3 Saveurs">
      <Page size="A4" style={s.page}>
        <View style={s.bandeau}>
          <Text style={s.titre}>Ô3 SAVEURS — La carte</Text>
          <Text style={s.sousTitre}>Cuisine du monde · {adresse} · {tel} · mise à jour le {date}</Text>
        </View>

        {formules.length > 0 && (
          <View wrap={false}>
            <Text style={s.section}>Nos formules</Text>
            {formules.map((f) => (
              <View key={f.id} style={s.ligne}>
                <View style={{ flex: 1 }}>
                  <Text style={s.nom}>{f.code} · {f.name}</Text>
                  {f.desc ? <Text style={s.desc}>{f.desc}</Text> : null}
                </View>
                <Text style={s.prix}>{eur(f.priceCents)}</Text>
              </View>
            ))}
          </View>
        )}

        {groupes.map(({ cat, plats: liste }) => (
          <View key={cat.id}>
            <Text style={s.section} minPresenceAhead={40}>{cat.label}</Text>
            {liste.map((p) => (
              <View key={p.id} style={s.ligne} wrap={false}>
                <View style={{ flex: 1 }}>
                  <Text style={s.nom}>{p.name}</Text>
                  {p.desc ? <Text style={s.desc}>{p.desc}</Text> : null}
                </View>
                <Text style={s.prix}>{eur(p.priceCents)}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={s.encart} wrap={false}>
          {speciaux.length > 0 && (
            <Text style={s.nom}>
              Plats du jour, en quantité limitée : {speciaux.map((d) => `${WEEKDAY_LABEL[d.weekday!].toLowerCase()} — ${d.name}`).join(" · ")}
            </Text>
          )}
          {promos.map((p) => (
            <Text key={p.id} style={s.note}>{winAnsi(p.label)}</Text>
          ))}
          <Text style={s.note}>
            Prix TTC en euros. Photos non contractuelles. Allergènes : tableau à part et sur o3saveurs.fr/allergenes.
          </Text>
          {identite ? <Text style={s.note}>{identite}</Text> : null}
        </View>
        <Pied texte={pied} />
      </Page>
    </Document>
  );

  // ── Allergènes ─────────────────────────────────────────────
  const examine = (p: Plat) => p.allergens.length > 0 || p.name in ALLERGENES_PAR_PLAT;
  const colNom = 150;
  const colA = (842 - 2 * 28 - colNom) / ALLERGENS.length;

  const allergenes = (
    <Document title="Tableau des allergènes — Ô3 Saveurs" author="Ô3 Saveurs">
      <Page size="A4" orientation="landscape" style={{ ...s.page, paddingHorizontal: 28 }}>
        <View style={s.bandeau}>
          <Text style={s.titre}>Tableau des allergènes</Text>
          <Text style={s.sousTitre}>
            Les 14 allergènes réglementaires (règlement UE 1169/2011), plat par plat · mise à jour le {date}
          </Text>
        </View>

        <View style={{ flexDirection: "row", backgroundColor: C.bordeaux, paddingVertical: 4 }} fixed>
          <Text style={{ ...s.th, width: colNom, textAlign: "left", paddingLeft: 4 }}>Plat</Text>
          {ALLERGENS.map((a) => (
            <Text key={a} style={{ ...s.th, width: colA }}>{ALLERGEN_SHORT[a]}</Text>
          ))}
        </View>

        {groupes.map(({ cat, plats: liste }) => (
          <View key={cat.id}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: C.bordeaux, backgroundColor: C.creme, padding: 3 }} minPresenceAhead={20}>
              {cat.label}
            </Text>
            {liste.map((p) => (
              <View key={p.id} style={{ flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: C.ligne, paddingVertical: 2.5 }} wrap={false}>
                <Text style={{ ...s.td, width: colNom, textAlign: "left", paddingLeft: 4 }}>
                  {p.name}{examine(p) ? "" : "  (non renseigné)"}
                </Text>
                {ALLERGENS.map((a) => (
                  <Text key={a} style={{ ...s.td, width: colA, color: C.bordeaux, fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: -3 }}>
                    {/* « • » et non « ● » : Helvetica standard n'a pas le second. */}
                    {p.allergens.includes(a) ? "•" : ""}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ))}

        <View style={s.encart} wrap={false}>
          <Text style={s.note}>
            {ALLERGENS.map((a) => `${ALLERGEN_SHORT[a]} ${ALLERGEN_LABEL[a]}`).join(" · ")}
          </Text>
          <Text style={{ ...s.note, fontFamily: "Helvetica-Bold", color: C.encre }}>
            Contaminations croisées : nos plats sont préparés dans une cuisine où sont manipulés les quatorze
            allergènes. La présence de traces ne peut être exclue. En cas d&apos;allergie sévère, appelez-nous
            avant de commander au {tel}.
          </Text>
        </View>
        <Pied texte={pied} />
      </Page>
    </Document>
  );

  await renderToFile(carte, "public/carte-o3-saveurs.pdf");
  console.log(`  carte : ${plats.length} plats, ${formules.length} formules → public/carte-o3-saveurs.pdf`);
  await renderToFile(allergenes, "public/tableau-allergenes-o3-saveurs.pdf");
  console.log(`  allergènes : ${plats.length} plats → public/tableau-allergenes-o3-saveurs.pdf`);
}

main()
  .catch((e) => {
    console.error("  ÉCHEC :", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
