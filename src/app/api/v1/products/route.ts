import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, apiJson, apiRoute } from "@/lib/api";
import { serializeProduct, TYPE_TO_KIND } from "@/lib/api-data";
import { asLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export const GET = apiRoute("catalog:read", async (req) => {
  const url = new URL(req.url);
  const locale = asLocale(url.searchParams.get("locale"));
  const type = url.searchParams.get("type");
  const kind = type ? TYPE_TO_KIND[type] : undefined;
  if (type && !kind) throw new ApiError(422, "invalid_type", "type debe ser package, activity, transfer u hotel");

  const destinationSlug = url.searchParams.get("destination");
  const destination = destinationSlug ? await db.query.destinations.findFirst({ where: eq(schema.destinations.slug, destinationSlug) }) : undefined;
  if (destinationSlug && !destination) throw new ApiError(404, "destination_not_found", "Destino inexistente");

  const rows = await db.query.packages.findMany({
    where: and(
      eq(schema.packages.published, true),
      kind ? eq(schema.packages.kind, kind) : undefined,
      destination ? eq(schema.packages.destinationId, destination.id) : undefined,
    ),
    with: { destination: true },
    orderBy: [asc(schema.packages.kind), asc(schema.packages.title)],
  });
  return apiJson({ data: rows.map((p) => serializeProduct(req, p, locale)) });
});
