"use server";

import { and, asc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { CURRENCIES, QUOTE_ITEM_KINDS, QUOTE_STATUSES, type Quote, type QuoteItem, type QuoteItemKind, type SupplierKind } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import {
  balanceDueDate,
  DEFAULT_DEPOSIT_HOURS,
  DEFAULT_DEPOSIT_PERCENT,
  generateAccessToken,
  generateBookingCode,
  logBookingEvent,
  reserveSeats,
  type Executor,
} from "@/lib/bookings";
import { getRates } from "@/lib/exchange-rates";
import { addDaysISO, formatDuration, formatPrice, formatShortDate, todayISO } from "@/lib/format";
import { LOCALES } from "@/lib/i18n/config";
import { priceFromMarkup, quoteTotals } from "@/lib/quote-calc";
import { notifyBookingCreated, sendQuoteEmail } from "@/lib/notifications";
import { generateQuoteCode } from "@/lib/quotes";
import type { FormState } from "./actions";

const { quotes, quoteItems } = schema;

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function parseAmount(value: string) {
  if (!value) return NaN;
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function refresh(quoteId?: number) {
  revalidatePath("/admin/cotizaciones");
  if (quoteId) revalidatePath(`/admin/cotizaciones/${quoteId}`);
}

const isoDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).transform((v) => v || null);

const headerSchema = z.object({
  title: z.string().min(3, "Poné un título a la cotización").max(160),
  clientName: z.string().min(2, "Ingresá el nombre del cliente").max(120),
  clientEmail: z.union([z.literal(""), z.email("Email inválido")]),
  clientPhone: z.string().max(40),
  passengers: z.coerce.number().int().min(1, "Mínimo 1 pasajero").max(200),
  travelDate: isoDate,
  currency: z.enum(CURRENCIES),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de validez inválida"),
  locale: z.enum(LOCALES),
  departureId: z.coerce.number().int().positive().nullable(),
});

function readHeader(fd: FormData) {
  return headerSchema.safeParse({
    title: str(fd, "title"),
    clientName: str(fd, "clientName"),
    clientEmail: str(fd, "clientEmail").toLowerCase(),
    clientPhone: str(fd, "clientPhone"),
    passengers: fd.get("passengers") || 2,
    travelDate: str(fd, "travelDate"),
    currency: fd.get("currency") || "ARS",
    validUntil: str(fd, "validUntil") || addDaysISO(todayISO(), 7),
    locale: fd.get("locale") || "es",
    departureId: Number(fd.get("departureId")) || null,
  });
}

async function loadDeparture(id: number | null) {
  if (!id) return null;
  return db.query.departures.findFirst({ where: eq(schema.departures.id, id), with: { package: { with: { policy: true } } } }) ?? null;
}

export async function createQuote(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = readHeader(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  const leadId = Number(fd.get("leadId")) || null;

  const departure = await loadDeparture(data.departureId);
  if (data.departureId && !departure) return { error: "Salida inválida" };

  const [row] = await db
    .insert(quotes)
    .values({
      ...data,
      code: await generateQuoteCode(),
      accessToken: generateAccessToken(),
      currency: departure?.package.currency ?? data.currency,
      packageId: departure?.packageId ?? null,
      travelDate: data.travelDate ?? departure?.date ?? null,
      leadId,
      createdBy: session.name,
    })
    .returning({ id: quotes.id });

  if (departure) {
    const pkg = departure.package;
    await db.insert(quoteItems).values({
      quoteId: row.id,
      kind: "paquete",
      description: `${pkg.title} · ${formatDuration(pkg.days, pkg.nights)}`,
      detail: [pkg.transportDetail, pkg.hotel, pkg.board].filter(Boolean).join(" · "),
      dateFrom: departure.date,
      quantity: data.passengers,
      unitPrice: departure.priceOverride ?? pkg.price,
    });
  }
  if (leadId) await db.update(schema.leads).set({ status: "cotizado" }).where(eq(schema.leads.id, leadId));

  refresh();
  redirect(`/admin/cotizaciones/${row.id}`);
}

export async function updateQuote(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(fd.get("id"));
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
  if (!quote) return { error: "Cotización inexistente" };
  if (quote.status === "convertida") return { error: "La cotización ya se convirtió en reserva" };
  const parsed = readHeader(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const departure = await loadDeparture(parsed.data.departureId);
  if (parsed.data.departureId && !departure) return { error: "Salida inválida" };
  if (departure && departure.package.currency !== parsed.data.currency) {
    return { error: `La salida elegida se vende en ${departure.package.currency}: usá esa moneda para poder convertirla en reserva` };
  }

  await db
    .update(quotes)
    .set({
      ...parsed.data,
      packageId: departure?.packageId ?? null,
      notes: str(fd, "notes"),
      internalNotes: str(fd, "internalNotes"),
    })
    .where(eq(quotes.id, id));
  refresh(id);
  return { ok: "Cotización guardada" };
}

const itemSchema = z.object({
  kind: z.enum(QUOTE_ITEM_KINDS),
  description: z.string().min(2, "Describí el servicio").max(200),
  detail: z.string().max(1000),
  supplier: z.string().max(120),
  dateFrom: isoDate,
  dateTo: isoDate,
  quantity: z.coerce.number().int().min(1, "La cantidad mínima es 1").max(500),
  unitCost: z.number().int().min(0, "El costo no puede ser negativo"),
  unitPrice: z.number().int().min(0, "El precio no puede ser negativo"),
});

function readItem(fd: FormData) {
  const unitCost = parseAmount(str(fd, "unitCost"));
  const markup = Number(str(fd, "markup").replace(",", "."));
  let unitPrice = parseAmount(str(fd, "unitPrice"));
  const cost = Number.isNaN(unitCost) ? 0 : unitCost;
  if (Number.isNaN(unitPrice)) unitPrice = Number.isFinite(markup) && str(fd, "markup") !== "" ? priceFromMarkup(cost, markup) : cost;
  return itemSchema.safeParse({
    kind: fd.get("kind") || "otro",
    description: str(fd, "description"),
    detail: str(fd, "detail"),
    supplier: str(fd, "supplier"),
    dateFrom: str(fd, "dateFrom"),
    dateTo: str(fd, "dateTo"),
    quantity: fd.get("quantity") || 1,
    unitCost: cost,
    unitPrice,
  });
}

async function editableQuote(id: number) {
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id), columns: { id: true, status: true } });
  if (!quote) return { error: "Cotización inexistente" } as const;
  if (quote.status === "convertida") return { error: "La cotización ya se convirtió en reserva" } as const;
  return { quote } as const;
}

export async function addQuoteItem(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const quoteId = Number(fd.get("quoteId"));
  const check = await editableQuote(quoteId);
  if ("error" in check) return { error: check.error };
  const parsed = readItem(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const last = await db.query.quoteItems.findFirst({ where: eq(quoteItems.quoteId, quoteId), orderBy: (i, { desc }) => desc(i.position) });
  await db.insert(quoteItems).values({ ...parsed.data, quoteId, position: (last?.position ?? 0) + 1 });
  refresh(quoteId);
  return { ok: "Servicio agregado" };
}

export async function updateQuoteItem(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(fd.get("id"));
  const item = await db.query.quoteItems.findFirst({ where: eq(quoteItems.id, id) });
  if (!item) return { error: "Servicio inexistente" };
  const check = await editableQuote(item.quoteId);
  if ("error" in check) return { error: check.error };
  const parsed = readItem(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.update(quoteItems).set(parsed.data).where(eq(quoteItems.id, id));
  refresh(item.quoteId);
  return { ok: "Servicio actualizado" };
}

export async function deleteQuoteItem(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const item = await db.query.quoteItems.findFirst({ where: eq(quoteItems.id, id) });
  if (!item) return;
  const check = await editableQuote(item.quoteId);
  if ("error" in check) return;
  await db.delete(quoteItems).where(eq(quoteItems.id, id));
  refresh(item.quoteId);
}

export async function moveQuoteItem(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const dir = fd.get("dir") === "up" ? -1 : 1;
  const item = await db.query.quoteItems.findFirst({ where: eq(quoteItems.id, id) });
  if (!item) return;
  const items = await db.query.quoteItems.findMany({ where: eq(quoteItems.quoteId, item.quoteId), orderBy: [asc(quoteItems.position), asc(quoteItems.id)] });
  const from = items.findIndex((i) => i.id === id);
  const to = from + dir;
  if (to < 0 || to >= items.length) return;
  [items[from], items[to]] = [items[to], items[from]];
  await db.transaction(async (tx) => {
    for (const [position, i] of items.entries()) await tx.update(quoteItems).set({ position }).where(eq(quoteItems.id, i.id));
  });
  refresh(item.quoteId);
}

export async function setQuoteStatus(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const status = z.enum(QUOTE_STATUSES).exclude(["convertida"]).safeParse(fd.get("status"));
  if (!status.success) return;
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id), columns: { status: true, sentAt: true } });
  if (!quote || quote.status === "convertida") return;
  await db
    .update(quotes)
    .set({
      status: status.data,
      sentAt: status.data === "enviada" ? (quote.sentAt ?? new Date()) : quote.sentAt,
      respondedAt: status.data === "aceptada" || status.data === "rechazada" ? new Date() : null,
    })
    .where(eq(quotes.id, id));
  refresh(id);
}

export async function emailQuote(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(fd.get("id"));
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id), columns: { status: true, sentAt: true, clientEmail: true } });
  if (!quote) return { error: "Cotización inexistente" };
  if (!quote.clientEmail) return { error: "Cargá el email del cliente" };
  const result = await sendQuoteEmail(id);
  if (result === "omitido") return { error: "No se envió: falta configurar RESEND_API_KEY (ver /admin/emails)" };
  if (result !== "enviado") return { error: "Resend no pudo mandar el email. El detalle está en /admin/emails" };
  if (quote.status === "borrador") await db.update(quotes).set({ status: "enviada", sentAt: quote.sentAt ?? new Date() }).where(eq(quotes.id, id));
  refresh(id);
  return { ok: `Enviada a ${quote.clientEmail}` };
}

/** Extiende la validez y la reabre como enviada (para cotizaciones vencidas o rechazadas). */
export async function extendQuote(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const days = Math.min(90, Math.max(1, Number(fd.get("days")) || 7));
  await db.update(quotes).set({ validUntil: addDaysISO(todayISO(), days) }).where(eq(quotes.id, id));
  refresh(id);
}

export async function duplicateQuote(fd: FormData) {
  const session = await requireSession();
  const id = Number(fd.get("id"));
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id), with: { items: true } });
  if (!quote) return;
  const [row] = await db
    .insert(quotes)
    .values({
      title: `${quote.title} (copia)`,
      clientName: quote.clientName,
      clientEmail: quote.clientEmail,
      clientPhone: quote.clientPhone,
      leadId: quote.leadId,
      packageId: quote.packageId,
      departureId: quote.departureId,
      passengers: quote.passengers,
      travelDate: quote.travelDate,
      currency: quote.currency,
      notes: quote.notes,
      internalNotes: quote.internalNotes,
      locale: quote.locale,
      code: await generateQuoteCode(),
      accessToken: generateAccessToken(),
      validUntil: addDaysISO(todayISO(), 7),
      createdBy: session.name,
    })
    .returning({ id: quotes.id });
  if (quote.items.length) {
    await db.insert(quoteItems).values(quote.items.map(({ id: _id, quoteId: _q, ...item }) => ({ ...item, quoteId: row.id })));
  }
  refresh();
  redirect(`/admin/cotizaciones/${row.id}`);
}

export async function deleteQuote(fd: FormData) {
  await requireSession("admin");
  const id = Number(fd.get("id"));
  await db.delete(quotes).where(eq(quotes.id, id));
  refresh();
  redirect("/admin/cotizaciones");
}

const convertSchema = z.object({
  contactDocument: z.string().max(20),
  passengerList: z.array(z.object({ fullName: z.string().min(3), document: z.string() })),
});

/** Crea una reserva con el total de la cotización. Necesita una salida del catálogo para ocupar el cupo. */
export async function convertQuoteToBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  const id = Number(fd.get("id"));
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id), with: { items: true } });
  if (!quote) return { error: "Cotización inexistente" };
  if (quote.status === "convertida") return { error: "Ya se convirtió en reserva" };
  if (!quote.departureId) return { error: "Asociá una salida del catálogo a la cotización para poder reservar" };
  if (!quote.clientEmail && !quote.clientPhone) return { error: "Cargá email o teléfono del cliente" };

  const departure = await db.query.departures.findFirst({
    where: and(eq(schema.departures.id, quote.departureId), eq(schema.departures.cancelled, false), gte(schema.departures.date, todayISO())),
    with: { package: { with: { policy: true } } },
  });
  if (!departure) return { error: "La salida asociada ya no está disponible" };
  const pkg = departure.package;
  if (pkg.currency !== quote.currency) return { error: `La cotización está en ${quote.currency} y la salida en ${pkg.currency}` };

  const { total } = quoteTotals(quote.items);
  if (total <= 0) return { error: "La cotización no tiene servicios con precio" };

  const parsed = convertSchema.safeParse({
    contactDocument: str(fd, "contactDocument"),
    passengerList: str(fd, "passengerList")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [fullName, document = ""] = l.split("|").map((s) => s.trim());
        return { fullName, document };
      }),
  });
  if (!parsed.success) return { error: "Revisá la lista de pasajeros (Nombre | DNI, uno por línea)" };

  const depositPercent = pkg.policy?.depositPercent ?? DEFAULT_DEPOSIT_PERCENT;
  let code = generateBookingCode();
  while (await db.query.bookings.findFirst({ where: eq(schema.bookings.code, code), columns: { id: true } })) code = generateBookingCode();
  const fxRate = (await getRates())[quote.currency];

  const booking = await db.transaction(async (tx) => {
    if (!(await reserveSeats(tx, departure.id, quote.passengers))) return null;
    const [row] = await tx
      .insert(schema.bookings)
      .values({
        code,
        accessToken: generateAccessToken(),
        packageId: pkg.id,
        departureId: departure.id,
        passengers: quote.passengers,
        contactName: quote.clientName,
        contactEmail: quote.clientEmail,
        contactPhone: quote.clientPhone,
        contactDocument: parsed.data.contactDocument,
        unitPrice: Math.round(total / quote.passengers),
        total,
        depositAmount: Math.round((total * depositPercent) / 100),
        currency: quote.currency,
        fxRate,
        paymentMethod: "transferencia",
        expiresAt: new Date(Date.now() + (pkg.policy?.depositHours ?? DEFAULT_DEPOSIT_HOURS) * 3600_000),
        balanceDueDate: balanceDueDate(departure.date, pkg.policy?.finalPaymentDays ?? 10),
        source: "cotizacion",
        locale: quote.locale,
        internalNotes: `Desde la cotización ${quote.code}`,
      })
      .returning({ id: schema.bookings.id, code: schema.bookings.code });
    const pax = parsed.data.passengerList.length ? parsed.data.passengerList : [{ fullName: quote.clientName, document: parsed.data.contactDocument }];
    await tx.insert(schema.bookingPassengers).values(pax.map((p) => ({ ...p, bookingId: row.id })));
    await logBookingEvent(
      tx,
      row.id,
      `Reserva creada desde la cotización ${quote.code} (${formatPrice(total, quote.currency)}, salida ${formatShortDate(departure.date)}).`,
      { author: session.name },
    );
    await createSupplierCosts(tx, quote, row.id, session.name);
    await tx.update(quotes).set({ status: "convertida", bookingId: row.id, respondedAt: quote.respondedAt ?? new Date() }).where(eq(quotes.id, quote.id));
    if (quote.leadId) await tx.update(schema.leads).set({ status: "reservado" }).where(eq(schema.leads.id, quote.leadId));
    return row;
  });
  if (!booking) return { error: "La salida no tiene lugares suficientes" };
  await notifyBookingCreated(booking.id);

  revalidatePath("/", "layout");
  redirect(`/admin/reservas/${booking.id}`);
}

const ITEM_SUPPLIER_KIND: Record<QuoteItemKind, SupplierKind> = {
  paquete: "operador",
  aereo: "aereo",
  hotel: "hotel",
  traslado: "transporte",
  excursion: "excursiones",
  seguro: "asistencia",
  otro: "otro",
};

/** Los servicios de terceros de la cotización pasan a ser deuda con cada proveedor (lo crea si no existe). */
async function createSupplierCosts(tx: Executor, quote: Quote & { items: QuoteItem[] }, bookingId: number, author: string) {
  const ids = new Map<string, number>();
  for (const item of quote.items) {
    const name = item.supplier.trim();
    const amount = item.unitCost * item.quantity;
    if (!name || amount <= 0) continue;
    const key = name.toLowerCase();
    let supplierId = ids.get(key);
    if (!supplierId) {
      const found = await tx.query.suppliers.findFirst({ where: sql`lower(${schema.suppliers.name}) = ${key}`, columns: { id: true } });
      supplierId =
        found?.id ??
        (await tx.insert(schema.suppliers).values({ name, kind: ITEM_SUPPLIER_KIND[item.kind] }).returning({ id: schema.suppliers.id }))[0].id;
      ids.set(key, supplierId);
    }
    await tx.insert(schema.supplierCosts).values({
      supplierId,
      bookingId,
      description: item.quantity > 1 ? `${item.description} (x${item.quantity})` : item.description,
      amount,
      currency: quote.currency,
      createdBy: author,
    });
  }
}
