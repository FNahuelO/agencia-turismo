import type { QuoteStatus } from "@/db/schema";

/** Cálculos puros del cotizador (sirven en el cliente y en el servidor). */

export type QuoteLine = { quantity: number; unitCost: number; unitPrice: number };

export function priceFromMarkup(unitCost: number, markupPercent: number) {
  return Math.round(unitCost * (1 + markupPercent / 100));
}

/** Markup sobre costo en %; null si no hay costo cargado. */
export function markupOf(unitCost: number, unitPrice: number) {
  if (unitCost <= 0) return null;
  return Math.round(((unitPrice - unitCost) / unitCost) * 1000) / 10;
}

export function quoteTotals(items: QuoteLine[], passengers = 1) {
  const total = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
  const cost = items.reduce((acc, i) => acc + i.unitCost * i.quantity, 0);
  const margin = total - cost;
  return {
    total,
    cost,
    margin,
    /** Margen sobre el precio de venta, en %. */
    marginPercent: total > 0 ? Math.round((margin / total) * 1000) / 10 : 0,
    perPassenger: passengers > 0 ? Math.round(total / passengers) : total,
  };
}

export type QuoteDisplayStatus = QuoteStatus | "vencida";

/** Las cotizaciones abiertas (borrador/enviada) pasan a "vencida" cuando se pasa `validUntil`. */
export function quoteDisplayStatus(quote: { status: QuoteStatus; validUntil: string }, today: string): QuoteDisplayStatus {
  if ((quote.status === "borrador" || quote.status === "enviada") && quote.validUntil < today) return "vencida";
  return quote.status;
}
