import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      /* `server-only` lève à l'import hors composant serveur — c'est tout son
       * intérêt : il transforme une fuite de `GOOGLE_MAPS_API_KEY` vers le
       * navigateur en erreur de compilation. Hors de Next.js, vitest résout sa
       * variante client et fait échouer toute suite qui touche `lib/pricing`.
       * On le neutralise ici, et seulement ici : la garde reste entière au
       * build de production. */
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node", // par défaut node ; les tests composants déclarent jsdom en tête de fichier
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
