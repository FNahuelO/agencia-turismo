import { ApiError, apiJson, apiRoute } from "@/lib/api";
import { getProductForApi, getUpcomingDeparturesFor, serializeDeparture, serializeProduct } from "@/lib/api-data";
import { todayISO } from "@/lib/format";
import { asLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export const GET = apiRoute("catalog:read", async (req, _client, ctx: RouteContext<"/api/v1/products/[slug]">) => {
  const { slug } = await ctx.params;
  const pkg = await getProductForApi(slug);
  if (!pkg) throw new ApiError(404, "product_not_found", "Producto inexistente o no publicado");
  const locale = asLocale(new URL(req.url).searchParams.get("locale"));
  const departures = pkg.kind === "paquete" ? (await getUpcomingDeparturesFor(pkg.id, todayISO())).map((d) => serializeDeparture(d, pkg)) : undefined;
  return apiJson({ data: { ...serializeProduct(req, pkg, locale, true), ...(departures && { departures }) } });
});
