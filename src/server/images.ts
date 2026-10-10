import "server-only";
import sharp from "sharp";
import { adminBucket } from "@/server/firebase";
import { randomToken } from "@/server/crypto";
import { UserError } from "@/server/action";

const STORAGE_OFF =
  "Caricamento foto non disponibile: il progetto Firebase non ha ancora lo Storage attivo (richiede il piano Blaze, gratuito entro 5 GB).";

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_UPLOAD = 8 * 1024 * 1024;

/**
 * Validates, resizes and converts an uploaded image to WebP, then stores it
 * in Firebase Storage under "tenants/<tenantId>/<folder>/<random>.webp".
 * Returns the storage path. SVG is rejected (it can carry scripts).
 */
export async function storeTenantImage(
  tenantId: string,
  folder: string,
  file: File,
  opts: { maxWidth: number; maxHeight?: number; quality?: number; thumbWidth?: number } = { maxWidth: 1600 },
): Promise<string> {
  if (!ACCEPTED.has(file.type)) throw new UserError("Formato non supportato: usa JPG, PNG o WebP.");
  if (file.size > MAX_UPLOAD) throw new UserError("Immagine troppo grande (massimo 8 MB).");
  const input = Buffer.from(await file.arrayBuffer());
  const output = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: opts.maxWidth, height: opts.maxHeight, fit: "inside", withoutEnlargement: true })
    .webp({ quality: opts.quality ?? 80 })
    .toBuffer();
  const path = `tenants/${tenantId}/${folder}/${randomToken(9)}.webp`;
  const meta = { contentType: "image/webp", metadata: { cacheControl: "public, max-age=31536000, immutable" } };
  try {
    await adminBucket().file(path).save(output, meta);
    if (opts.thumbWidth) {
      const thumb = await sharp(output).resize({ width: opts.thumbWidth, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
      await adminBucket().file(thumbPath(path)).save(thumb, meta);
    }
  } catch (e) {
    console.error("storage upload failed", e);
    throw new UserError(STORAGE_OFF);
  }
  return path;
}

export const thumbPath = (path: string) => path.replace(/\.webp$/, "_t.webp");

export async function removeTenantImage(path: string | null | undefined, withThumb = false) {
  if (!path) return;
  try {
    await adminBucket().file(path).delete({ ignoreNotFound: true });
    if (withThumb) await adminBucket().file(thumbPath(path)).delete({ ignoreNotFound: true });
  } catch (e) {
    console.error("storage delete failed", e);
  }
}
