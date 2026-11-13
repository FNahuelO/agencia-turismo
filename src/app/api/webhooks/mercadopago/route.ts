import { revalidatePath } from "next/cache";
import { syncMercadoPagoPayment, verifyWebhookSignature } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { type?: string; topic?: string; data?: { id?: string | number } };

  const type = body.type ?? body.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const dataId = String(url.searchParams.get("data.id") ?? body.data?.id ?? url.searchParams.get("id") ?? "");
  if (type !== "payment" || !dataId) return Response.json({ ignored: true });

  const valid = verifyWebhookSignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
  });
  if (!valid) return Response.json({ error: "Firma inválida" }, { status: 401 });

  try {
    await syncMercadoPagoPayment(dataId);
    revalidatePath("/", "layout");
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[mercadopago webhook]", e);
    return Response.json({ error: "No se pudo procesar el pago" }, { status: 500 });
  }
}
