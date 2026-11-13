import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Booking } from "@/db/schema";
import {
  balanceDueDate,
  DEFAULT_DEPOSIT_HOURS,
  expireBookings,
  generateAccessToken,
  generateBookingCode,
  logBookingEvent,
  quoteBooking,
  reserveBookingSeats,
} from "./bookings";
import { getRates } from "./exchange-rates";
import { daysBetweenISO, formatLongDate, formatPrice, nightDates, todayISO } from "./format";
import { interpolate, type Locale } from "./i18n/config";
import { getDictionary } from "./i18n/dictionaries";
import { isMercadoPagoEnabled } from "./mercadopago";
import { notifyBookingCreated } from "./notifications";
import { ensureDailyDepartures, firstBookableDate, isWeekdayOpen, lastBookableDate, MAX_NIGHTS } from "./products";

export type PassengerInput = { fullName: string; document: string; birthDate: string | null; infant: boolean };

export type NewBookingInput = {
  packageId: number;
  /** Paquetes: salida elegida. */
  departureId?: number;
  /** Productos diarios: fecha (hotel: check-in). */
  date?: string;
  /** Hotel: fecha de salida. */
  checkOut?: string;
  /** Hotel: habitaciones. */
  units?: number;
  passengers: number;
  infants: number;
  singleRoom: boolean;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactDocument: string;
  paymentMethod: "mercadopago" | "transferencia";
  customerNotes: string;
  passengerRows: PassengerInput[];
  locale: Locale;
  /** Origen para el historial y la consulta: web o api. */
  source: "web" | "api";
  apiKey?: { id: number; name: string };
};

export type NewBookingError = { ok: false; reason: "invalid" | "unavailable" | "no_seats"; message: string; fieldErrors?: Record<string, string> };
export type NewBookingResult = { ok: true; booking: Booking; title: string } | NewBookingError;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Crea una reserva con cupo atómico para cualquier tipo de producto. La usan el checkout web y la API.
 * Los mensajes de error salen en el idioma de la reserva.
 */
export async function placeBooking(input: NewBookingInput): Promise<NewBookingResult> {
  const t = getDictionary(input.locale);
  const e = t.errors;
  const p = t.products;
  const fail = (reason: NewBookingError["reason"], message: string, fieldErrors?: Record<string, string>): NewBookingError => ({ ok: false, reason, message, fieldErrors });

  const pkg = await db.query.packages.findFirst({
    where: and(eq(schema.packages.id, input.packageId), eq(schema.packages.published, true)),
    with: { policy: true },
  });
  if (!pkg) return fail("unavailable", e.unavailable);
  if (input.paymentMethod === "mercadopago" && !isMercadoPagoEnabled()) return fail("invalid", e.noMp);

  // Fechas que ocupa la reserva: la salida elegida (paquetes) o el día / las noches (productos diarios).
  let dates: string[] = [];
  let rooms: number | undefined;
  if (pkg.kind === "paquete") {
    if (!input.departureId) return fail("invalid", e.checkFields, { departureId: e.departure });
    const departure = await db.query.departures.findFirst({
      where: and(
        eq(schema.departures.id, input.departureId),
        eq(schema.departures.packageId, pkg.id),
        eq(schema.departures.cancelled, false),
        gte(schema.departures.date, todayISO()),
      ),
    });
    if (!departure) return fail("unavailable", e.unavailable, { departureId: e.unavailable });
    await expireBookings(departure.id);
  } else {
    const date = input.date ?? "";
    const dateError = (message: string) => fail("invalid", message, { date: message });
    if (!ISO_DATE.test(date) || date < firstBookableDate() || date > lastBookableDate()) return dateError(p.invalidDate);
    if (pkg.kind === "hotel") {
      const checkOut = input.checkOut ?? "";
      const nights = ISO_DATE.test(checkOut) ? daysBetweenISO(date, checkOut) : 0;
      if (nights < pkg.minNights) return dateError(interpolate(p.minNightsError, { n: pkg.minNights }));
      if (nights > MAX_NIGHTS) return dateError(interpolate(p.maxNightsError, { n: MAX_NIGHTS }));
      rooms = Math.min(20, Math.max(1, input.units ?? 1));
      if (input.passengers > rooms * pkg.capacityPerUnit) return dateError(p.tooManyGuests);
      dates = nightDates(date, nights);
    } else {
      dates = [date];
    }
    if (!dates.every((d) => isWeekdayOpen(pkg, d))) return fail("unavailable", pkg.kind === "hotel" ? p.nightsClosed : p.closed, { date: p.closed });
    await expireBookings();
  }

  const depositHours = pkg.policy?.depositHours ?? DEFAULT_DEPOSIT_HOURS;
  const fxRate = (await getRates())[pkg.currency];
  let code = generateBookingCode();
  while (await db.query.bookings.findFirst({ where: eq(schema.bookings.code, code), columns: { id: true } })) {
    code = generateBookingCode();
  }

  const result = await db.transaction(async (tx) => {
    const slots = dates.length
      ? await ensureDailyDepartures(tx, pkg, dates)
      : await tx.select().from(schema.departures).where(eq(schema.departures.id, input.departureId!));
    if (slots.length < Math.max(1, dates.length) || slots.some((d) => d.cancelled)) {
      return fail("unavailable", pkg.kind === "hotel" ? p.nightsClosed : dates.length ? p.closed : e.unavailable);
    }
    const first = slots[0];
    const quote = quoteBooking({
      pkg,
      departure: first,
      policy: pkg.policy,
      passengers: input.passengers,
      singleRoom: input.singleRoom,
      units: rooms,
      nightPrices: pkg.kind === "hotel" ? slots.map((d) => d.priceOverride ?? pkg.price) : undefined,
    });
    const holder = { packageId: pkg.id, departureId: first.id, passengers: input.passengers, units: quote.units, nights: quote.nights };
    if (!(await reserveBookingSeats(tx, holder))) return fail("no_seats", e.noSeats);

    const [row] = await tx
      .insert(schema.bookings)
      .values({
        code,
        accessToken: generateAccessToken(),
        ...holder,
        infants: input.infants,
        singleRoom: pkg.kind === "paquete" && input.singleRoom && input.passengers === 1,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        contactDocument: input.contactDocument,
        unitPrice: quote.unitPrice,
        total: quote.total,
        depositAmount: quote.depositAmount,
        currency: pkg.currency,
        fxRate,
        paymentMethod: input.paymentMethod,
        expiresAt: new Date(Date.now() + depositHours * 3600_000),
        balanceDueDate: balanceDueDate(first.date, pkg.policy?.finalPaymentDays ?? 10),
        source: input.source,
        apiKeyId: input.apiKey?.id ?? null,
        customerNotes: input.customerNotes || null,
        locale: input.locale,
      })
      .returning();
    if (input.passengerRows.length) {
      await tx.insert(schema.bookingPassengers).values(input.passengerRows.map((r) => ({ ...r, bookingId: row.id })));
    }
    const stay = quote.nights > 0 ? `, ${quote.units} hab. × ${quote.nights} noches desde ${formatLongDate(first.date)}` : quote.units ? `, ${quote.units} vehículo(s)` : "";
    const origin = input.apiKey ? `la API (clave "${input.apiKey.name}")` : "la web";
    await logBookingEvent(tx, row.id, `Reserva creada desde ${origin}: ${input.passengers} pasajeros${stay}, total ${formatPrice(quote.total, pkg.currency)}.`);
    await tx.insert(schema.leads).values({
      name: input.contactName,
      phone: input.contactPhone,
      email: input.contactEmail,
      packageId: pkg.id,
      departureId: first.id,
      passengers: input.passengers,
      message: `Reserva online ${code}`,
      source: input.source === "api" ? "reserva-api" : "reserva-web",
      status: "reservado",
    });
    return { ok: true as const, booking: row, title: pkg.title };
  });
  if (result.ok) await notifyBookingCreated(result.booking.id);
  return result;
}
