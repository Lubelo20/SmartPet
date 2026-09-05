import { FeederError } from "@/lib/errors";

/**
 * Pet photo handling for the inline-in-Firestore era.
 *
 * The photo is stored on the pet document as a JPEG data URL (`photoData`),
 * because Firebase Storage needs the Blaze plan this project does not have
 * yet. That makes the size cap a correctness rule, not a nicety: a Firestore
 * document tops out at 1 MiB, and the pet document must never get near it.
 * When Storage arrives (sub-project B), photos move to `photoPath` and this
 * module shrinks to the resize helper the uploader still needs.
 *
 * Split on purpose: the geometry and size arithmetic below is pure and unit
 * tested; `resizePetPhoto` is browser-only (canvas, createImageBitmap) and is
 * verified by hand in the running app — this repo's vitest runs in a node
 * environment with no DOM, and a mocked canvas would test the mock.
 */

/** Longest edge of a stored photo, in pixels. */
export const PHOTO_MAX_EDGE = 512;
/** Hard cap on the stored data URL's decoded size. */
export const PHOTO_MAX_BYTES = 300_000;

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSupportedImageType(mime: string): boolean {
  return SUPPORTED.has(mime);
}

/** Shrink (never grow) a width×height box so its long edge fits `maxEdge`. */
export function scaleToFit(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const f = maxEdge / long;
  return { width: Math.round(width * f), height: Math.round(height * f) };
}

/**
 * Decoded byte size of a data URL's base64 payload. A value that is not a
 * data URL reads as larger than the cap, so the size gate rejects it instead
 * of letting it fail later, deeper in Firestore.
 */
export function dataUrlBytes(dataUrl: string): number {
  const idx = dataUrl.indexOf(";base64,");
  if (idx === -1) return PHOTO_MAX_BYTES + 1;
  const b64 = dataUrl.slice(idx + ";base64,".length);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, (b64.length * 3) / 4 - padding);
}

/**
 * Browser-only: read a picked file, shrink it to PHOTO_MAX_EDGE, and return a
 * JPEG data URL under PHOTO_MAX_BYTES. Quality steps down before giving up,
 * so an unusually incompressible image gets smaller rather than refused.
 */
export async function resizePetPhoto(file: File): Promise<string> {
  if (!isSupportedImageType(file.type)) {
    throw new FeederError("unknown", "That file is not a photo. Use a JPEG, PNG or WebP image.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    throw new FeederError("unknown", "That image could not be read. Try a different photo.", e);
  }

  try {
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, PHOTO_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new FeederError("unknown", "This browser could not process the photo.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.8, 0.6, 0.4]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlBytes(url) <= PHOTO_MAX_BYTES) return url;
    }
    throw new FeederError("unknown", "That photo could not be compressed enough to store. Try a smaller image.");
  } finally {
    bitmap.close();
  }
}
