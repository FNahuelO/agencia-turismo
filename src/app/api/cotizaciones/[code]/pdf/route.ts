import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { getQuoteForCustomer } from "@/lib/quotes";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/cotizaciones/[code]/pdf">) {
  const { code } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t");
  const quote = await getQuoteForCustomer(code, token);
  if (!quote) return new Response("Not found", { status: 404 });

  const pdf = await renderQuotePdf(quote, await getSettings());
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
