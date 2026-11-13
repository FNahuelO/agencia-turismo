"use client";

import { useEffect, useRef, useState } from "react";
import type { QuoteItem, QuoteItemKind } from "@/db/schema";
import { markupOf, priceFromMarkup } from "@/lib/quote-calc";
import { QUOTE_ITEM_KIND_LABELS } from "./ui";

type Defaults = Partial<Pick<QuoteItem, "kind" | "description" | "detail" | "supplier" | "dateFrom" | "dateTo" | "quantity" | "unitCost" | "unitPrice">>;

const num = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Campos de un servicio: costo + markup calculan el precio de venta, y editar el precio recalcula el markup. */
export function QuoteItemFields({ item, defaultMarkup = 15 }: { item?: Defaults; defaultMarkup?: number }) {
  const initial = () => ({
    cost: item?.unitCost ? String(item.unitCost) : "",
    markup: item ? String(markupOf(item.unitCost ?? 0, item.unitPrice ?? 0) ?? "") : String(defaultMarkup),
    price: item?.unitPrice !== undefined ? String(item.unitPrice) : "",
  });
  const [values, setValues] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onReset = () => setValues(initial());
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const setCost = (cost: string) =>
    setValues((v) => ({ ...v, cost, price: v.markup !== "" ? String(priceFromMarkup(num(cost), num(v.markup))) : v.price }));
  const setMarkup = (markup: string) => setValues((v) => ({ ...v, markup, price: String(priceFromMarkup(num(v.cost), num(markup))) }));
  const setPrice = (price: string) => setValues((v) => ({ ...v, price, markup: String(markupOf(num(v.cost), num(price)) ?? "") }));

  return (
    <div ref={ref} className="grid gap-3 sm:grid-cols-6">
      <label className="sm:col-span-2">
        <span className="label">Tipo</span>
        <select name="kind" defaultValue={item?.kind ?? "hotel"} className="field">
          {(Object.keys(QUOTE_ITEM_KIND_LABELS) as QuoteItemKind[]).map((k) => <option key={k} value={k}>{QUOTE_ITEM_KIND_LABELS[k]}</option>)}
        </select>
      </label>
      <label className="sm:col-span-4">
        <span className="label">Servicio</span>
        <input name="description" required defaultValue={item?.description} className="field" placeholder="Hotel Llao Llao · habitación doble superior" />
      </label>
      <label className="sm:col-span-4">
        <span className="label">Detalle para el cliente <span className="font-normal text-ink-soft">(opcional)</span></span>
        <input name="detail" defaultValue={item?.detail} className="field" placeholder="Desayuno incluido · 4 noches" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Proveedor <span className="font-normal text-ink-soft">(vacío = propio)</span></span>
        <input name="supplier" defaultValue={item?.supplier} className="field" placeholder="Operador, aerolínea..." />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Desde</span>
        <input name="dateFrom" type="date" defaultValue={item?.dateFrom ?? ""} className="field" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Hasta</span>
        <input name="dateTo" type="date" defaultValue={item?.dateTo ?? ""} className="field" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Cantidad</span>
        <input name="quantity" type="number" min={1} defaultValue={item?.quantity ?? 1} className="field" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Costo unitario <span className="font-normal text-ink-soft">(interno)</span></span>
        <input name="unitCost" inputMode="numeric" value={values.cost} onChange={(e) => setCost(e.target.value)} className="field" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Markup %</span>
        <input name="markup" inputMode="decimal" value={values.markup} onChange={(e) => setMarkup(e.target.value)} className="field" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Precio de venta unitario</span>
        <input name="unitPrice" inputMode="numeric" required value={values.price} onChange={(e) => setPrice(e.target.value)} className="field font-semibold" />
      </label>
    </div>
  );
}
