import type { Currency } from "@/db/schema";
import { formatPrice } from "@/lib/format";

/** Montos por moneda (una línea por moneda, sin las que están en cero). */
export function MoneyByCurrency({ values, empty = "—", signed = false }: { values?: Partial<Record<Currency, number>>; empty?: string; signed?: boolean }) {
  const list = Object.entries(values ?? {}).filter(([, v]) => v) as [Currency, number][];
  if (!list.length) return <span className="text-ink-soft">{empty}</span>;
  return (
    <span className="inline-flex flex-col tabular-nums">
      {list.map(([c, v]) => (
        <span key={c} className={signed && v < 0 ? "text-red-600" : undefined}>{formatPrice(v, c)}</span>
      ))}
    </span>
  );
}

export function addTo(acc: Partial<Record<Currency, number>>, currency: Currency, amount: number) {
  acc[currency] = (acc[currency] ?? 0) + amount;
  return acc;
}
