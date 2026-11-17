import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import { slugify } from "./format";

type Folder = "uploads" | "receipts";

const MAX_BYTES = 10 * 1024 * 1024;
const CLOUD_FOLDER = "agencia";

/** Con `CLOUDINARY_URL` (producción) se sube a Cloudinary; sin ella, al disco en `data/`. */
const useCloudinary = () => Boolean(process.env.CLOUDINARY_URL);
const localDir = (folder: Folder) => join(process.cwd(), "data", folder);

/** Los PDF van como `raw`: las cuentas nuevas de Cloudinary bloquean la entrega de PDF como imagen. */
function cloudAsset(folder: Folder, filename: string) {
  const isPdf = filename.endsWith(".pdf");
  return {
    publicId: `${CLOUD_FOLDER}/${folder}/${isPdf ? filename : filename.replace(/\.webp$/, "")}`,
    resourceType: isPdf ? ("raw" as const) : ("image" as const),
    type: folder === "receipts" ? ("authenticated" as const) : ("upload" as const),
  };
}

/** Guarda el archivo y devuelve la URL pública si es una imagen subida a Cloudinary. */
async function store(folder: Folder, filename: string, data: Buffer, contentType: string) {
  if (useCloudinary()) {
    const { publicId, resourceType, type } = cloudAsset(folder, filename);
    const result = await cloudinary.uploader.upload(`data:${contentType};base64,${data.toString("base64")}`, {
      public_id: publicId,
      resource_type: resourceType,
      type,
      overwrite: false,
    });
    return result.secure_url as string;
  }
  await mkdir(localDir(folder), { recursive: true });
  await writeFile(join(localDir(folder), filename), data);
  return null;
}

/** Devuelve el archivo o null si no existe. `filename` tiene que venir ya validado. */
export async function readStored(folder: Folder, filename: string): Promise<ArrayBuffer | Buffer | null> {
  if (useCloudinary()) {
    const { publicId, resourceType, type } = cloudAsset(folder, filename);
    const url = cloudinary.url(publicId, {
      resource_type: resourceType,
      type,
      format: resourceType === "image" ? "webp" : undefined,
      sign_url: type === "authenticated",
      secure: true,
    });
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    return res?.ok ? res.arrayBuffer() : null;
  }
  return readFile(join(localDir(folder), filename)).catch(() => null);
}

/** Comprobantes de pago: privados, se sirven solo desde el backoffice. */
export async function saveReceiptUpload(file: File, code: string) {
  const isPdf = file.type === "application/pdf";
  if (!isPdf && !file.type.startsWith("image/")) throw new Error("Subí el comprobante como imagen o PDF");
  if (file.size > MAX_BYTES) throw new Error("El comprobante supera los 10 MB");

  const filename = `${slugify(code)}-${randomBytes(8).toString("hex")}.${isPdf ? "pdf" : "webp"}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (isPdf) {
    if (buffer.subarray(0, 4).toString() !== "%PDF") throw new Error("El PDF no es válido");
    await store("receipts", filename, buffer, "application/pdf");
  } else {
    const webp = await sharp(buffer)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    await store("receipts", filename, webp, "image/webp");
  }
  return filename;
}

export async function saveImageUpload(file: File, nameHint: string) {
  if (!file.type.startsWith("image/")) throw new Error("El archivo debe ser una imagen");
  if (file.size > MAX_BYTES) throw new Error("La imagen supera los 10 MB");

  const filename = `${slugify(nameHint) || "imagen"}-${Date.now().toString(36)}.webp`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const webp = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const url = await store("uploads", filename, webp, "image/webp");
  return url ?? `/uploads/${filename}`;
}
