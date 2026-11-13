import Link from "next/link";
import { and, desc, eq, gte, inArray, ilike, lt, or, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { createQuote } from "@/app/admin/quote-actions";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { Badge, EmptyState, Field, PageHeader, QUOTE_STATUS_META } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { CURRENCIES } from "@/db/schema";
import { addDaysISO, formatPrice, formatShortDate, todayISO } from "@/lib/format";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/config";
import { quoteDisplayStatus, type QuoteDisplayStatus } from "@/lib/quote-calc";
import { getDepartureOptions, getQuoteTotalsMap } from "@/lib/quotes";

export const metadata = { title: "Cotizaciones" };

const { quotes } = schema;
const FILTERS: QuoteDisplayStatus[] = ["borrador", "enviada", "vencida", "aceptada", "rechazada", "convertida"];
const dateTime = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function CotizacionesPage({ searchParams }: PageProps<"/admin/cotizaciones">) {
  const sp = await searchParams;
  const estado = FILTERS.includes(sp.estado as QuoteDisplayStatus) ? (sp.estado as QuoteDisplayStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const leadId = Number(sp.lead) || null;
  const today = todayISO();

  const conditions: SQL[] = [];
  if (estado === "vencida") conditions.push(inArray(quotes.status, ["borrador", "enviada"]), lt(quotes.validUntil, today));
  else if (estado === "borrador" || estado === "enviada") conditions.push(eq(quotes.status, estado), gte(quotes.validUntil, today));
  else if (estado) conditions.push(eq(quotes.status, estado));
  if (q) {
    const term = `%${q}%`;
    conditions.push(or(ilike(quotes.code, term), ilike(quotes.clientName, term), ilike(quotes.title, term), ilike(quotes.clientEmail, term), ilike(quotes.clientPhone, term))!);
  }

  const [rows, all, departureOptions, lead] = await Promise.all([
    db.query.quotes.findMany({ where: conditions.length ? and(...conditions) : undefined, orderBy: desc(quotes.createdAt), limit: 200 }),
    db.select({ status: quotes.status, validUntil: quotes.validUntil }).from(quotes),
    getDepartureOptions(),
    leadId ? db.query.leads.findFirst({ where: eq(schema.leads.id, leadId), with: { package: true } }) : undefined,
  ]);
  const totals = await getQuoteTotalsMap(rows.map((r) => r.id));
  const counts = new Map<QuoteDisplayStatus, number>();
  for (const r of all) {
    const s = quoteDisplayStatus(r, today);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader title="Cotizaciones" description="Armá propuestas con servicios propios y de terceros, mandalas con link o PDF y convertilas en reserva." />

      <details open={Boolean(lead)} className="group mb-6 rounded-2xl bg-white ring-1 ring-ink/5">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-5 font-semibold [&::-webkit-details-marker]:hidden">
          <Plus className="size-4 transition-transform group-open:rotate-45" /> Nueva cotización{lead ? ` para ${lead.name}` : ""}
        </summary>
        <ActionForm action={createQuote} className="grid gap-4 border-t border-ink/5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {lead && <input type="hidden" name="leadId" value={lead.id} />}
          <Field label="Título" className="sm:col-span-2">
            <input name="title" required defaultValue={lead?.package ? `Viaje a ${lead.package.title}` : ""} className="field" placeholder="Luna de miel en Bariloche" />
          </Field>
          <Field label="Cliente"><input name="clientName" required defaultValue={lead?.name} className="field" /></Field>
          <Field label="Teléfono"><input name="clientPhone" defaultValue={lead?.phone} className="field" /></Field>
          <Field label="Email"><input name="clientEmail" type="email" defaultValue={lead?.email ?? ""} className="field" /></Field>
          <Field label="Pasajeros"><input name="passengers" type="number" min={1} defaultValue={lead?.passengers ?? 2} className="field" /></Field>
          <Field label="Fecha de viaje"><input name="travelDate" type="date" className="field" /></Field>
          <Field label="Válida hasta"><input name="validUntil" type="date" defaultValue={addDaysISO(today, 7)} className="field" /></Field>
          <Field label="Salida del catálogo" hint="Opcional: agrega el paquete como primer servicio y permite convertirla en reserva." className="sm:col-span-2">
            <select name="departureId" defaultValue={lead?.departureId ?? ""} className="field">
              <option value="">Cotización a medida (sin salida)</option>
              {departureOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} · {d.days}d · {formatShortDate(d.date)} · {d.currency} · {d.left > 0 ? `${d.left} libres` : "agotada"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Moneda" hint="Si elegís salida, se usa la del paquete">
            <select name="currency" defaultValue="ARS" className="field">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Idioma del cliente">
            <select name="locale" defaultValue="es" className="field">
              {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-4"><SubmitButton>Crear y cargar servicios</SubmitButton></div>
        </ActionForm>
      </details>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip href="/admin/cotizaciones" active={!estado} label={`Todas (${all.length})`} />
        {FILTERS.map((s) => (
          <FilterChip key={s} href={`/admin/cotizaciones?estado=${s}`} active={estado === s} label={`${QUOTE_STATUS_META[s].label} (${counts.get(s) ?? 0})`} />
        ))}
        <form className="w-full sm:ml-auto sm:w-auto">
          {estado && <input type="hidden" name="estado" value={estado} />}
          <input name="q" defaultValue={q} placeholder="Código, cliente o título" className="field py-2 sm:w-64" />
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No hay cotizaciones con este filtro.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/5">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/5 text-left text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Propuesta</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Margen</th>
                <th className="px-4 py-3 font-medium">Válida hasta</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((r) => {
                const t = totals.get(r.id) ?? { total: 0, cost: 0 };
                const status = quoteDisplayStatus(r, today);
                return (
                  <tr key={r.id} className="hover:bg-sand/50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/cotizaciones/${r.id}`} className="font-mono font-semibold text-lake hover:underline">{r.code}</Link>
                      <p className="text-xs text-ink-soft">{dateTime.format(r.createdAt)}{r.createdBy && ` · ${r.createdBy}`}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.clientName}</p>
                      <p className="text-xs text-ink-soft">{r.clientPhone || r.clientEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-64 truncate">{r.title}</p>
                      <p className="text-xs text-ink-soft">{r.passengers} pax{r.travelDate && ` · ${formatShortDate(r.travelDate)}`}{r.viewedAt && " · vista por el cliente"}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPrice(t.total, r.currency)}</td>
                    <td className="px-4 py-3 text-right text-ink-soft tabular-nums">{t.cost > 0 ? formatPrice(t.total - t.cost, r.currency) : "—"}</td>
                    <td className="px-4 py-3 capitalize">{formatShortDate(r.validUntil)}</td>
                    <td className="px-4 py-3"><Badge meta={QUOTE_STATUS_META[status]} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${active ? "bg-ink text-white" : "bg-white ring-1 ring-ink/10 hover:bg-sand"}`}>
      {label}
    </Link>
  );
}
