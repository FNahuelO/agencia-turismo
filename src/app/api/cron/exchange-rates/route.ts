import { revalidatePath } from "next/cache";
import { refreshExchangeRates } from "@/lib/exchange-rates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const result = await refreshExchangeRates();
  if (result.updated.length) revalidatePath("/", "layout");
  return Response.json(result, { status: result.errors.length ? 502 : 200 });
}
