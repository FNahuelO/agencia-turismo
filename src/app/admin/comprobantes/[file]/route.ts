import { basename } from "node:path";
import { getSession } from "@/lib/auth";
import { readStored } from "@/lib/storage";

export async function GET(_req: Request, { params }: RouteContext<"/admin/comprobantes/[file]">) {
  if (!(await getSession())) return new Response("No autorizado", { status: 401 });
  const { file } = await params;
  const safe = basename(file);
  const match = /^[a-z0-9-]+\.(webp|pdf)$/.exec(safe);
  if (!match) return new Response("Not found", { status: 404 });
  const data = await readStored("receipts", safe);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data as BodyInit, {
    headers: {
      "Content-Type": match[1] === "pdf" ? "application/pdf" : "image/webp",
      "Cache-Control": "private, no-store",
    },
  });
}
