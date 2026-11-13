import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import type { Currency, ExchangeRate, FxSource } from "@/db/schema";
import type { Rates } from "./fx";

const { exchangeRates } = schema;

/** Valores iniciales si nunca se cargaron cotizaciones. */
const FALLBACK: Record<Exclude<Currency, "ARS">, number> = { USD: 1000, EUR: 1100 };

export function effectiveRate(row: Pick<ExchangeRate, "rate" | "markup">) {
  return row.rate * (1 + row.markup / 100);
}

export const getExchangeRows = cache(async () => {
  const rows = await db.select().from(exchangeRates);
  return (Object.keys(FALLBACK) as Exclude<Currency, "ARS">[]).map(
    (currency) => rows.find((r) => r.currency === currency) ?? { currency, source: "manual" as FxSource, rate: FALLBACK[currency], markup: 0, fetchedAt: null, createdAt: new Date(0), updatedAt: new Date(0) },
  );
});

export const getRates = cache(async (): Promise<Rates> => {
  const rows = await getExchangeRows();
  const rates: Rates = { ARS: 1, USD: FALLBACK.USD, EUR: FALLBACK.EUR };
  for (const row of rows) rates[row.currency] = effectiveRate(row);
  return rates;
});

/**
 * Convierte un pago hecho en `charged` a la moneda de la reserva con la cotización vigente.
 * `fxRate` = pesos por unidad de la moneda de la reserva.
 */
export async function creditForPayment(amount: number, charged: Currency, bookingCurrency: Currency) {
  const rates = await getRates();
  const fxRate = rates[bookingCurrency];
  const credited = charged === bookingCurrency ? amount : Math.round((amount * rates[charged]) / fxRate);
  return { credited, fxRate };
}

/** Cotización de venta desde DolarAPI (https://dolarapi.com). */
export async function fetchRemoteRate(currency: Exclude<Currency, "ARS">, source: Exclude<FxSource, "manual">) {
  const path = currency === "USD" ? `/v1/dolares/${source}` : `/v1/cotizaciones/${currency.toLowerCase()}`;
  const res = await fetch(`https://dolarapi.com${path}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`DolarAPI respondió ${res.status} para ${currency}/${source}`);
  const data = (await res.json()) as { venta?: number };
  if (!data.venta || data.venta <= 0) throw new Error(`DolarAPI no devolvió cotización para ${currency}/${source}`);
  return data.venta;
}

export async function saveExchangeRate(values: { currency: Exclude<Currency, "ARS">; source: FxSource; rate: number; markup: number; fetchedAt?: Date | null }) {
  await db
    .insert(exchangeRates)
    .values(values)
    .onConflictDoUpdate({ target: exchangeRates.currency, set: { source: values.source, rate: values.rate, markup: values.markup, fetchedAt: values.fetchedAt ?? null } });
}

/** Actualiza las monedas con fuente automática. Devuelve las que cambiaron y los errores. */
export async function refreshExchangeRates() {
  const rows = await db.select().from(exchangeRates);
  const updated: string[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    if (row.source === "manual") continue;
    try {
      const rate = await fetchRemoteRate(row.currency, row.source);
      await db.update(exchangeRates).set({ rate, fetchedAt: new Date() }).where(eq(exchangeRates.currency, row.currency));
      updated.push(`${row.currency} ${row.source}: ${rate}`);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { updated, errors };
}
