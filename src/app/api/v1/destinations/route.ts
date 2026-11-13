import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiJson, apiRoute } from "@/lib/api";
import { serializeDestination } from "@/lib/api-data";
import { asLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export const GET = apiRoute("catalog:read", async (req) => {
  const locale = asLocale(new URL(req.url).searchParams.get("locale"));
  const rows = await db.select().from(schema.destinations).orderBy(asc(schema.destinations.name));
  return apiJson({ data: rows.map((d) => serializeDestination(req, d, locale)) });
});
