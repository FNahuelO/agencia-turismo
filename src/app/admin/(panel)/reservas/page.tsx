import Link from "next/link";
import { and, asc, count, desc, eq, gt, gte, inArray, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { AlertTriangle, Clock, Plus, Receipt } from "lucide-react";
import { createManualBooking } from "@/app/admin/booking-actions";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { Badge, BOOKING_STATUS_META, EmptyState, Field, PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { BOOKING_STATUSES, type BookingStatus } from "@/db/schema";
import { expireBookings } from "@/lib/bookings";
import { formatPrice, formatShortDate, todayISO } from "@/lib/format";

export const metadata = { title: "Reservas" };

const { bookings, payments, bookingEvents, departures, packages } = schema;
const dateTime = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function ReservasPage({ searchParams }: PageProps<"/admin/reservas">) {
  await expireBookings();
  const sp = await searchParams;
  const estado = BOOKING_STATUSES.includes(sp.estado as BookingStatus) ? (sp.estado as BookingStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const conditions: SQL[] = [];
  if (estado) conditions.push(eq(bookings.status, estado));
  if (q) {
    const term = `%${q}%`;
    conditions.push(or(ilike(bookings.code, term), ilike(bookings.contactName, term), ilike(bookings.contactEmail, term), ilike(bookings.contactPhone, term))!);
  }
  const soon = new Date(Date.now() + 12 * 3600_000);

  const [rows, counts, toReview, alerts, expiring, departureOptions] = await Promise.all([
    db.query.bookings.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: desc(bookings.createdAt),
      limit: 200,
      with: { package: { columns: { title: true, days: true } }, departure: { columns: { date: true } } },
    }),
    db.select({ status: bookings.status, n: count() }).from(bookings).groupBy(bookings.status),
    db.query.payments.findMany({
      where: inArray(payments.status, ["en_revision"]),
      with: { booking: { columns: { id: true, code: true, contactName: true, currency: true } } },
      orderBy: asc(payments.createdAt),
    }),
    db.query.bookingEvents.findMany({
      where: and(eq(bookingEvents.level, "alerta"), eq(bookingEvents.resolved, false)),
      with: { booking: { columns: { id: true, code: true } } },
      orderBy: desc(bookingEvents.createdAt),
      limit: 20,
    }),
    db.query.bookings.findMany({
      where: and(eq(bookings.status, "pendiente"), gt(bookings.expiresAt, new Date()), lte(bookings.expiresAt, soon)),
      columns: { id: true, code: true, contactName: true, expiresAt: true },
    }),
    db
      .select({
        id: departures.id,
        date: departures.date,
        title: packages.title,
        days: packages.days,
        left: sql<number>`${departures.seatsTotal} - ${departures.seatsTaken}`,
      })
      .from(departures)
      .innerJoin(packages, eq(departures.packageId, packages.id))
      .where(and(gte(departures.date, todayISO()), eq(departures.cancelled, false), eq(packages.kind, "paquete")))
      .orderBy(asc(departures.date), asc(packages.title)),
  ]);
  const total = counts.reduce((acc, c) => acc + c.n, 0);
  const reviewAlerts = alerts.filter((a) => !toReview.some((p) => p.bookingId === a.bookingId));

  return (
    <>
      <PageHeader title="Reservas" description="Reservas online y de oficina, con sus pagos y vencimientos." />

      {(toReview.length > 0 || reviewAlerts.length > 0 || expiring.length > 0) && (
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          {toReview.length > 0 && (
            <AlertBox icon={Receipt} title={`${toReview.length} comprobantes para revisar`} tone="violet">
              {toReview.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/reservas/${p.booking.id}`} className="hover:underline">
                    <span className="font-mono">{p.booking.code}</span> · {p.booking.contactName} · {formatPrice(p.amount, p.booking.currency)}
                  </Link>
                </li>
              ))}
            </AlertBox>
          )}
          {reviewAlerts.length > 0 && (
            <AlertBox icon={AlertTriangle} title={`${reviewAlerts.length} alertas sin resolver`} tone="red">
              {reviewAlerts.slice(0, 6).map((a) => (
                <li key={a.id} className="truncate">
                  <Link href={`/admin/reservas/${a.booking.id}`} className="hover:underline">
                    <span className="font-mono">{a.booking.code}</span> · {a.message}
                  </Link>
                </li>
              ))}
            </AlertBox>
          )}
          {expiring.length > 0 && (
            <AlertBox icon={Clock} title={`${expiring.length} vencen en las próximas 12 hs`} tone="sun">
              {expiring.map((b) => (
                <li key={b.id}>
                  <Link href={`/admin/reservas/${b.id}`} className="hover:underline">
                    <span className="font-mono">{b.code}</span> · {b.contactName} · {dateTime.format(b.expiresAt!)}
                  </Link>
                </li>
              ))}
            </AlertBox>
          )}
        </div>
      )}

      <details className="group mb-6 rounded-2xl bg-white ring-1 ring-ink/5">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-5 font-semibold [&::-webkit-details-marker]:hidden">
          <Plus className="size-4 transition-transform group-open:rotate-45" /> Cargar reserva de oficina, teléfono o WhatsApp
        </summary>
        <ActionForm action={createManualBooking} className="grid gap-4 border-t border-ink/5 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Salida" className="sm:col-span-2">
            <select name="departureId" required className="field">
              <option value="">Elegí paquete y fecha</option>
              {departureOptions.map((d) => (
                <option key={d.id} value={d.id} disabled={d.left <= 0}>
                  {d.title} · {d.days}d · {formatShortDate(d.date)} · {d.left > 0 ? `${d.left} libres` : "agotada"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pasajeros"><input name="passengers" type="number" min={1} defaultValue={2} className="field" /></Field>
          <Field label="Titular"><input name="contactName" required className="field" /></Field>
          <Field label="Teléfono"><input name="contactPhone" required className="field" /></Field>
          <Field label="Email"><input name="contactEmail" type="email" className="field" /></Field>
          <Field label="DNI titular"><input name="contactDocument" className="field" /></Field>
          <Field label="Precio por persona" hint="Vacío = tarifa de la salida"><input name="unitPrice" inputMode="numeric" className="field" /></Field>
          <Field label="Origen">
            <select name="source" className="field">
              <option value="oficina">Oficina</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telefono">Teléfono</option>
              <option value="instagram">Instagram</option>
            </select>
          </Field>
          <Field label="Pasajeros (uno por línea: Nombre | DNI)" className="sm:col-span-2 lg:col-span-3">
            <textarea name="passengerList" rows={3} className="field" placeholder={"Ana Pérez | 30111222\nJuan Gómez | 28999888"} />
          </Field>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
            <SubmitButton>Crear reserva</SubmitButton>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="notify" defaultChecked /> Mandarle al pasajero el link de la reserva por email
            </label>
          </div>
        </ActionForm>
      </details>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip href="/admin/reservas" active={!estado} label={`Todas (${total})`} />
        {BOOKING_STATUSES.map((s) => (
          <FilterChip key={s} href={`/admin/reservas?estado=${s}`} active={estado === s} label={`${BOOKING_STATUS_META[s].label} (${counts.find((c) => c.status === s)?.n ?? 0})`} />
        ))}
        <form className="w-full sm:ml-auto sm:w-auto">
          {estado && <input type="hidden" name="estado" value={estado} />}
          <input name="q" defaultValue={q} placeholder="Código, nombre, email o teléfono" className="field py-2 sm:w-64" />
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No hay reservas con este filtro.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/5">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/5 text-left text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Titular</th>
                <th className="px-4 py-3 font-medium">Viaje</th>
                <th className="px-4 py-3 text-right font-medium">Pax</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Abonado</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-sand/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/reservas/${b.id}`} className="font-mono font-semibold text-lake hover:underline">{b.code}</Link>
                    <p className="text-xs text-ink-soft">{dateTime.format(b.createdAt)} · {b.source}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{b.contactName}</p>
                    <p className="text-xs text-ink-soft">{b.contactPhone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-56 truncate">{b.package.title} · {b.package.days}d</p>
                    <p className="text-xs text-ink-soft capitalize">{formatShortDate(b.departure.date)}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.passengers}{b.infants > 0 && `+${b.infants}`}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPrice(b.total, b.currency)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPrice(b.paidAmount, b.currency)}</td>
                  <td className="px-4 py-3"><Badge meta={BOOKING_STATUS_META[b.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AlertBox({ icon: Icon, title, tone, children }: { icon: React.ComponentType<{ className?: string }>; title: string; tone: "violet" | "red" | "sun"; children: React.ReactNode }) {
  const toneClass = { violet: "bg-violet-50", red: "bg-red-50", sun: "bg-sun/15" }[tone];
  return (
    <div className={`rounded-2xl p-5 ${toneClass}`}>
      <p className="flex items-center gap-2 font-semibold"><Icon className="size-4" />{title}</p>
      <ul className="mt-2 space-y-1 text-sm">{children}</ul>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${active ? "bg-ink text-white" : "bg-white ring-1 ring-ink/10 hover:bg-sand"}`}>
      {label}
    </Link>
  );
}
