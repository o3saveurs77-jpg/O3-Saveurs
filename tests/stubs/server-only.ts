/* Substitut de `server-only` pour les tests.
 *
 * Le vrai paquet lève à l'import dès qu'il est chargé hors d'un composant
 * serveur Next.js — c'est sa raison d'être : il empêche `lib/geo.ts`, et donc
 * `GOOGLE_MAPS_API_KEY`, d'atterrir dans le bundle du navigateur.
 *
 * Vitest ne tourne pas dans Next.js et résout sa variante client, ce qui
 * faisait échouer au chargement toute suite important `lib/pricing`. Ce module
 * vide rétablit les tests sans toucher à la garde, qui reste active au build.
 * Voir l'alias dans `vitest.config.ts`.
 */
export {};
