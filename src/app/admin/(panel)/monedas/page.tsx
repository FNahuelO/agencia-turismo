import { RefreshCw } from "lucide-react";
import { refreshRatesAction, saveRate } from "@/app/admin/fx-actions";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { Card, Field, PageHeader } from "@/components/admin/ui";
import type { FxSource } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { effectiveRate, getExchangeRows } from "@/lib/exchange-rates";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Monedas" };

const SOURCE_LABEL: Record<FxSource, string> = {
  manual: "Manual (la cargo yo)",
  oficial: "Oficial (automática)",
  blue: "Blue (automática)",
  bolsa: "MEP (automática)",
  tarjeta: "Tarjeta (automática)",
};

const dateTime = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function MonedasPage() {
  const session = await requireSession();
  const rows = await getExchangeRows();
  const isAdmin = session.role === "admin";

  return (
    <>
      <PageHeader
        title="Monedas y cotizaciones"
        description="Pesos por cada dólar o euro. Se usan para mostrar precios convertidos, cobrar con Mercado Pago en pesos y acreditar pagos hechos en otra moneda."
        actions={
          <ActionForm action={refreshRatesAction}>
            <SubmitButton className="btn-ghost" pendingText="Actualizando..."><RefreshCw className="size-4" /> Actualizar automáticas</SubmitButton>
          </ActionForm>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        {rows.map((r) => {
          const eff = effectiveRate(r);
          return (
            <Card key={r.currency} title={r.currency === "USD" ? "Dólar (USD)" : "Euro (EUR)"}>
              <p className="font-display text-3xl font-bold">{formatPrice(Math.round(eff), "ARS")}</p>
              <p className="mt-1 text-xs text-ink-soft">
                Base {formatPrice(Math.round(r.rate), "ARS")}{r.markup ? ` + ${r.markup}% de margen` : ""} · {SOURCE_LABEL[r.source]}
                {r.fetchedAt && ` · actualizada ${dateTime.format(r.fetchedAt)}`}
              </p>
              <p className="mt-3 rounded-xl bg-sand/70 px-3 py-2 text-xs">
                Ejemplo: un paquete de {formatPrice(1000, r.currency)} se cobra {formatPrice(Math.round(1000 * eff), "ARS")} con Mercado Pago.
              </p>
              {isAdmin && (
                <ActionForm action={saveRate} className="mt-5 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="currency" value={r.currency} />
                  <Field label="Fuente" className="sm:col-span-3">
                    <select name="source" defaultValue={r.source} className="field">
                      {(Object.keys(SOURCE_LABEL) as FxSource[])
                        .filter((s) => r.currency === "USD" || s === "manual" || s === "oficial")
                        .map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
                    </select>
                  </Field>
                  <Field label="Cotización manual" hint="Se ignora si la fuente es automática">
                    <input name="rate" inputMode="decimal" defaultValue={r.rate} className="field" />
                  </Field>
                  <Field label="Margen %" hint="Puede ser negativo">
                    <input name="markup" inputMode="decimal" defaultValue={r.markup} className="field" />
                  </Field>
                  <div className="flex items-end"><SubmitButton className="btn-dark w-full">Guardar</SubmitButton></div>
                </ActionForm>
              )}
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-sm text-ink-soft">
        Las cotizaciones automáticas vienen de DolarAPI (venta) y se refrescan cada hora con el cron <code>/api/cron/exchange-rates</code>. Cada reserva y cada pago guardan la cotización usada en ese momento.
      </p>
    </>
  );
}
