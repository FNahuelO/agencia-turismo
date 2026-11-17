import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, FileText, X } from "lucide-react";
import {
  addBookingNote,
  cancelBooking,
  changeDeparture,
  extendBooking,
  refundPayment,
  registerPayment,
  resolveBookingEvent,
  reviewPayment,
  updateBooking,
} from "@/app/admin/booking-actions";
import { addSupplierCost } from "@/app/admin/accounting-actions";
import { WhatsAppIcon } from "@/components/site/icons";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin/client";
import { Badge, BOOKING_STATUS_META, Card, EMAIL_STATUS_META, Field, PageHeader, PAYMENT_STATUS_META } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { CURRENCIES } from "@/db/schema";
import { getBookingCostSummary } from "@/lib/accounting";
import { getSession } from "@/lib/auth";
import { ACTIVE_STATUSES, amountDue, bookingUrl, seatsPerDate } from "@/lib/bookings";
import { addDaysISO, formatLongDate, formatPrice, formatShortDate, seatsLeft, todayISO } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata = { title: "Reserva" };

const dateTime = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const METHOD_LABEL = { mercadopago: "Mercado Pago", transferencia: "Transferencia", efectivo: "Efectivo" } as const;

export default async function ReservaAdminPage({ params }: PageProps<"/admin/reservas/[id]">) {
  const { id } = await params;
  const session = await getSession();
  const booking = await db.query.bookings.findFirst({
    where: eq(schema.bookings.id, Number(id)),
    with: {
      package: true,
      departure: true,
      passengerList: { orderBy: asc(schema.bookingPassengers.id) },
      payments: { orderBy: desc(schema.payments.createdAt) },
      events: { orderBy: desc(schema.bookingEvents.createdAt) },
    },
  });
  if (!booking) notFound();

  const [otherDepartures, costSummary, emails, suppliers] = await Promise.all([
    db.query.departures.findMany({
      where: and(eq(schema.departures.packageId, booking.packageId), gte(schema.departures.date, todayISO()), eq(schema.departures.cancelled, false)),
      orderBy: asc(schema.departures.date),
    }),
    getBookingCostSummary(booking.id, booking.currency),
    db.query.emailLog.findMany({
      where: eq(schema.emailLog.bookingId, booking.id),
      orderBy: desc(schema.emailLog.createdAt),
      columns: { id: true, kind: true, to: true, subject: true, status: true, error: true, createdAt: true },
    }),
    db.query.suppliers.findMany({ where: eq(schema.suppliers.active, true), orderBy: asc(schema.suppliers.name), columns: { id: true, name: true } }),
  ]);
  const margin = booking.total - costSummary.total;

  const active = ACTIVE_STATUSES.includes(booking.status);
  const due = amountDue(booking);
  const fmt = (n: number) => formatPrice(n, booking.currency);
  const phone = booking.contactPhone.replace(/\D/g, "");
  const wa = whatsappLink(phone.startsWith("54") ? phone : `549${phone}`, `Hola ${booking.contactName.split(" ")[0]}! Te escribo por tu reserva ${booking.code}.`);
  const publicUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${bookingUrl(booking)}`;
  const openAlerts = booking.events.filter((e) => e.level === "alerta" && !e.resolved);

  return (
    <>
      <Link href="/admin/reservas" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="size-4" /> Reservas</Link>
      <PageHeader
        title={`Reserva ${booking.code}`}
        description={`${booking.package.title} · ${formatLongDate(booking.departure.date)}${booking.nights > 0 ? ` al ${formatLongDate(addDaysISO(booking.departure.date, booking.nights))} (${booking.nights} ${booking.nights === 1 ? "noche" : "noches"})` : ""}`}
        actions={
          <>
            <a href={wa} target="_blank" rel="noopener" className="btn-whatsapp px-4 py-2"><WhatsAppIcon className="size-4" /> WhatsApp</a>
            <a href={publicUrl} target="_blank" rel="noopener" className="btn-ghost px-4 py-2"><ExternalLink className="size-4" /> Vista del pasajero</a>
          </>
        }
      />

      {openAlerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {openAlerts.map((e) => (
            <div key={e.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-red-50 p-4 text-sm">
              <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />{e.message}</p>
              <form action={resolveBookingEvent}>
                <input type="hidden" name="eventId" value={e.id} />
                <SubmitButton className="btn-ghost shrink-0 !px-3 !py-1 text-xs">Marcar resuelta</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card title="Pagos">
            {booking.payments.length === 0 ? (
              <p className="text-sm text-ink-soft">Todavía no hay pagos.</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {booking.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {METHOD_LABEL[p.method]} · {fmt(p.amount)}
                        {p.chargedCurrency && p.chargedCurrency !== p.currency && p.chargedAmount != null && (
                          <span className="font-normal text-ink-soft"> ({formatPrice(p.chargedAmount, p.chargedCurrency)} a {formatPrice(Math.round(p.fxRate ?? 0), "ARS")})</span>
                        )}
                      </p>
                      <p className="text-xs text-ink-soft">
                        {dateTime.format(p.createdAt)}
                        {p.externalId && ` · #${p.externalId}`}
                        {p.reference && ` · ${p.reference}`}
                        {p.statusDetail && ` · ${p.statusDetail}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.receipt && (
                        <a href={`/admin/comprobantes/${p.receipt}`} target="_blank" rel="noopener" className="btn-ghost !px-3 !py-1.5 text-xs"><FileText className="size-3.5" /> Comprobante</a>
                      )}
                      {(p.status === "en_revision" || (p.status === "pendiente" && p.method !== "mercadopago")) && (
                        <>
                          <form action={reviewPayment}>
                            <input type="hidden" name="paymentId" value={p.id} />
                            <input type="hidden" name="decision" value="aprobar" />
                            <SubmitButton className="btn !bg-emerald-600 !px-3 !py-1.5 text-xs text-white"><Check className="size-3.5" /> Aprobar</SubmitButton>
                          </form>
                          <form action={reviewPayment}>
                            <input type="hidden" name="paymentId" value={p.id} />
                            <input type="hidden" name="decision" value="rechazar" />
                            <SubmitButton className="btn-ghost !px-3 !py-1.5 text-xs"><X className="size-3.5" /> Rechazar</SubmitButton>
                          </form>
                        </>
                      )}
                      {p.status === "aprobado" && session?.role === "admin" && (
                        <form action={refundPayment}>
                          <input type="hidden" name="paymentId" value={p.id} />
                          <ConfirmButton message="¿Marcar este pago como reintegrado?" className="text-xs text-ink-soft hover:text-red-600">Reintegrar</ConfirmButton>
                        </form>
                      )}
                      <Badge meta={PAYMENT_STATUS_META[p.status]} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {booking.status !== "cancelada" && (
              <ActionForm action={registerPayment} resetOnSuccess className="mt-5 grid items-end gap-3 rounded-xl bg-sand/60 p-4 sm:grid-cols-5">
                <input type="hidden" name="bookingId" value={booking.id} />
                <Field label="Medio">
                  <select name="method" className="field">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="mercadopago">Mercado Pago (link manual)</option>
                  </select>
                </Field>
                <Field label="Monto"><input name="amount" inputMode="numeric" defaultValue={due.deposit || due.balance || ""} required className="field" /></Field>
                <Field label="Moneda" hint={booking.currency === "ARS" ? undefined : "Se convierte al cambio del día"}>
                  <select name="currency" defaultValue={booking.currency} className="field">
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Referencia"><input name="reference" className="field" placeholder="N° operación / recibo" /></Field>
                <SubmitButton>Registrar pago</SubmitButton>
                {booking.contactEmail && (
                  <label className="flex items-center gap-2 text-xs text-ink-soft sm:col-span-5">
                    <input type="checkbox" name="notify" defaultChecked /> Avisar al pasajero por email
                  </label>
                )}
              </ActionForm>
            )}
          </Card>

          <Card
            title="Costos de proveedores"
            actions={
              costSummary.total > 0 ? (
                <span className={`text-sm font-semibold ${margin < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  Margen {fmt(margin)} ({booking.total ? Math.round((margin / booking.total) * 100) : 0}%)
                </span>
              ) : undefined
            }
          >
            {costSummary.costs.length === 0 ? (
              <p className="text-sm text-ink-soft">Sin costos cargados: el margen no se puede calcular.</p>
            ) : (
              <ul className="divide-y divide-ink/5 text-sm">
                {costSummary.costs.map((c) => (
                  <li key={c.id} className={`flex items-start justify-between gap-3 py-2.5 ${c.voided ? "text-ink-soft line-through" : ""}`}>
                    <div>
                      <Link href={`/admin/proveedores/${c.supplierId}`} className="font-medium hover:text-lake hover:underline">{c.supplierName}</Link>
                      <p className="text-xs text-ink-soft">{c.description}{c.dueDate && ` · vence ${formatShortDate(c.dueDate)}`}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{formatPrice(c.amount, c.currency)}</p>
                      <p className="text-xs text-ink-soft">{c.voided ? "Anulado" : c.pending ? `Debe ${formatPrice(c.pending, c.currency)}` : "Pagado"}</p>
                    </div>
                  </li>
                ))}
                <li className="flex justify-between py-2.5 font-semibold">
                  <span>Total costos</span>
                  <span className="tabular-nums">{fmt(costSummary.total)}</span>
                </li>
              </ul>
            )}
            {suppliers.length > 0 ? (
              <ActionForm action={addSupplierCost} resetOnSuccess className="mt-5 grid items-end gap-3 rounded-xl bg-sand/60 p-4 sm:grid-cols-5">
                <input type="hidden" name="bookingId" value={booking.id} />
                <Field label="Proveedor">
                  <select name="supplierId" required className="field">
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Servicio"><input name="description" required className="field" placeholder="Hotel 3 noches" /></Field>
                <Field label="Monto"><input name="amount" inputMode="numeric" required className="field" /></Field>
                <Field label="Moneda">
                  <select name="currency" defaultValue={booking.currency} className="field">
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <SubmitButton>Cargar costo</SubmitButton>
              </ActionForm>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">
                Para cargar costos primero <Link href="/admin/proveedores" className="text-lake hover:underline">creá un proveedor</Link>.
              </p>
            )}
          </Card>

          <Card title={`Pasajeros (${booking.passengers}${booking.infants ? ` + ${booking.infants} bebés` : ""})`}>
            <ul className="divide-y divide-ink/5 text-sm">
              {booking.passengerList.map((p, i) => (
                <li key={p.id} className="flex justify-between gap-3 py-2.5">
                  <span>{i + 1}. {p.fullName}{p.infant && <span className="text-ink-soft"> (bebé)</span>}</span>
                  <span className="text-ink-soft">{p.document}{p.birthDate && ` · ${formatShortDate(p.birthDate)}`}</span>
                </li>
              ))}
            </ul>
            {booking.customerNotes && <p className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm"><strong>Comentario del pasajero:</strong> {booking.customerNotes}</p>}
          </Card>

          <Card title="Titular y notas">
            <ActionForm action={updateBooking} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="bookingId" value={booking.id} />
              <Field label="Nombre"><input name="contactName" defaultValue={booking.contactName} className="field" /></Field>
              <Field label="DNI"><input name="contactDocument" defaultValue={booking.contactDocument} className="field" /></Field>
              <Field label="Email"><input name="contactEmail" type="email" defaultValue={booking.contactEmail} className="field" /></Field>
              <Field label="Teléfono"><input name="contactPhone" defaultValue={booking.contactPhone} className="field" /></Field>
              <Field label="Notas internas" className="sm:col-span-2"><textarea name="internalNotes" rows={2} defaultValue={booking.internalNotes ?? ""} className="field" /></Field>
              <div className="sm:col-span-2"><SubmitButton>Guardar</SubmitButton></div>
            </ActionForm>
          </Card>

          <Card title="Emails" actions={<Link href="/admin/emails" className="text-sm text-lake hover:underline">Ver todos</Link>}>
            {emails.length === 0 ? (
              <p className="text-sm text-ink-soft">No se mandaron emails para esta reserva.</p>
            ) : (
              <ul className="divide-y divide-ink/5 text-sm">
                {emails.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.subject}</p>
                      <p className="text-xs text-ink-soft">{dateTime.format(m.createdAt)} · {m.to}{m.error && ` · ${m.error}`}</p>
                    </div>
                    <Badge meta={EMAIL_STATUS_META[m.status]} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Historial">
            <ActionForm action={addBookingNote} resetOnSuccess className="mb-4 flex gap-2">
              <input type="hidden" name="bookingId" value={booking.id} />
              <input name="message" placeholder="Agregar nota al historial (llamado, acuerdo, etc.)" className="field py-2" />
              <SubmitButton className="btn-ghost py-2">Agregar</SubmitButton>
            </ActionForm>
            <ol className="space-y-3 text-sm">
              {booking.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${e.level === "alerta" ? "bg-red-500" : "bg-ink/20"}`} />
                  <div>
                    <p>{e.message}</p>
                    <p className="text-xs text-ink-soft">{dateTime.format(e.createdAt)}{e.author && ` · ${e.author}`}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <div className="flex items-center justify-between">
              <Badge meta={BOOKING_STATUS_META[booking.status]} />
              <span className="text-xs text-ink-soft capitalize">{booking.source}</span>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label={UNIT_LABEL[booking.package.kind]} value={fmt(booking.unitPrice)} />
              {booking.units !== null && <Row label={booking.package.kind === "hotel" ? "Habitaciones" : "Vehículos"} value={booking.units} />}
              {booking.singleRoom && <Row label="Habitación" value="Single" />}
              <Row label="Total" value={<strong>{fmt(booking.total)}</strong>} />
              <Row label="Seña requerida" value={fmt(booking.depositAmount)} />
              <Row label="Abonado" value={fmt(booking.paidAmount)} />
              <Row label="Saldo" value={<strong className="text-lake">{fmt(due.balance)}</strong>} />
            </dl>
            {booking.status === "pendiente" && booking.expiresAt && (
              <div className="mt-4 rounded-xl bg-sun/15 p-3 text-xs">
                Vence el <strong>{dateTime.format(booking.expiresAt)}</strong>
                <form action={extendBooking} className="mt-2 flex gap-2">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <select name="hours" className="field py-1.5 text-xs" defaultValue="24">
                    <option value="24">+24 hs</option>
                    <option value="48">+48 hs</option>
                    <option value="72">+72 hs</option>
                  </select>
                  <SubmitButton className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">Extender</SubmitButton>
                </form>
              </div>
            )}
            {booking.balanceDueDate && due.balance > 0 && active && (
              <p className="mt-3 text-xs text-ink-soft">Saldo hasta el {formatLongDate(booking.balanceDueDate)}</p>
            )}
            {booking.cancelReason && <p className="mt-3 rounded-xl bg-ink/5 p-3 text-xs">Motivo de cancelación: {booking.cancelReason}</p>}
          </Card>

          {active && booking.nights <= 1 && (
            <Card title={booking.package.kind === "paquete" ? "Cambiar salida" : "Cambiar fecha"}>
              <ActionForm action={changeDeparture} className="space-y-3">
                <input type="hidden" name="bookingId" value={booking.id} />
                <select name="departureId" defaultValue={booking.departureId} className="field">
                  {otherDepartures.map((d) => (
                    <option key={d.id} value={d.id} disabled={d.id !== booking.departureId && seatsLeft(d) < seatsPerDate(booking)}>
                      {formatShortDate(d.date)} · {seatsLeft(d)} libres{d.id === booking.departureId ? " (actual)" : ""}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reprice" /> Actualizar al precio de la nueva salida</label>
                <SubmitButton className="btn-ghost w-full">Mover reserva</SubmitButton>
              </ActionForm>
            </Card>
          )}

          {active && (
            <Card title="Cancelar reserva">
              <ActionForm action={cancelBooking} className="space-y-3">
                <input type="hidden" name="bookingId" value={booking.id} />
                <textarea name="reason" rows={2} required placeholder="Motivo (pedido del pasajero, falta de pago...)" className="field" />
                <p className="text-xs text-ink-soft">Libera el cupo ({seatsPerDate(booking)} por fecha). Los reintegros se marcan en cada pago.</p>
                {booking.contactEmail && (
                  <label className="flex items-center gap-2 text-xs text-ink-soft">
                    <input type="checkbox" name="notify" defaultChecked /> Avisar al pasajero por email
                  </label>
                )}
                <ConfirmButton message="¿Cancelar la reserva y liberar los lugares?" className="btn w-full bg-red-600 text-white hover:bg-red-700">Cancelar reserva</ConfirmButton>
              </ActionForm>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const UNIT_LABEL = { paquete: "Precio por persona", actividad: "Precio por persona", traslado: "Precio por vehículo", hotel: "Promedio por noche y habitación" } as const;
