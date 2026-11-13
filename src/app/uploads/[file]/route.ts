import { basename } from "node:path";
import { readStored } from "@/lib/storage";

export async function GET(_req: Request, { params }: RouteContext<"/uploads/[file]">) {
  const { file } = await params;
  const safe = basename(file);
  if (!/^[a-z0-9-]+\.webp$/.test(safe)) return new Response("Not found", { status: 404 });
  const data = await readStored("uploads", safe);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data as BodyInit, {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
