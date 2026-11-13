"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { CASH_ACCOUNTS, CASH_CATEGORIES, CURRENCIES, SUPPLIER_KINDS } from "@/db/schema";
import { getSession, requireSession } from "@/lib/auth";
import { logBookingEvent } from "@/lib/bookings";
import { formatPrice, todayISO } from "@/lib/format";
import type { FormState } from "./actions";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function parseAmount(value: string) {
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

async function author() {
  return (await getSession())?.name ?? "admin";
}

function refresh(supplierId?: number, bookingId?: number | null) {
  revalidatePath("/admin/contabilidad");
  revalidatePath("/admin/proveedores");
  if (supplierId) revalidatePath(`/admin/proveedores/${supplierId}`);
  if (bookingId) revalidatePath(`/admin/reservas/${bookingId}`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- Proveedores ---------- */

const supplierSchema = z.object({
  name: z.string().min(2, "Ingresá el nombre del proveedor").max(120),
  kind: z.enum(SUPPLIER_KINDS),
  taxId: z.string().max(20),
  contactName: z.string().max(120),
  email: z.union([z.literal(""), z.email("Email inválido")]),
  phone: z.string().max(40),
  bankInfo: z.string().max(500),
  notes: z.string().max(2000),
});

export async function saveSupplier(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(fd.get("id")) || null;
  const parsed = supplierSchema.safeParse({
    name: str(fd, "name"),
    kind: fd.get("kind") || "otro",
    taxId: str(fd, "taxId"),
    contactName: str(fd, "contactName"),
    email: str(fd, "email").toLowerCase(),
    phone: str(fd, "phone"),
    bankInfo: str(fd, "bankInfo"),
    notes: str(fd, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const values = { ...parsed.data, active: id ? fd.get("active") === "on" : true };
  if (id) {
    await db.update(schema.suppliers).set(values).where(eq(schema.suppliers.id, id));
    refresh(id);
    return { ok: "Proveedor guardado" };
  }
  const [row] = await db.insert(schema.suppliers).values(values).returning({ id: schema.suppliers.id });
  refresh();
  redirect(`/admin/proveedores/${row.id}`);
}

export async function deleteSupplier(fd: FormData) {
  await requireSession("admin");
  const id = Number(fd.get("id"));
  const [{ n }] = await db.select({ n: count() }).from(schema.supplierCosts).where(eq(schema.supplierCosts.supplierId, id));
  const [{ m }] = await db.select({ m: count() }).from(schema.supplierPayments).where(eq(schema.supplierPayments.supplierId, id));
  if (n + m > 0) {
    await db.update(schema.suppliers).set({ active: false }).where(eq(schema.suppliers.id, id));
  } else {
    await db.delete(schema.suppliers).where(eq(schema.suppliers.id, id));
  }
  refresh();
  redirect("/admin/proveedores");
}

/* ---------- Costos (cuentas a pagar) ---------- */

const costSchema = z.object({
  supplierId: z.coerce.number().int().positive("Elegí el proveedor"),
  description: z.string().min(2, "Describí el servicio").max(200),
  amount: z.number().int().positive("Ingresá un monto válido"),
  currency: z.enum(CURRENCIES),
  dueDate: z.string().regex(ISO_DATE).nullable(),
});

export async function addSupplierCost(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const parsed = costSchema.safeParse({
    supplierId: fd.get("supplierId"),
    description: str(fd, "description"),
    amount: parseAmount(str(fd, "amount")),
    currency: fd.get("currency") || "ARS",
    dueDate: str(fd, "dueDate") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let bookingId = Number(fd.get("bookingId")) || null;
  const bookingCode = str(fd, "bookingCode").toUpperCase();
  if (!bookingId && bookingCode) {
    const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.code, bookingCode), columns: { id: true } });
    if (!b) return { error: `No existe la reserva ${bookingCode}` };
    bookingId = b.id;
  }

  const who = await author();
  await db.insert(schema.supplierCosts).values({ ...parsed.data, bookingId, createdBy: who });
  if (bookingId) {
    const supplier = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, parsed.data.supplierId), columns: { name: true } });
    await logBookingEvent(db, bookingId, `Costo de proveedor: ${supplier?.name} · ${parsed.data.description} · ${formatPrice(parsed.data.amount, parsed.data.currency)}.`, { author: who });
  }
  refresh(parsed.data.supplierId, bookingId);
  return { ok: "Costo registrado" };
}

/** Anula o reactiva un costo (no se borra para conservar el historial). */
export async function toggleVoidCost(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const cost = await db.query.supplierCosts.findFirst({ where: eq(schema.supplierCosts.id, id) });
  if (!cost) return;
  await db.update(schema.supplierCosts).set({ voided: !cost.voided }).where(eq(schema.supplierCosts.id, id));
  refresh(cost.supplierId, cost.bookingId);
}

export async function deleteSupplierCost(fd: FormData) {
  await requireSession("admin");
  const id = Number(fd.get("id"));
  const [{ m }] = await db.select({ m: count() }).from(schema.supplierPayments).where(eq(schema.supplierPayments.costId, id));
  if (m > 0) return;
  const [row] = await db.delete(schema.supplierCosts).where(eq(schema.supplierCosts.id, id)).returning();
  if (row) refresh(row.supplierId, row.bookingId);
}

/* ---------- Pagos a proveedores ---------- */

const supplierPaymentSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  costId: z.coerce.number().int().positive().nullable(),
  amount: z.number().int().positive("Ingresá un monto válido"),
  currency: z.enum(CURRENCIES),
  account: z.enum(CASH_ACCOUNTS),
  date: z.string().regex(ISO_DATE, "Fecha inválida"),
  reference: z.string().max(200),
});

export async function addSupplierPayment(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const parsed = supplierPaymentSchema.safeParse({
    supplierId: fd.get("supplierId"),
    costId: Number(fd.get("costId")) || null,
    amount: parseAmount(str(fd, "amount")),
    currency: fd.get("currency") || "ARS",
    account: fd.get("account") || "banco",
    date: str(fd, "date") || todayISO(),
    reference: str(fd, "reference"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  let bookingId: number | null = null;
  if (data.costId) {
    const cost = await db.query.supplierCosts.findFirst({ where: and(eq(schema.supplierCosts.id, data.costId), eq(schema.supplierCosts.supplierId, data.supplierId)) });
    if (!cost) return { error: "El costo no corresponde a este proveedor" };
    if (cost.currency !== data.currency) return { error: `El costo está en ${cost.currency}: registrá el pago en la misma moneda` };
    bookingId = cost.bookingId;
  }
  const who = await author();
  await db.insert(schema.supplierPayments).values({ ...data, createdBy: who });
  if (bookingId) {
    const supplier = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, data.supplierId), columns: { name: true } });
    await logBookingEvent(db, bookingId, `Pago a ${supplier?.name} por ${formatPrice(data.amount, data.currency)}.`, { author: who });
  }
  refresh(data.supplierId, bookingId);
  return { ok: "Pago registrado" };
}

export async function deleteSupplierPayment(fd: FormData) {
  await requireSession("admin");
  const [row] = await db.delete(schema.supplierPayments).where(eq(schema.supplierPayments.id, Number(fd.get("id")))).returning();
  if (row) refresh(row.supplierId);
}

/* ---------- Movimientos de caja manuales ---------- */

const movementSchema = z.object({
  date: z.string().regex(ISO_DATE, "Fecha inválida"),
  direction: z.enum(["ingreso", "egreso"]),
  category: z.enum(CASH_CATEGORIES),
  account: z.enum(CASH_ACCOUNTS),
  amount: z.number().int().positive("Ingresá un monto válido"),
  currency: z.enum(CURRENCIES),
  description: z.string().min(2, "Agregá una descripción").max(200),
});

export async function addCashMovement(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const parsed = movementSchema.safeParse({
    date: str(fd, "date") || todayISO(),
    direction: fd.get("direction"),
    category: fd.get("category") || "otro",
    account: fd.get("account") || "caja",
    amount: parseAmount(str(fd, "amount")),
    currency: fd.get("currency") || "ARS",
    description: str(fd, "description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.insert(schema.cashMovements).values({ ...parsed.data, createdBy: await author() });
  refresh();
  return { ok: "Movimiento registrado" };
}

export async function deleteCashMovement(fd: FormData) {
  await requireSession("admin");
  await db.delete(schema.cashMovements).where(eq(schema.cashMovements.id, Number(fd.get("id"))));
  refresh();
}
