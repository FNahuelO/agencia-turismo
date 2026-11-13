import { ApiError, apiJson, apiRoute } from "@/lib/api";
import { getProductForApi, getUpcomingDeparturesFor, serializeDeparture } from "@/lib/api-data";
import { addDaysISO, todayISO } from "@/lib/format";
import { firstBookableDate, getDailyAvailability, lastBookableDate } from "@/lib/products";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = apiRoute("catalog:read", async (req, _client, ctx: RouteContext<"/api/v1/products/[slug]/availability">) => {
  const { slug } = await ctx.params;
  const pkg = await getProductForApi(slug);
  if (!pkg) throw new ApiError(404, "product_not_found", "Producto inexistente o no publicado");

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  if ((fromParam && !ISO_DATE.test(fromParam)) || (toParam && !ISO_DATE.test(toParam))) {
    throw new ApiError(422, "invalid_date", "from y to deben tener el formato YYYY-MM-DD");
  }

  if (pkg.kind === "paquete") {
    const departures = await getUpcomingDeparturesFor(pkg.id, fromParam && fromParam > todayISO() ? fromParam : todayISO(), toParam ?? undefined);
    return apiJson({ data: { type: "departures", currency: pkg.currency, departures: departures.map((d) => serializeDeparture(d, pkg)) } });
  }

  const min = firstBookableDate();
  const max = lastBookableDate();
  const from = fromParam && fromParam > min ? fromParam : min;
  const to = toParam && toParam < max ? toParam : toParam ? toParam : addDaysISO(from, 60) < max ? addDaysISO(from, 60) : max;
  if (to < from) throw new ApiError(422, "invalid_range", "El rango de fechas está vacío o fuera de la ventana de reserva");
  const calendar = await getDailyAvailability(pkg, from, to > max ? max : to);
  return apiJson({
    data: {
      type: "daily",
      currency: pkg.currency,
      unit: pkg.kind === "hotel" ? "rooms" : pkg.kind === "traslado" ? "vehicles" : "people",
      bookableFrom: min,
      bookableUntil: max,
      ...(pkg.kind === "hotel" && { minNights: pkg.minNights }),
      dates: Object.entries(calendar).map(([date, [price, left]]) => ({ date, price, left })),
    },
  });
});
