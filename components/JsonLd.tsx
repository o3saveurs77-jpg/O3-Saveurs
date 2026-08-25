/* Injection d'un graphe schema.org dans la page.
 *
 * `dangerouslySetInnerHTML` est ici la bonne façon de faire, et la seule :
 * React échappe le contenu d'une balise `<script>` en entités HTML (`&quot;`),
 * ce qui produit un JSON-LD syntaxiquement invalide que les robots rejettent
 * en silence — la page a l'air correcte, le balisage est simplement ignoré.
 *
 * Le risque d'injection est écarté en amont : le contenu vient toujours de
 * `JSON.stringify` (voir `lib/seo.ts#graph`), qui échappe les guillemets. Reste
 * un cas que `JSON.stringify` ne couvre pas — la séquence `</script>` dans une
 * chaîne, qui fermerait la balise par anticipation. Un nom de plat saisi au
 * back-office est du texte libre : on neutralise donc le chevron fermant, comme
 * le fait Next lui-même pour ses données sérialisées.
 */
export function JsonLd({ data }: { data: string }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: data.replace(/</g, "\\u003c") }}
    />
  );
}
