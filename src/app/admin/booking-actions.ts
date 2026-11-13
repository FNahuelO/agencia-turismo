"use server";

import { and, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { CURRENCIES } from "@/db/schema";
import { getSession, requireSession } from "@/lib/auth";
import { creditForPayment, getRates } from "@/lib/exchange-rates";
import {
  ACTIVE_STATUSES,
  balanceDueDate,
  DEFAULT_DEPOSIT_HOURS,
  generateAccessToken,
  generateBookingCode,
  logBookingEvent,
  quoteBooking,
  recalcBooking,
  releaseBookingSeats,
  releaseSeats,
  reserveSeats,
  seatsPerDate,
} from "@/lib/bookings";
import { formatPrice, formatShortDate, todayISO } from "@/lib/format";
import { notifyBookingClosed, notifyBookingCreated, notifyPaymentApproved } from "@/lib/notifications";
import type { FormState } from "./actions";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function refresh(bookingId?: number) {
  revalidatePath("/", "layout");
  if (bookingId) revalidatePath(`/admin/reservas/${bookingId}`);
}

async function author() {
  return (await getSession())?.name ?? "admin";
}

function parseAmount(value: string) {
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

/* ---------- Pagos ---------- */

export async function registerPayment(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const bookingId = Number(fd.get("bookingId"));
  const method = z.enum(["efectivo", "transferencia", "mercadopago"]).safeParse(fd.get("method"));
  const amount = parseAmount(str(fd, "amount"));
  if (!method.success) return { error: "Elegí el medio de pago" };
  if (!(amount > 0)) return { error: "Ingresá un monto válido" };

  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
  if (!booking) return { error: "Reserva no encontrada" };

  const charged = z.enum(CURRENCIES).catch(booking.currency).parse(fd.get("currency"));
  const { credited, fxRate } = await creditForPayment(amount, charged, booking.currency);

  const [payment] = await db.insert(schema.payments).values({
    bookingId,
    method: method.data,
    status: "aprobado",
    paidAt: new Date(),
    amount: credited,
    currency: booking.currency,
    chargedAmount: amount,
    chargedCurrency: charged,
    fxRate,
    reference: str(fd, "reference") || null,
  }).returning({ id: schema.payments.id });
  const label = formatPrice(amount, charged) + (charged === booking.currency ? "" : ` (${formatPrice(credited, booking.currency)})`);
  await logBookingEvent(db, bookingId, `Pago registrado: ${method.data} por ${label}.`, { author: await author() });
  await recalcBooking(bookingId);
  if (fd.get("notify") === "on") await notifyPaymentApproved(payment.id);
  refresh(bookingId);
  return { ok: "Pago registrado" };
}

export async function reviewPayment(fd: FormData) {
  await requireSession();
  const paymentId = Number(fd.get("paymentId"));
  const decision = str(fd, "decision");
  const payment = await db.query.payments.findFirst({ where: eq(schema.payments.id, paymentId) });
  if (!payment || (payment.status !== "en_revision" && payment.status !== "pendiente")) return;

  const approve = decision === "aprobar";
  await db
    .update(schema.payments)
    .set({ status: approve ? "aprobado" : "rechazado", ...(approve && { paidAt: new Date() }) })
    .where(eq(schema.payments.id, paymentId));
  await logBookingEvent(
    db,
    payment.bookingId,
    `${approve ? "Aprobado" : "Rechazado"} el pago por ${formatPrice(payment.amount, payment.currency)} (${payment.method}).`,
    { author: await author(), level: approve ? "info" : "alerta" },
  );
  await db
    .update(schema.bookingEvents)
    .set({ resolved: true })
    .where(and(eq(schema.bookingEvents.bookingId, payment.bookingId), eq(schema.bookingEvents.level, "alerta"), eq(schema.bookingEvents.resolved, false)));
  await recalcBooking(payment.bookingId);
  if (approve) await notifyPaymentApproved(paymentId);
  refresh(payment.bookingId);
}

export async function refundPayment(fd: FormData) {
  await requireSession("admin");
  const paymentId = Number(fd.get("paymentId"));
  const payment = await db.query.payments.findFirst({ where: eq(schema.payments.id, paymentId) });
  if (!payment || payment.status !== "aprobado") return;
  await db.update(schema.payments).set({ status: "reintegrado", refundedAt: new Date() }).where(eq(schema.payments.id, paymentId));
  await logBookingEvent(db, payment.bookingId, `Pago por ${formatPrice(payment.amount, payment.currency)} marcado como reintegrado.`, { author: await author() });
  await recalcBooking(payment.bookingId);
  refresh(payment.bookingId);
}

/* ---------- Gestión de la reserva ---------- */

export async function cancelBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const bookingId = Number(fd.get("bookingId"));
  const reason = str(fd, "reason");
  if (reason.length < 3) return { error: "Indicá el motivo de la cancelación" };

  const done = await db.transaction(async (tx) => {
    const booking = await tx.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
    if (!booking || !ACTIVE_STATUSES.includes(booking.status)) return false;
    await tx.update(schema.bookings).set({ status: "cancelada", cancelReason: reason, expiresAt: null }).where(eq(schema.bookings.id, bookingId));
    await releaseBookingSeats(tx, booking);
    await logBookingEvent(tx, bookingId, `Reserva cancelada: ${reason}. Se liberó el cupo (${seatsPerDate(booking)} por fecha).`, { author: await author() });
    return true;
  });
  if (!done) return { error: "La reserva ya no está activa" };
  if (fd.get("notify") === "on") await notifyBookingClosed(bookingId, "reserva_cancelada");
  refresh(bookingId);
  return { ok: "Reserva cancelada" };
}

export async function extendBooking(fd: FormData) {
  await requireSession();
  const bookingId = Number(fd.get("bookingId"));
  const hours = Math.min(240, Math.max(1, Number(fd.get("hours")) || 24));
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
  if (!booking || booking.status !== "pendiente") return;
  const base = Math.max(Date.now(), booking.expiresAt?.getTime() ?? 0);
  await db.update(schema.bookings).set({ expiresAt: new Date(base + hours * 3600_000) }).where(eq(schema.bookings.id, bookingId));
  await logBookingEvent(db, bookingId, `Plazo de seña extendido ${hours} hs.`, { author: await author() });
  refresh(bookingId);
}

export async function changeDeparture(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const bookingId = Number(fd.get("bookingId"));
  const departureId = Number(fd.get("departureId"));
  const repricing = fd.get("reprice") === "on";

  const result = await db.transaction(async (tx) => {
    const booking = await tx.query.bookings.findFirst({
      where: eq(schema.bookings.id, bookingId),
      with: { package: { with: { policy: true } }, departure: true },
    });
    if (!booking || !ACTIVE_STATUSES.includes(booking.status)) return "La reserva no está activa";
    if (booking.departureId === departureId) return "Es la misma salida";
    if (booking.nights > 1) return "Para cambiar las fechas de una estadía de hotel, cancelá la reserva y cargá una nueva";
    const target = await tx.query.departures.findFirst({
      where: and(eq(schema.departures.id, departureId), eq(schema.departures.packageId, booking.packageId), eq(schema.departures.cancelled, false)),
    });
    if (!target) return "Salida inválida";
    const seats = seatsPerDate(booking);
    if (!(await reserveSeats(tx, target.id, seats))) return "La nueva salida no tiene lugares suficientes";
    await releaseSeats(tx, booking.departureId, seats);

    const patch: Partial<typeof schema.bookings.$inferInsert> = {
      departureId: target.id,
      balanceDueDate: balanceDueDate(target.date, booking.package.policy?.finalPaymentDays ?? 10),
    };
    if (repricing) {
      const q = quoteBooking({
        pkg: booking.package,
        departure: target,
        policy: booking.package.policy,
        passengers: booking.passengers,
        singleRoom: booking.singleRoom,
        units: booking.units ?? undefined,
      });
      Object.assign(patch, { unitPrice: q.unitPrice, total: q.total, depositAmount: q.depositAmount });
    }
    await tx.update(schema.bookings).set(patch).where(eq(schema.bookings.id, bookingId));
    await logBookingEvent(
      tx,
      bookingId,
      `Cambio de salida: ${formatShortDate(booking.departure.date)} → ${formatShortDate(target.date)}${repricing ? " (precio actualizado)" : ""}.`,
      { author: await author() },
    );
    return null;
  });
  if (result) return { error: result };
  await recalcBooking(bookingId);
  refresh(bookingId);
  return { ok: "Salida actualizada" };
}

const contactSchema = z.object({
  contactName: z.string().min(3, "Nombre inválido"),
  contactEmail: z.email("Email inválido"),
  contactPhone: z.string().min(6, "Teléfono inválido"),
  contactDocument: z.string(),
  internalNotes: z.string().max(2000),
});

export async function updateBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const bookingId = Number(fd.get("bookingId"));
  const parsed = contactSchema.safeParse({
    contactName: str(fd, "contactName"),
    contactEmail: str(fd, "contactEmail").toLowerCase(),
    contactPhone: str(fd, "contactPhone"),
    contactDocument: str(fd, "contactDocument"),
    internalNotes: str(fd, "internalNotes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.update(schema.bookings).set({ ...parsed.data, internalNotes: parsed.data.internalNotes || null }).where(eq(schema.bookings.id, bookingId));
  refresh(bookingId);
  return { ok: "Datos guardados" };
}

export async function addBookingNote(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const bookingId = Number(fd.get("bookingId"));
  const message = str(fd, "message");
  if (message.length < 2) return { error: "Escribí la nota" };
  await logBookingEvent(db, bookingId, message.slice(0, 1000), { author: await author() });
  refresh(bookingId);
  return { ok: "Nota agregada" };
}

export async function resolveBookingEvent(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("eventId"));
  const [row] = await db.update(schema.bookingEvents).set({ resolved: true }).where(eq(schema.bookingEvents.id, id)).returning({ bookingId: schema.bookingEvents.bookingId });
  if (row) refresh(row.bookingId);
}

/* ---------- Reserva cargada desde la oficina ---------- */

const manualSchema = z.object({
  departureId: z.coerce.number().int().positive("Elegí una salida"),
  passengers: z.coerce.number().int().min(1).max(60),
  contactName: z.string().min(3, "Ingresá el nombre del titular"),
  contactPhone: z.string().min(6, "Ingresá el teléfono"),
  contactEmail: z.union([z.literal(""), z.email("Email inválido")]),
  contactDocument: z.string(),
  source: z.string().min(1),
});

export async function createManualBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = manualSchema.safeParse({
    departureId: fd.get("departureId"),
    passengers: fd.get("passengers"),
    contactName: str(fd, "contactName"),
    contactPhone: str(fd, "contactPhone"),
    contactEmail: str(fd, "contactEmail").toLowerCase(),
    contactDocument: str(fd, "contactDocument"),
    source: str(fd, "source") || "oficina",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const departure = await db.query.departures.findFirst({
    where: and(eq(schema.departures.id, data.departureId), eq(schema.departures.cancelled, false), gte(schema.departures.date, todayISO())),
    with: { package: { with: { policy: true } } },
  });
  if (!departure) return { error: "Salida inválida" };
  const pkg = departure.package;

  const quote = quoteBooking({ pkg, departure, policy: pkg.policy, passengers: data.passengers, singleRoom: false });
  const customUnit = parseAmount(str(fd, "unitPrice"));
  if (customUnit > 0) {
    quote.unitPrice = customUnit;
    quote.total = customUnit * data.passengers;
    quote.depositAmount = Math.round((quote.total * quote.depositPercent) / 100);
  }

  const passengerLines = str(fd, "passengerList")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [fullName, document = ""] = l.split("|").map((s) => s.trim());
      return { fullName, document };
    });

  let code = generateBookingCode();
  while (await db.query.bookings.findFirst({ where: eq(schema.bookings.code, code), columns: { id: true } })) code = generateBookingCode();

  const booking = await db.transaction(async (tx) => {
    if (!(await reserveSeats(tx, departure.id, data.passengers))) return null;
    const [row] = await tx
      .insert(schema.bookings)
      .values({
        code,
        accessToken: generateAccessToken(),
        packageId: pkg.id,
        departureId: departure.id,
        passengers: data.passengers,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        contactDocument: data.contactDocument,
        unitPrice: quote.unitPrice,
        total: quote.total,
        depositAmount: quote.depositAmount,
        currency: pkg.currency,
        fxRate: (await getRates())[pkg.currency],
        paymentMethod: "transferencia",
        expiresAt: new Date(Date.now() + (pkg.policy?.depositHours ?? DEFAULT_DEPOSIT_HOURS) * 3600_000),
        balanceDueDate: balanceDueDate(departure.date, pkg.policy?.finalPaymentDays ?? 10),
        source: data.source,
      })
      .returning({ id: schema.bookings.id });
    const paxRows = passengerLines.length ? passengerLines : [{ fullName: data.contactName, document: data.contactDocument }];
    await tx.insert(schema.bookingPassengers).values(paxRows.map((p) => ({ ...p, bookingId: row.id })));
    await logBookingEvent(tx, row.id, `Reserva cargada desde ${data.source}.`, { author: session.name });
    return row;
  });
  if (!booking) return { error: "La salida no tiene lugares suficientes" };
  if (fd.get("notify") === "on") await notifyBookingCreated(booking.id);
  refresh();
  redirect(`/admin/reservas/${booking.id}`);
}
