import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// ESLint n'était pas installé et aucune configuration n'existait : le script
// `next lint` ouvrait un prompt interactif au lieu d'analyser quoi que ce soit.
// Des directives `/* eslint-disable */` traînaient dans le code pour un linter
// qui n'avait jamais tourné.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "_maquettes/**", // maquettes pré-Next, hors build
      "scraps/**",
      "uploads/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      // Les montants et les identifiants circulent en types stricts : un `any`
      // à la frontière de la base était précisément ce qui laissait passer les
      // erreurs de conversion euros/centimes.
      "@typescript-eslint/no-explicit-any": "error",

      // Un import non utilisé signale souvent un reste de refactorisation.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Les photos de plats pèsent 100 à 285 Ko : `next/image` n'est pas une
      // préférence de style ici, c'est ce qui rend le site utilisable en 4G.
      "@next/next/no-img-element": "error",

      // Désactivée volontairement : tout le contenu du site est en français, où
      // l'apostrophe est omniprésente. React échappe déjà les nœuds de texte,
      // donc la règle ne prévient aucun défaut réel ici — elle produirait des
      // centaines de `&apos;` qui rendraient les textes illisibles à la
      // relecture. La typographie soignée passe par l'apostrophe courbe « ’ »,
      // qui n'est pas concernée par la règle.
      "react/no-unescaped-entities": "off",
    },
  },
];
