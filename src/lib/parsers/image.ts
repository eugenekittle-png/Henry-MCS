import sharp from "sharp";

const MAX_DIMENSION = 2000;

export async function parseImage(buffer: Buffer, filename: string): Promise<{ base64: string; mimeType: string }> {
  try {
    const resized = await sharp(buffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    return { base64: resized.toString("base64"), mimeType: "image/jpeg" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Unable to process image "${filename}": ${msg}`);
  }
}

export const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".tiff", ".tif", ".bmp", ".heic", ".heif",
]);
