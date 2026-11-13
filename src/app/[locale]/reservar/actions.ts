"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { CURRENCIES } from "@/db/schema";
import { placeBooking } from "@/lib/booking-create";
import { amountDue, bookingUrl, getBookingForCustomer, logBookingEvent } from "@/lib/bookings";
import { notifyReceiptUploaded } from "@/lib/notifications";
import { creditForPayment } from "@/lib/exchange-rates";
import { formatPrice } from "@/lib/format";
import { createCheckoutPreference, isMercadoPagoEnabled } from "@/lib/mercadopago";
import { getSettings } from "@/lib/settings";
import { saveReceiptUpload } from "@/lib/storage";
import { asLocale, localePath } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";

export type BookingFormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

const bookingSchema = (e: Dictionary["errors"]) =>
  z.object({
    packageId: z.coerce.number().int().positive(),
    departureId: z.coerce.number().int().positive(e.departure).optional(),
    passengers: z.coerce.number().int().min(1, e.minPax).max(20, e.maxPax),
    infants: z.coerce.number().int().min(0).max(10).default(0),
    singleRoom: z.boolean(),
    contactName: z.string().trim().min(3, e.fullName).max(120),
    contactEmail: z.email(e.email),
    contactPhone: z.string().trim().min(8, e.phone).max(30).regex(/^[\d\s()+-]+$/, e.phone),
    contactDocument: z.string().trim().min(6, e.document).max(20),
    paymentMethod: z.enum(["mercadopago", "transferencia"]),
    payKind: z.enum(["seña", "total"]),
    customerNotes: z.string().trim().max(1000),
    acceptTerms: z.literal(true, e.terms),
  });

const paxSchema = (e: Dictionary["errors"]) =>
  z.object({
    fullName: z.string().trim().min(3, e.paxName).max(120),
    document: z.string().trim().min(6, e.paxDocument).max(20),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  });

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export async function createBooking(_prev: BookingFormState, fd: FormData): Promise<BookingFormState> {
  const locale = asLocale(fd.get("locale"));
  const e = getDictionary(locale).errors;
  if (fd.get("website")) redirect(localePath(locale, "/"));

  const settings = await getSettings();
  if (settings.onlineBooking !== "1") return { status: "error", message: e.paused };

  const parsed = bookingSchema(e).safeParse({
    packageId: fd.get("packageId"),
    departureId: fd.get("departureId") || undefined,
    passengers: fd.get("passengers"),
    infants: fd.get("infants") || 0,
    singleRoom: fd.get("singleRoom") === "on",
    contactName: str(fd, "contactName"),
    contactEmail: str(fd, "contactEmail").toLowerCase(),
    contactPhone: str(fd, "contactPhone"),
    contactDocument: str(fd, "contactDocument"),
    paymentMethod: fd.get("paymentMethod"),
    payKind: fd.get("payKind") || "seña",
    customerNotes: str(fd, "customerNotes"),
    acceptTerms: fd.get("acceptTerms") === "on",
  });

  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { status: "error", message: e.checkFields, fieldErrors };
  }
  const data = parsed.data;

  const names = fd.getAll("paxName").map(String);
  const docs = fd.getAll("paxDocument").map(String);
  const births = fd.getAll("paxBirth").map(String);
  const infantNames = fd.getAll("infantName").map(String);
  const infantBirths = fd.getAll("infantBirth").map(String);

  const passengerRows: { fullName: string; document: string; birthDate: string | null; infant: boolean }[] = [];
  for (let i = 0; i < data.passengers; i++) {
    const pax = paxSchema(e).safeParse({ fullName: names[i] ?? "", document: docs[i] ?? "", birthDate: births[i] || null });
    if (!pax.success) {
      fieldErrors[`pax-${i}`] = pax.error.issues[0].message;
      continue;
    }
    passengerRows.push({ ...pax.data, infant: false });
  }
  for (let i = 0; i < data.infants; i++) {
    const fullName = (infantNames[i] ?? "").trim();
    if (fullName.length < 3) {
      fieldErrors[`infant-${i}`] = e.infantName;
      continue;
    }
    passengerRows.push({ fullName, document: "", birthDate: /^\d{4}-\d{2}-\d{2}$/.test(infantBirths[i] ?? "") ? infantBirths[i] : null, infant: true });
  }
  if (Object.keys(fieldErrors).length) return { status: "error", message: e.paxIncomplete, fieldErrors };

  const result = await placeBooking({
    ...data,
    date: str(fd, "date") || undefined,
    checkOut: str(fd, "checkOut") || undefined,
    units: Number(fd.get("units")) || undefined,
    passengerRows,
    locale,
    source: "web",
  });
  if (!result.ok) return { status: "error", message: result.message, fieldErrors: result.fieldErrors };
  const booking = result.booking;
  const pkg = { title: result.title };

  revalidatePath("/", "layout");

  let destination = `${bookingUrl(booking)}&nueva=1`;
  if (data.paymentMethod === "mercadopago") {
    const amount = data.payKind === "total" ? booking.total : booking.depositAmount;
    try {
      destination = await createCheckoutPreference({ booking, title: pkg.title, amount, kind: data.payKind });
    } catch (e) {
      await logBookingEvent(db, booking.id, `No se pudo iniciar el pago con Mercado Pago: ${(e as Error).message}`, { level: "alerta" });
      destination = `${bookingUrl(booking)}&nueva=1&error=mp`;
    }
  }
  redirect(destination);
}

export async function payBooking(fd: FormData) {
  const booking = await getBookingForCustomer(str(fd, "code"), str(fd, "t"));
  if (!booking) redirect(localePath(asLocale(fd.get("locale")), "/"));
  const due = amountDue(booking);
  const kind = z.enum(["seña", "saldo", "total"]).catch("saldo").parse(fd.get("kind"));
  const amount = kind === "seña" ? due.deposit : due.balance;
  if (amount <= 0 || !isMercadoPagoEnabled()) redirect(bookingUrl(booking));

  let destination: string;
  try {
    destination = await createCheckoutPreference({ booking, title: booking.package.title, amount, kind });
  } catch (e) {
    await logBookingEvent(db, booking.id, `No se pudo iniciar el pago con Mercado Pago: ${(e as Error).message}`, { level: "alerta" });
    destination = `${bookingUrl(booking)}&error=mp`;
  }
  redirect(destination);
}

export type ReceiptFormState = { error?: string; ok?: string } | undefined;

export async function uploadReceipt(_prev: ReceiptFormState, fd: FormData): Promise<ReceiptFormState> {
  const e = getDictionary(asLocale(fd.get("locale"))).errors;
  const booking = await getBookingForCustomer(str(fd, "code"), str(fd, "t"));
  if (!booking) return { error: e.notFound };
  if (booking.status === "cancelada" || booking.status === "vencida") return { error: e.closed };

  const amount = Number(str(fd, "amount").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return { error: e.amount };
  const file = fd.get("receipt");
  if (!(file instanceof File) || file.size === 0) return { error: e.receipt };

  let receipt: string;
  try {
    receipt = await saveReceiptUpload(file, booking.code);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const charged = z.enum(CURRENCIES).catch(booking.currency).parse(fd.get("currency"));
  const { credited, fxRate } = await creditForPayment(Math.round(amount), charged, booking.currency);

  const [payment] = await db.insert(schema.payments).values({
    bookingId: booking.id,
    method: "transferencia",
    status: "en_revision",
    amount: credited,
    currency: booking.currency,
    chargedAmount: Math.round(amount),
    chargedCurrency: charged,
    fxRate,
    receipt,
    reference: str(fd, "reference").slice(0, 120) || null,
  }).returning({ id: schema.payments.id });
  const label = formatPrice(Math.round(amount), charged) + (charged === booking.currency ? "" : ` (${formatPrice(credited, booking.currency)})`);
  await logBookingEvent(db, booking.id, `El pasajero subió un comprobante de transferencia por ${label}.`, { level: "alerta" });
  await notifyReceiptUploaded(payment.id);
  revalidatePath("/[locale]/reserva/[code]", "page");
  revalidatePath("/admin", "layout");
  return { ok: e.receiptOk };
}
