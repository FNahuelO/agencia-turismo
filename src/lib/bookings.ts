import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lt, notExists, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { BookingEventLevel, BookingStatus } from "@/db/schema";
import { nightDates, parseISODate, toISODate } from "./format";
import { seatsPerDate } from "./pricing";
import { asLocale, localePath } from "./i18n/config";

export { DEFAULT_DEPOSIT_HOURS, DEFAULT_DEPOSIT_PERCENT, quoteBooking, seatsPerDate, type Quote } from "./pricing";

const { bookings, bookingEvents, departures, payments } = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

/** Estados en los que la reserva ocupa lugares en la salida. */
export const ACTIVE_STATUSES: BookingStatus[] = ["pendiente", "confirmada", "pagada"];

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateBookingCode() {
  let code = "TA-";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function generateAccessToken() {
  return randomBytes(24).toString("hex");
}

export function balanceDueDate(departureDate: string, finalPaymentDays: number) {
  const d = parseISODate(departureDate);
  d.setDate(d.getDate() - finalPaymentDays);
  return toISODate(d);
}

/** Ocupa lugares solo si hay cupo; devuelve false si la salida no tiene lugar suficiente. */
export async function reserveSeats(exec: Executor, departureId: number, seats: number) {
  if (seats <= 0) return true;
  const rows = await exec
    .update(departures)
    .set({ seatsTaken: sql`${departures.seatsTaken} + ${seats}` })
    .where(
      and(
        eq(departures.id, departureId),
        eq(departures.cancelled, false),
        sql`${departures.seatsTaken} + ${seats} <= ${departures.seatsTotal}`,
      ),
    )
    .returning({ id: departures.id });
  return rows.length > 0;
}

export async function releaseSeats(exec: Executor, departureId: number, seats: number) {
  if (seats <= 0) return;
  await exec
    .update(departures)
    .set({ seatsTaken: sql`greatest(0, ${departures.seatsTaken} - ${seats})` })
    .where(eq(departures.id, departureId));
}

/** Lo mínimo para saber qué fechas y cuántos lugares ocupa una reserva. */
export type SeatHolder = { packageId: number; departureId: number; passengers: number; units: number | null; nights: number };

/** Filas de `departures` que ocupa la reserva: la salida o, en hoteles, cada noche de la estadía. */
async function slotIds(exec: Executor, b: SeatHolder) {
  if (b.nights <= 1) return [b.departureId];
  const [first] = await exec.select({ date: departures.date }).from(departures).where(eq(departures.id, b.departureId));
  if (!first) return [b.departureId];
  const rows = await exec
    .select({ id: departures.id })
    .from(departures)
    .where(and(eq(departures.packageId, b.packageId), inArray(departures.date, nightDates(first.date, b.nights))));
  return rows.map((r) => r.id);
}

/** Ocupa el cupo de todas las fechas de la reserva, o de ninguna si alguna no tiene lugar. */
export async function reserveBookingSeats(exec: Executor, b: SeatHolder) {
  const ids = await slotIds(exec, b);
  if (ids.length < Math.max(1, b.nights)) return false;
  const seats = seatsPerDate(b);
  const done: number[] = [];
  for (const id of ids) {
    if (!(await reserveSeats(exec, id, seats))) {
      for (const d of done) await releaseSeats(exec, d, seats);
      return false;
    }
    done.push(id);
  }
  return true;
}

export async function releaseBookingSeats(exec: Executor, b: SeatHolder) {
  const seats = seatsPerDate(b);
  for (const id of await slotIds(exec, b)) await releaseSeats(exec, id, seats);
}

export async function logBookingEvent(
  exec: Executor,
  bookingId: number,
  message: string,
  opts: { level?: BookingEventLevel; author?: string } = {},
) {
  await exec.insert(bookingEvents).values({ bookingId, message, level: opts.level ?? "info", author: opts.author ?? null });
}

export function statusForAmounts(paid: number, booking: { total: number; depositAmount: number }): BookingStatus {
  if (paid >= booking.total) return "pagada";
  if (paid >= booking.depositAmount && paid > 0) return "confirmada";
  return "pendiente";
}

/**
 * Recalcula lo pagado a partir de los pagos aprobados y ajusta el estado.
 * Una reserva vencida que recibe un pago tardío intenta recuperar sus lugares.
 */
export async function recalcBooking(bookingId: number) {
  return db.transaction(async (tx) => {
    const booking = await tx.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking) return null;

    const [{ paid }] = await tx
      .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
      .from(payments)
      .where(and(eq(payments.bookingId, bookingId), eq(payments.status, "aprobado")));

    let status = booking.status;
    if (status === "vencida" && paid > booking.paidAmount) {
      const recovered = await reserveBookingSeats(tx, booking);
      if (recovered) {
        status = statusForAmounts(paid, booking);
        await logBookingEvent(tx, bookingId, "Pago recibido después del vencimiento: la reserva se reactivó.", { level: "alerta" });
      } else {
        await logBookingEvent(tx, bookingId, "Pago recibido después del vencimiento y la salida ya no tiene cupo. Revisar reintegro o cambio de fecha.", { level: "alerta" });
      }
    } else if (status !== "cancelada" && status !== "vencida") {
      status = statusForAmounts(paid, booking);
    }

    const patch: Partial<typeof bookings.$inferInsert> = { paidAmount: paid, status };
    if (status === "confirmada" || status === "pagada") patch.expiresAt = null;
    await tx.update(bookings).set(patch).where(eq(bookings.id, bookingId));

    if (status !== booking.status) {
      await logBookingEvent(tx, bookingId, `Estado: ${booking.status} → ${status}`);
    }
    return { ...booking, ...patch };
  });
}

/**
 * Da de baja las reservas pendientes cuyo plazo de seña venció sin pagos aprobados
 * ni pagos en revisión, y libera sus lugares.
 */
export async function expireBookings(departureId?: number) {
  const now = new Date();
  const candidates = await db
    .select({
      id: bookings.id,
      packageId: bookings.packageId,
      departureId: bookings.departureId,
      passengers: bookings.passengers,
      units: bookings.units,
      nights: bookings.nights,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "pendiente"),
        eq(bookings.paidAmount, 0),
        lt(bookings.expiresAt, now),
        departureId ? eq(bookings.departureId, departureId) : undefined,
        notExists(
          db
            .select({ id: payments.id })
            .from(payments)
            .where(and(eq(payments.bookingId, bookings.id), inArray(payments.status, ["pendiente", "en_revision"]))),
        ),
      ),
    );

  const expired: number[] = [];
  for (const b of candidates) {
    const done = await db.transaction(async (tx) => {
      const updated = await tx
        .update(bookings)
        .set({ status: "vencida" })
        .where(and(eq(bookings.id, b.id), eq(bookings.status, "pendiente")))
        .returning({ id: bookings.id });
      if (!updated.length) return false;
      await releaseBookingSeats(tx, b);
      await logBookingEvent(tx, b.id, "Venció el plazo para abonar la seña. Se liberaron los lugares.");
      return true;
    });
    if (done) expired.push(b.id);
  }
  if (expired.length) {
    // Import dinámico: notifications importa este módulo.
    const { notifyBookingClosed } = await import("./notifications");
    for (const id of expired) await notifyBookingClosed(id, "reserva_vencida");
  }
  return expired.length;
}

export function amountDue(booking: { status: BookingStatus; total: number; depositAmount: number; paidAmount: number }) {
  if (booking.status === "cancelada" || booking.status === "vencida") return { deposit: 0, balance: 0 };
  return {
    deposit: Math.max(0, booking.depositAmount - booking.paidAmount),
    balance: Math.max(0, booking.total - booking.paidAmount),
  };
}

export async function getBookingForCustomer(code: string, token: string | undefined) {
  if (!token) return null;
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.code, code.toUpperCase()),
    with: {
      package: { with: { destination: true, policy: true } },
      departure: true,
      passengerList: true,
      payments: { orderBy: (p, { desc }) => desc(p.createdAt) },
    },
  });
  if (!booking) return null;
  const a = Buffer.from(booking.accessToken);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b) ? booking : null;
}

export function bookingUrl(booking: { code: string; accessToken: string; locale?: string }) {
  return localePath(asLocale(booking.locale), `/reserva/${booking.code}?t=${booking.accessToken}`);
}
