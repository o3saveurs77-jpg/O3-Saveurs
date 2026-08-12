/* Stockage des photos — compatible S3.
 *
 * Le site utilisait Vercel Blob, une API propriétaire : changer d'hébergeur
 * imposait de réécrire le téléversement. Ce module parle S3, que Cellar
 * (Clever Cloud), MinIO, Scaleway ou AWS comprennent tous. L'hébergeur devient
 * une affaire de variables d'environnement, plus de code.
 *
 * Sur Clever Cloud, l'addon Cellar injecte `CELLAR_ADDON_HOST`,
 * `CELLAR_ADDON_KEY_ID` et `CELLAR_ADDON_KEY_SECRET` tout seul ; seul le nom du
 * bucket reste à déclarer.
 *
 * Les objets sont écrits en lecture publique : ce sont des photos de plats
 * affichées sur le site. Rien de personnel ne passe par ici — les factures
 * sont engendrées à la volée et ne sont jamais déposées sur un stockage
 * ouvert.
 */

import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Hôte du stockage, sans protocole (ex. `cellar-c2.services.clever-cloud.com`). */
export function storageHost(): string | null {
  const raw = process.env.CELLAR_ADDON_HOST?.trim();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function storageBucket(): string | null {
  return process.env.CELLAR_BUCKET?.trim() || null;
}

/**
 * Le stockage est-il réellement utilisable ?
 *
 * Contrôlé **avant** de lire le fichier téléversé : sans cela, on faisait
 * monter plusieurs mégaoctets depuis un téléphone pour échouer à l'arrivée.
 */
export function isStorageConfigured(): boolean {
  return !!(
    storageHost() &&
    storageBucket() &&
    process.env.CELLAR_ADDON_KEY_ID?.trim() &&
    process.env.CELLAR_ADDON_KEY_SECRET?.trim()
  );
}

let client: S3Client | null = null;

function s3(): S3Client {
  const host = storageHost();
  if (!client) {
    client = new S3Client({
      endpoint: `https://${host}`,
      /* Cellar ignore la région mais le client S3 en exige une. `forcePathStyle`
       * reste à false : Cellar sert les buckets en sous-domaine, ce qui donne
       * l'URL publique `https://<bucket>.<hôte>/<clé>`. */
      region: process.env.CELLAR_REGION?.trim() || "us-east-1",
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.CELLAR_ADDON_KEY_ID!.trim(),
        secretAccessKey: process.env.CELLAR_ADDON_KEY_SECRET!.trim(),
      },
    });
  }
  return client;
}

/** Adresse publique d'un objet, telle qu'elle sera écrite en base. */
export function publicUrl(key: string): string {
  return `https://${storageBucket()}.${storageHost()}/${key}`;
}

/**
 * Dépose un objet en lecture publique et renvoie son adresse.
 *
 * La clé est **calculée ici**, jamais reprise du nom fourni par le client : un
 * nom de fichier venu du navigateur peut contenir n'importe quoi, y compris de
 * quoi sortir du dossier prévu.
 */
export async function putPublicObject(
  prefix: string,
  extension: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const key = `${prefix}/${crypto.randomUUID()}.${extension}`;

  await s3().send(
    new PutObjectCommand({
      Bucket: storageBucket()!,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: "public-read",
      /* Un an de cache : la clé porte un identifiant unique, donc une photo
       * remplacée reçoit une nouvelle adresse et ne peut pas rester périmée
       * dans le navigateur d'un visiteur. */
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return publicUrl(key);
}
