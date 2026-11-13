import { join } from "node:path";
import sharp from "sharp";

const [, , name, out = "hero"] = process.argv;
if (!name) {
  console.error("Uso: node scripts/crop-hero.mjs <imagen-en-public/media> [salida]");
  process.exit(1);
}

const src = join(process.cwd(), "public", "media", name);
const { width = 1200 } = await sharp(src).metadata();
const k = width / 600;
await sharp(src)
  .extract({ left: Math.round(226 * k), top: Math.round(68 * k), width: Math.round(290 * k), height: Math.round(290 * k) })
  .webp({ quality: 82 })
  .toFile(join(process.cwd(), "public", "media", `${out}.webp`));
console.log(`public/media/${out}.webp`);
