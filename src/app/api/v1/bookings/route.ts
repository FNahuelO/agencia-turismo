import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { BOOKING_STATUSES } from "@/db/schema";
import { ApiError, apiJson, apiRoute } from "@/lib/api";
import { bookingWith, getProductForApi, serializeBooking } from "@/lib/api-data";
import { placeBooking } from "@/lib/booking-create";
import { logBookingEvent } from "@/lib/bookings";
import { LOCALES } from "@/lib/i18n/config";
import { createCheckoutPreference } from "@/lib/mercadopago";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const bodySchema = z.object({
  product: z.union([z.string().min(1), z.number().int().positive()]),
  departureId: z.number().int().positive().optional(),
  date: z.string().regex(ISO_DATE).optional(),
  checkOut: z.string().regex(ISO_DATE).optional(),
  rooms: z.number().int().min(1).max(20).optional(),
  singleRoom: z.boolean().default(false),
  contact: z.object({
    name: z.string().trim().min(3).max(120),
    email: z.email(),
    phone: z.string().trim().min(6).max(30),
    document: z.string().trim().min(6).max(20),
  }),
  travelers: z
    .array(
      z.object({
        fullName: z.string().trim().min(3).max(120),
        document: z.string().trim().max(20).default(""),
        birthDate: z.string().regex(ISO_DATE).nullable().default(null),
        infant: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(30)
    .superRefine((list, ctx) => {
      const adults = list.filter((t) => !t.infant);
      if (adults.length === 0) ctx.addIssue({ code: "custom", message: "Tiene que haber al menos un adulto" });
      if (adults.length > 20) ctx.addIssue({ code: "custom", message: "Máximo 20 adultos por reserva" });
      adults.forEach((t, i) => {
        if (t.document.length < 6) ctx.addIssue({ code: "custom", path: [list.indexOf(t), "document"], message: `Documento obligatorio para el adulto ${i + 1}` });
      });
    }),
  notes: z.string().trim().max(1000).default(""),
  paymentMethod: z.enum(["bank_transfer", "mercadopago"]).default("bank_transfer"),
  /** Con Mercado Pago: cobrar la seña o el total. */
  payAmount: z.enum(["deposit", "total"]).default("deposit"),
  locale: z.enum(LOCALES).default("es"),
});

const STATUS_BY_REASON = { invalid: 422, unavailable: 409, no_seats: 409 } as const;

export const POST = apiRoute("bookings:write", async (req, client) => {
  const settings = await getSettings();
  if (settings.onlineBooking !== "1") throw new ApiError(503, "booking_paused", "Las reservas online están pausadas");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "El cuerpo debe ser JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(422, "validation_error", "Datos inválidos", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const data = parsed.data;

  const pkg = await getProductForApi(data.product);
  if (!pkg) throw new ApiError(404, "product_not_found", "Producto inexistente o no publicado");

  const adults = data.travelers.filter((t) => !t.infant);
  const result = await placeBooking({
    packageId: pkg.id,
    departureId: data.departureId,
    date: data.date,
    checkOut: data.checkOut,
    units: data.rooms,
    passengers: adults.length,
    infants: data.travelers.length - adults.length,
    singleRoom: data.singleRoom,
    contactName: data.contact.name,
    contactEmail: data.contact.email.toLowerCase(),
    contactPhone: data.contact.phone,
    contactDocument: data.contact.document,
    paymentMethod: data.paymentMethod === "mercadopago" ? "mercadopago" : "transferencia",
    customerNotes: data.notes,
    passengerRows: data.travelers.map((t) => ({ fullName: t.fullName, document: t.document, birthDate: t.birthDate, infant: t.infant })),
    locale: data.locale,
    source: "api",
    apiKey: { id: client.id, name: client.name },
  });
  if (!result.ok) {
    throw new ApiError(STATUS_BY_REASON[result.reason], result.reason, result.message, result.fieldErrors);
  }
  revalidatePath("/", "layout");

  let checkoutUrl: string | null = null;
  if (data.paymentMethod === "mercadopago") {
    const kind = data.payAmount === "total" ? "total" : "seña";
    const amount = kind === "total" ? result.booking.total : result.booking.depositAmount;
    try {
      checkoutUrl = await createCheckoutPreference({ booking: result.booking, title: result.title, amount, kind });
    } catch (e) {
      await logBookingEvent(db, result.booking.id, `No se pudo iniciar el pago con Mercado Pago: ${(e as Error).message}`, { level: "alerta" });
    }
  }

  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, result.booking.id), with: bookingWith });
  return apiJson({ data: serializeBooking(req, booking!), checkoutUrl }, { status: 201 });
});

export const GET = apiRoute("bookings:read", async (req, client) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  if (status && !(BOOKING_STATUSES as readonly string[]).includes(status)) {
    throw new ApiError(422, "invalid_status", `status debe ser uno de: ${BOOKING_STATUSES.join(", ")}`);
  }
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const rows = await db.query.bookings.findMany({
    where: and(eq(schema.bookings.apiKeyId, client.id), status ? eq(schema.bookings.status, status as (typeof BOOKING_STATUSES)[number]) : undefined),
    with: bookingWith,
    orderBy: desc(schema.bookings.createdAt),
    limit,
  });
  return apiJson({ data: rows.map((b) => serializeBooking(req, b)) });
});
