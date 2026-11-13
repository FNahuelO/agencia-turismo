import { apiJson, apiRoute } from "@/lib/api";
import { getRates } from "@/lib/exchange-rates";

export const dynamic = "force-dynamic";

/** Cotizaciones vigentes (pesos por unidad, con el margen aplicado). */
export const GET = apiRoute("catalog:read", async () => {
  const rates = await getRates();
  return apiJson({ data: { base: "ARS", rates } });
});
