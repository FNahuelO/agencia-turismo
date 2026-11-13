import { readdir, stat, unlink } from "node:fs/promises";
import { join, parse } from "node:path";
import sharp from "sharp";

const dir = join(process.cwd(), "public", "media");
const files = (await readdir(dir)).filter((f) => /\.(png|jpe?g)$/i.test(f));
let before = 0;
let after = 0;

for (const file of files) {
  const src = join(dir, file);
  const out = join(dir, `${parse(file).name}.webp`);
  before += (await stat(src)).size;
  await sharp(src).resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
  after += (await stat(out)).size;
  await unlink(src);
}

console.log(`${files.length} imágenes: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
