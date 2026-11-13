import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Currency, PaymentStatus } from "@/db/schema";
import { bookingUrl, logBookingEvent, recalcBooking } from "./bookings";
import { notifyPaymentApproved } from "./notifications";
import { getRates } from "./exchange-rates";
import { formatPrice } from "./format";
import { convert } from "./fx";

const API = "https://api.mercadopago.com";

export function isMercadoPagoEnabled() {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function mpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("Mercado Pago no está configurado (falta MP_ACCESS_TOKEN)");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mercado Pago respondió ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function createCheckoutPreference(opts: {
  booking: { id: number; code: string; accessToken: string; contactName: string; contactEmail: string; currency: Currency };
  title: string;
  /** Monto en la moneda de la reserva; Mercado Pago cobra en pesos al cambio del día. */
  amount: number;
  kind: "seña" | "saldo" | "total";
}) {
  const rates = await getRates();
  const fxRate = rates[opts.booking.currency];
  const arsAmount = convert(opts.amount, opts.booking.currency, "ARS", rates);
  const base = siteUrl();
  const back = `${base}${bookingUrl(opts.booking)}`;
  const isPublic = base.startsWith("https://");
  const pref = await mpFetch<{ id: string; init_point: string; sandbox_init_point: string }>("/checkout/preferences", {
    method: "POST",
    headers: { "X-Idempotency-Key": `${opts.booking.code}-${opts.kind}-${arsAmount}-${Date.now()}` },
    body: JSON.stringify({
      items: [
        {
          id: opts.booking.code,
          title: `${opts.title} · ${opts.kind} reserva ${opts.booking.code}`.slice(0, 250),
          quantity: 1,
          currency_id: "ARS",
          unit_price: arsAmount,
        },
      ],
      payer: { name: opts.booking.contactName, email: opts.booking.contactEmail },
      external_reference: opts.booking.code,
      metadata: { booking_id: opts.booking.id, kind: opts.kind, fx_rate: fxRate, amount_booking: opts.amount },
      back_urls: { success: back, pending: back, failure: back },
      ...(isPublic ? { auto_return: "approved", notification_url: `${base}/api/webhooks/mercadopago` } : {}),
      statement_descriptor: "TRAVELAR",
    }),
  });
  return pref.init_point;
}

type MpPayment = {
  id: number;
  status: string;
  status_detail: string;
  transaction_amount: number;
  currency_id: string;
  external_reference: string | null;
  payment_type_id?: string;
  date_approved?: string | null;
  metadata?: { fx_rate?: number; amount_booking?: number };
};

const STATUS_MAP: Record<string, PaymentStatus> = {
  approved: "aprobado",
  authorized: "pendiente",
  pending: "pendiente",
  in_process: "pendiente",
  in_mediation: "en_revision",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "reintegrado",
  charged_back: "reintegrado",
};

/** Trae el pago desde Mercado Pago y lo refleja en la reserva. Es idempotente. */
export async function syncMercadoPagoPayment(paymentId: string) {
  const mp = await mpFetch<MpPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`);
  if (!mp.external_reference) return null;

  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.code, mp.external_reference) });
  if (!booking) return null;

  const status = STATUS_MAP[mp.status] ?? "pendiente";
  const charged = Math.round(mp.transaction_amount);
  const fxRate = booking.currency === "ARS" ? 1 : Number(mp.metadata?.fx_rate) || (await getRates())[booking.currency];
  const amount = booking.currency === "ARS" ? charged : Math.round(charged / fxRate);
  const externalId = String(mp.id);
  const existing = await db.query.payments.findFirst({ where: eq(schema.payments.externalId, externalId) });

  if (existing?.status === status) return booking;
  const now = new Date();
  const dates = {
    ...(status === "aprobado" && { paidAt: existing?.paidAt ?? (mp.date_approved ? new Date(mp.date_approved) : now) }),
    ...(status === "reintegrado" && { refundedAt: now, paidAt: existing?.paidAt ?? (mp.date_approved ? new Date(mp.date_approved) : now) }),
  };

  let localId = existing?.id;
  if (existing) {
    await db.update(schema.payments).set({ status, statusDetail: mp.status_detail, ...dates }).where(eq(schema.payments.id, existing.id));
  } else {
    [{ id: localId }] = await db.insert(schema.payments).values({
      bookingId: booking.id,
      method: "mercadopago",
      status,
      amount,
      currency: booking.currency,
      chargedAmount: charged,
      chargedCurrency: "ARS",
      fxRate,
      externalId,
      statusDetail: mp.status_detail,
      reference: mp.payment_type_id ?? null,
      ...dates,
    }).returning({ id: schema.payments.id });
  }

  const label = `Mercado Pago #${externalId} por ${formatPrice(charged, "ARS")}${booking.currency === "ARS" ? "" : ` (${formatPrice(amount, booking.currency)})`}`;
  if (status === "aprobado") await logBookingEvent(db, booking.id, `${label} aprobado.`);
  else if (status === "rechazado") await logBookingEvent(db, booking.id, `${label} rechazado (${mp.status_detail}).`, { level: "alerta" });
  else if (status === "reintegrado") await logBookingEvent(db, booking.id, `${label} reintegrado o contracargado (${mp.status}).`, { level: "alerta" });
  else await logBookingEvent(db, booking.id, `${label} pendiente de acreditación (${mp.status_detail}).`);

  const result = await recalcBooking(booking.id);
  if (status === "aprobado" && localId) await notifyPaymentApproved(localId);
  return result;
}

/**
 * Valida la firma `x-signature` que Mercado Pago envía en los webhooks.
 * https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 */
export function verifyWebhookSignature(opts: { signature: string | null; requestId: string | null; dataId: string }) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!opts.signature) return false;

  const parts = Object.fromEntries(
    opts.signature.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=").trim()];
    }),
  );
  if (!parts.ts || !parts.v1) return false;

  const id = /^[a-z0-9]+$/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId;
  let manifest = `id:${id};`;
  if (opts.requestId) manifest += `request-id:${opts.requestId};`;
  manifest += `ts:${parts.ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
