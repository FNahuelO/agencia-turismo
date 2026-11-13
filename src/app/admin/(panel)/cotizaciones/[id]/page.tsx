import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, ExternalLink, FileDown, Mail, Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import {
  addQuoteItem,
  convertQuoteToBooking,
  deleteQuote,
  deleteQuoteItem,
  duplicateQuote,
  extendQuote,
  moveQuoteItem,
  setQuoteStatus,
  updateQuote,
  updateQuoteItem,
  emailQuote,
} from "@/app/admin/quote-actions";
import { ActionForm, ConfirmButton, CopyField, SubmitButton } from "@/components/admin/client";
import { QuoteItemFields } from "@/components/admin/quote-item-fields";
import { Badge, Card, Field, PageHeader, QUOTE_ITEM_KIND_LABELS, QUOTE_STATUS_META } from "@/components/admin/ui";
import { WhatsAppIcon } from "@/components/site/icons";
import { db, schema } from "@/db";
import { CURRENCIES, type QuoteStatus } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { formatPrice, formatShortDate, todayISO } from "@/lib/format";
import { asLocale, interpolate, LOCALE_LABELS, LOCALES } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { markupOf, quoteDisplayStatus, quoteTotals } from "@/lib/quote-calc";
import { getDepartureOptions, getQuoteWithItems, quotePdfUrl, quoteUrl } from "@/lib/quotes";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata = { title: "Cotización" };

const dateTime = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const STATUS_ACTIONS: { status: Exclude<QuoteStatus, "convertida">; label: string }[] = [
  { status: "enviada", label: "Marcar enviada" },
  { status: "aceptada", label: "Marcar aceptada" },
  { status: "rechazada", label: "Marcar rechazada" },
  { status: "borrador", label: "Volver a borrador" },
];

export default async function CotizacionPage({ params }: PageProps<"/admin/cotizaciones/[id]">) {
  const id = Number((await params).id);
  const [quote, departureOptions, session] = await Promise.all([getQuoteWithItems(id), getDepartureOptions(), getSession()]);
  if (!quote) notFound();
  const booking = quote.bookingId ? await db.query.bookings.findFirst({ where: eq(schema.bookings.id, quote.bookingId), columns: { id: true, code: true } }) : null;

  const today = todayISO();
  const status = quoteDisplayStatus(quote, today);
  const locked = quote.status === "convertida";
  const totals = quoteTotals(quote.items, quote.passengers);
  const fmt = (n: number) => formatPrice(n, quote.currency);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const publicUrl = `${site}${quoteUrl(quote)}`;
  const t = getDictionary(asLocale(quote.locale)).quote;
  const shareText = interpolate(t.share, { name: quote.clientName.split(" ")[0], title: quote.title, url: publicUrl });
  const phone = quote.clientPhone.replace(/\D/g, "");
  const waUrl = phone ? whatsappLink(phone.startsWith("54") ? phone : `549${phone}`, shareText) : null;
  const mailUrl = quote.clientEmail
    ? `mailto:${quote.clientEmail}?subject=${encodeURIComponent(interpolate(t.emailSubject, { code: quote.code, title: quote.title }))}&body=${encodeURIComponent(shareText)}`
    : null;
  const currentDeparture = departureOptions.find((d) => d.id === quote.departureId);

  return (
    <>
      <PageHeader
        title={`${quote.code} · ${quote.title}`}
        description={`${quote.clientName} · ${quote.passengers} pax · creada por ${quote.createdBy || "—"} el ${dateTime.format(quote.createdAt)}`}
        actions={
          <>
            <a href={`${quoteUrl(quote)}&preview=1`} target="_blank" rel="noopener" className="btn-ghost"><ExternalLink className="size-4" /> Ver como cliente</a>
            <a href={quotePdfUrl(quote)} target="_blank" rel="noopener" className="btn-ghost"><FileDown className="size-4" /> PDF</a>
            <form action={duplicateQuote}>
              <input type="hidden" name="id" value={quote.id} />
              <SubmitButton className="btn-ghost"><Copy className="size-4" /> Duplicar</SubmitButton>
            </form>
            {session?.role === "admin" && !locked && (
              <form action={deleteQuote}>
                <input type="hidden" name="id" value={quote.id} />
                <ConfirmButton message="¿Eliminar esta cotización?" className="btn-ghost text-red-600"><Trash2 className="size-4" /></ConfirmButton>
              </form>
            )}
          </>
        }
      />

      {booking && (
        <p className="mb-6 flex items-center gap-2 rounded-2xl bg-violet-50 p-4 text-sm">
          <Ticket className="size-4" /> Convertida en la reserva{" "}
          <Link href={`/admin/reservas/${booking.id}`} className="font-mono font-semibold text-lake hover:underline">{booking.code}</Link>.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card title={`Servicios (${quote.items.length})`}>
            {quote.items.length === 0 && <p className="mb-4 text-sm text-ink-soft">Todavía no cargaste servicios. Agregá alojamiento, aéreos, traslados o excursiones.</p>}
            <ul className="divide-y divide-ink/5">
              {quote.items.map((item, i) => {
                const markup = markupOf(item.unitCost, item.unitPrice);
                return (
                  <li key={item.id} className="py-4 first:pt-0">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-lake uppercase">
                          {QUOTE_ITEM_KIND_LABELS[item.kind]} · {item.supplier || "Propio"}
                        </p>
                        <p className="font-semibold">{item.description}</p>
                        <p className="text-sm text-ink-soft">
                          {[item.dateFrom && formatShortDate(item.dateFrom), item.dateTo && formatShortDate(item.dateTo)].filter(Boolean).join(" → ")}
                          {item.detail && `${item.dateFrom ? " · " : ""}${item.detail}`}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-display text-lg font-bold">{fmt(item.unitPrice * item.quantity)}</p>
                        <p className="text-ink-soft">{item.quantity} × {fmt(item.unitPrice)}</p>
                        {item.unitCost > 0 && (
                          <p className="text-xs text-ink-soft">costo {fmt(item.unitCost * item.quantity)}{markup !== null && ` · markup ${markup}%`}</p>
                        )}
                      </div>
                    </div>
                    {!locked && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <form action={moveQuoteItem}>
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="dir" value="up" />
                          <button disabled={i === 0} className="rounded-lg p-1.5 text-ink-soft hover:bg-sand disabled:opacity-30" aria-label="Subir"><ArrowUp className="size-4" /></button>
                        </form>
                        <form action={moveQuoteItem}>
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="dir" value="down" />
                          <button disabled={i === quote.items.length - 1} className="rounded-lg p-1.5 text-ink-soft hover:bg-sand disabled:opacity-30" aria-label="Bajar"><ArrowDown className="size-4" /></button>
                        </form>
                        <form action={deleteQuoteItem}>
                          <input type="hidden" name="id" value={item.id} />
                          <ConfirmButton message="¿Quitar este servicio?" className="rounded-lg p-1.5 text-ink-soft hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></ConfirmButton>
                        </form>
                        <details className="group w-full">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink-soft hover:bg-sand [&::-webkit-details-marker]:hidden">
                            <Pencil className="size-3.5" /> Editar
                          </summary>
                          <ActionForm action={updateQuoteItem} className="mt-3 rounded-2xl bg-sand/60 p-4">
                            <input type="hidden" name="id" value={item.id} />
                            <QuoteItemFields item={item} />
                            <div className="mt-3"><SubmitButton>Guardar servicio</SubmitButton></div>
                          </ActionForm>
                        </details>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {!locked && (
              <details open={quote.items.length === 0} className="group mt-4 rounded-2xl ring-1 ring-ink/10">
                <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <Plus className="size-4 transition-transform group-open:rotate-45" /> Agregar servicio
                </summary>
                <ActionForm action={addQuoteItem} resetOnSuccess className="border-t border-ink/10 p-4">
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <QuoteItemFields />
                  <div className="mt-3"><SubmitButton>Agregar</SubmitButton></div>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card title="Totales">
            <dl className="grid gap-4 sm:grid-cols-5">
              <Stat label="Total al cliente" value={fmt(totals.total)} strong />
              <Stat label="Por pasajero" value={fmt(totals.perPassenger)} />
              <Stat label="Costo" value={fmt(totals.cost)} />
              <Stat label="Margen" value={fmt(totals.margin)} />
              <Stat label="Margen s/venta" value={`${totals.marginPercent}%`} />
            </dl>
            {totals.cost === 0 && totals.total > 0 && <p className="mt-3 text-xs text-ink-soft">Cargá los costos de cada servicio para ver la rentabilidad real.</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Enviar al cliente" actions={<Badge meta={QUOTE_STATUS_META[status]} />}>
            <CopyField value={publicUrl} label="Link" />
            <div className="mt-3 flex flex-wrap gap-2">
              {waUrl && <a href={waUrl} target="_blank" rel="noopener" className="btn-whatsapp px-3 py-2"><WhatsAppIcon className="size-4" /> WhatsApp</a>}
              {mailUrl && <a href={mailUrl} className="btn-ghost px-3 py-2"><Mail className="size-4" /> Desde mi correo</a>}
            </div>
            {quote.clientEmail ? (
              <ActionForm action={emailQuote} className="mt-3">
                <input type="hidden" name="id" value={quote.id} />
                <SubmitButton className="btn-dark w-full" pendingText="Enviando...">Enviar por email a {quote.clientEmail}</SubmitButton>
              </ActionForm>
            ) : (
              <p className="mt-3 text-xs text-ink-soft">Cargá el email del cliente para mandarla automáticamente.</p>
            )}
            <ul className="mt-4 space-y-1 text-xs text-ink-soft">
              <li>Válida hasta el {formatShortDate(quote.validUntil)}{status === "vencida" && " (vencida)"}</li>
              {quote.sentAt && <li>Enviada: {dateTime.format(quote.sentAt)}</li>}
              <li>{quote.viewedAt ? `El cliente la abrió: ${dateTime.format(quote.viewedAt)}` : "El cliente todavía no la abrió"}</li>
              {quote.respondedAt && <li>Respuesta: {dateTime.format(quote.respondedAt)}</li>}
            </ul>
            {!locked && (
              <div className="mt-4 flex flex-wrap gap-2">
                {STATUS_ACTIONS.filter((a) => a.status !== quote.status).map((a) => (
                  <form key={a.status} action={setQuoteStatus}>
                    <input type="hidden" name="id" value={quote.id} />
                    <input type="hidden" name="status" value={a.status} />
                    <SubmitButton className="rounded-full bg-sand px-3 py-1.5 text-xs font-medium hover:bg-sand-dark">{a.label}</SubmitButton>
                  </form>
                ))}
                <form action={extendQuote}>
                  <input type="hidden" name="id" value={quote.id} />
                  <input type="hidden" name="days" value={7} />
                  <SubmitButton className="rounded-full bg-sand px-3 py-1.5 text-xs font-medium hover:bg-sand-dark">Extender 7 días</SubmitButton>
                </form>
              </div>
            )}
          </Card>

          {!locked && (
            <Card title="Convertir en reserva">
              {quote.departureId ? (
                <ActionForm action={convertQuoteToBooking} className="space-y-3">
                  <input type="hidden" name="id" value={quote.id} />
                  <p className="text-sm text-ink-soft">
                    Ocupa {quote.passengers} lugares en {currentDeparture ? `${currentDeparture.title} · ${formatShortDate(currentDeparture.date)}` : "la salida asociada"} con un total de{" "}
                    <strong className="text-ink">{fmt(totals.total)}</strong>. La seña sale de la política del paquete.
                  </p>
                  <Field label="DNI del titular"><input name="contactDocument" className="field" /></Field>
                  <Field label="Pasajeros (uno por línea: Nombre | DNI)">
                    <textarea name="passengerList" rows={3} className="field" placeholder={"Ana Pérez | 30111222\nJuan Gómez | 28999888"} />
                  </Field>
                  <SubmitButton className="btn-primary w-full">Crear reserva</SubmitButton>
                </ActionForm>
              ) : (
                <p className="text-sm text-ink-soft">
                  Es una cotización a medida. Para reservar con cupo y pagos online, asociale una salida del catálogo en los datos. Si no, gestionala por fuera y marcala como aceptada.
                </p>
              )}
            </Card>
          )}

          <Card title="Datos">
            <ActionForm action={updateQuote} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={quote.id} />
              <Field label="Título" className="sm:col-span-2"><input name="title" required defaultValue={quote.title} disabled={locked} className="field" /></Field>
              <Field label="Cliente" className="sm:col-span-2"><input name="clientName" required defaultValue={quote.clientName} disabled={locked} className="field" /></Field>
              <Field label="Teléfono"><input name="clientPhone" defaultValue={quote.clientPhone} disabled={locked} className="field" /></Field>
              <Field label="Email"><input name="clientEmail" type="email" defaultValue={quote.clientEmail} disabled={locked} className="field" /></Field>
              <Field label="Pasajeros"><input name="passengers" type="number" min={1} defaultValue={quote.passengers} disabled={locked} className="field" /></Field>
              <Field label="Fecha de viaje"><input name="travelDate" type="date" defaultValue={quote.travelDate ?? ""} disabled={locked} className="field" /></Field>
              <Field label="Válida hasta"><input name="validUntil" type="date" defaultValue={quote.validUntil} disabled={locked} className="field" /></Field>
              <Field label="Moneda">
                <select name="currency" defaultValue={quote.currency} disabled={locked} className="field">
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Idioma del cliente" className="sm:col-span-2">
                <select name="locale" defaultValue={quote.locale} disabled={locked} className="field">
                  {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}
                </select>
              </Field>
              <Field label="Salida del catálogo" className="sm:col-span-2">
                <select name="departureId" defaultValue={quote.departureId ?? ""} disabled={locked} className="field">
                  <option value="">Sin salida (a medida)</option>
                  {quote.departureId && !currentDeparture && <option value={quote.departureId}>Salida #{quote.departureId} (pasada o cancelada)</option>}
                  {departureOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.title} · {d.days}d · {formatShortDate(d.date)} · {d.currency} · {d.left} libres</option>
                  ))}
                </select>
              </Field>
              <Field label="Observaciones para el cliente" hint="Se ven en el link y en el PDF." className="sm:col-span-2">
                <textarea name="notes" rows={4} defaultValue={quote.notes} disabled={locked} className="field" placeholder="Tarifas sujetas a disponibilidad. Incluye impuestos..." />
              </Field>
              <Field label="Notas internas" className="sm:col-span-2">
                <textarea name="internalNotes" rows={2} defaultValue={quote.internalNotes} disabled={locked} className="field" />
              </Field>
              {!locked && <div className="sm:col-span-2"><SubmitButton>Guardar datos</SubmitButton></div>}
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={`mt-1 tabular-nums ${strong ? "font-display text-2xl font-bold text-lake" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
