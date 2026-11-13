import type { Currency } from "@/db/schema";

/** Pesos argentinos por unidad de cada moneda (ARS = 1), ya con el margen aplicado. */
export type Rates = Record<Currency, number>;

export const CURRENCY_LABELS: Record<Currency, string> = {
  ARS: "Pesos (ARS)",
  USD: "Dólares (USD)",
  EUR: "Euros (EUR)",
};

export function convert(amount: number, from: Currency, to: Currency, rates: Rates) {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return amount;
  return Math.round((amount * fromRate) / toRate);
}

/** Cuántos pesos vale una unidad de `currency`. */
export function arsPerUnit(currency: Currency, rates: Rates) {
  return rates[currency] || 1;
}
