import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CashAccount, Currency, PaymentMethod } from "@/db/schema";
import { ACTIVE_STATUSES } from "./bookings";
import { getRates } from "./exchange-rates";
import { addDaysISO, todayISO } from "./format";
import { convert } from "./fx";

const { payments, bookings, packages, departures, supplierCosts, supplierPayments, suppliers, cashMovements } = schema;

export const ACCOUNT_LABELS: Record<CashAccount, string> = { caja: "Caja (efectivo)", banco: "Banco", mercadopago: "Mercado Pago" };

/** A qué cuenta entra cada cobro según el medio de pago. */
export const METHOD_ACCOUNT: Record<PaymentMethod, CashAccount> = { efectivo: "caja", transferencia: "banco", mercadopago: "mercadopago" };

export type LedgerEntry = {
  key: string;
  date: string;
  source: "cobro" | "reintegro" | "proveedor" | "manual";
  direction: "ingreso" | "egreso";
  account: CashAccount;
  amount: number;
  currency: Currency;
  description: string;
  href?: string;
  /** Movimiento manual: se puede borrar. */
  manualId?: number;
};

/** Fecha local (Argentina) de un timestamp, como YYYY-MM-DD. */
function localDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
}

function dayStart(iso: string) {
  return new Date(`${iso}T00:00:00-03:00`);
}

/**
 * Libro de caja del período: cobros acreditados, reintegros, pagos a proveedores y movimientos manuales.
 * Sin rango devuelve todo (para los saldos por cuenta).
 */
export async function getLedger(from?: string, to?: string): Promise<LedgerEntry[]> {
  const start = from ? dayStart(from) : undefined;
  const end = to ? dayStart(addDaysISO(to, 1)) : undefined;
  const inRange = (col: typeof payments.paidAt | typeof payments.refundedAt) => and(start ? gte(col, start) : undefined, end ? lt(col, end) : undefined);

  const [paid, refunded, supplierRows, manual] = await Promise.all([
    db
      .select({ p: payments, code: bookings.code, bookingId: bookings.id, contact: bookings.contactName })
      .from(payments)
      .innerJoin(bookings, eq(payments.bookingId, bookings.id))
      .where(and(inArray(payments.status, ["aprobado", "reintegrado"]), sql`${payments.paidAt} is not null`, inRange(payments.paidAt))),
    db
      .select({ p: payments, code: bookings.code, bookingId: bookings.id, contact: bookings.contactName })
      .from(payments)
      .innerJoin(bookings, eq(payments.bookingId, bookings.id))
      .where(and(eq(payments.status, "reintegrado"), sql`${payments.refundedAt} is not null`, inRange(payments.refundedAt))),
    db
      .select({ sp: supplierPayments, supplier: suppliers.name })
      .from(supplierPayments)
      .innerJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
      .where(and(from ? gte(supplierPayments.date, from) : undefined, to ? lte(supplierPayments.date, to) : undefined)),
    db
      .select()
      .from(cashMovements)
      .where(and(from ? gte(cashMovements.date, from) : undefined, to ? lte(cashMovements.date, to) : undefined)),
  ]);

  const charged = (p: typeof payments.$inferSelect) => ({ amount: p.chargedAmount ?? p.amount, currency: p.chargedCurrency ?? p.currency });
  const entries: LedgerEntry[] = [
    ...paid.map(({ p, code, bookingId, contact }) => ({
      key: `p${p.id}`,
      date: localDate(p.paidAt!),
      source: "cobro" as const,
      direction: "ingreso" as const,
      account: METHOD_ACCOUNT[p.method],
      ...charged(p),
      description: `Cobro reserva ${code} · ${contact}`,
      href: `/admin/reservas/${bookingId}`,
    })),
    ...refunded.map(({ p, code, bookingId, contact }) => ({
      key: `r${p.id}`,
      date: localDate(p.refundedAt!),
      source: "reintegro" as const,
      direction: "egreso" as const,
      account: METHOD_ACCOUNT[p.method],
      ...charged(p),
      description: `Reintegro reserva ${code} · ${contact}`,
      href: `/admin/reservas/${bookingId}`,
    })),
    ...supplierRows.map(({ sp, supplier }) => ({
      key: `s${sp.id}`,
      date: sp.date,
      source: "proveedor" as const,
      direction: "egreso" as const,
      account: sp.account,
      amount: sp.amount,
      currency: sp.currency,
      description: `Pago a ${supplier}${sp.reference ? ` · ${sp.reference}` : ""}`,
      href: `/admin/proveedores/${sp.supplierId}`,
    })),
    ...manual.map((m) => ({
      key: `m${m.id}`,
      date: m.date,
      source: "manual" as const,
      direction: m.direction,
      account: m.account,
      amount: m.amount,
      currency: m.currency,
      description: m.description || m.category,
      manualId: m.id,
    })),
  ];
  return entries.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

type Totals = Partial<Record<Currency, { ingresos: number; egresos: number }>>;

export function ledgerTotals(entries: LedgerEntry[]): Totals {
  const out: Totals = {};
  for (const e of entries) {
    const t = (out[e.currency] ??= { ingresos: 0, egresos: 0 });
    if (e.direction === "ingreso") t.ingresos += e.amount;
    else t.egresos += e.amount;
  }
  return out;
}

/** Saldo histórico de cada cuenta, por moneda. */
export async function getAccountBalances() {
  const out: Partial<Record<CashAccount, Partial<Record<Currency, number>>>> = {};
  for (const e of await getLedger()) {
    const acc = (out[e.account] ??= {});
    acc[e.currency] = (acc[e.currency] ?? 0) + (e.direction === "ingreso" ? e.amount : -e.amount);
  }
  return out;
}

/** Reservas activas con saldo pendiente, ordenadas por vencimiento del saldo. */
export async function getReceivables() {
  const rows = await db
    .select({
      id: bookings.id,
      code: bookings.code,
      contactName: bookings.contactName,
      status: bookings.status,
      total: bookings.total,
      paid: bookings.paidAmount,
      currency: bookings.currency,
      balanceDueDate: bookings.balanceDueDate,
      date: departures.date,
      title: packages.title,
    })
    .from(bookings)
    .innerJoin(departures, eq(bookings.departureId, departures.id))
    .innerJoin(packages, eq(bookings.packageId, packages.id))
    .where(and(inArray(bookings.status, ACTIVE_STATUSES), sql`${bookings.total} > ${bookings.paidAmount}`))
    .orderBy(asc(sql`coalesce(${bookings.balanceDueDate}, ${departures.date})`));
  const today = todayISO();
  return rows.map((r) => ({ ...r, balance: r.total - r.paid, overdue: Boolean(r.balanceDueDate && r.balanceDueDate < today) }));
}

/** Lo pagado de cada costo. */
async function paidByCost(costIds: number[]) {
  if (!costIds.length) return new Map<number, number>();
  const rows = await db
    .select({ costId: supplierPayments.costId, paid: sql<number>`sum(${supplierPayments.amount})`.mapWith(Number) })
    .from(supplierPayments)
    .where(inArray(supplierPayments.costId, costIds))
    .groupBy(supplierPayments.costId);
  return new Map(rows.map((r) => [r.costId!, r.paid]));
}

export type CostWithBalance = typeof supplierCosts.$inferSelect & { paid: number; pending: number; supplierName: string; bookingCode: string | null };

/** Costos con lo pagado y lo pendiente. Filtra por proveedor, reserva o solo los impagos. */
export async function getCosts(opts: { supplierId?: number; bookingId?: number; unpaidOnly?: boolean } = {}): Promise<CostWithBalance[]> {
  const rows = await db
    .select({ c: supplierCosts, supplierName: suppliers.name, bookingCode: bookings.code })
    .from(supplierCosts)
    .innerJoin(suppliers, eq(supplierCosts.supplierId, suppliers.id))
    .leftJoin(bookings, eq(supplierCosts.bookingId, bookings.id))
    .where(
      and(
        opts.supplierId ? eq(supplierCosts.supplierId, opts.supplierId) : undefined,
        opts.bookingId ? eq(supplierCosts.bookingId, opts.bookingId) : undefined,
        opts.unpaidOnly ? eq(supplierCosts.voided, false) : undefined,
      ),
    )
    .orderBy(asc(sql`coalesce(${supplierCosts.dueDate}, '9999')`), asc(supplierCosts.id));
  const paid = await paidByCost(rows.map((r) => r.c.id));
  const list = rows.map(({ c, supplierName, bookingCode }) => {
    const p = paid.get(c.id) ?? 0;
    return { ...c, supplierName, bookingCode, paid: p, pending: c.voided ? 0 : Math.max(0, c.amount - p) };
  });
  return opts.unpaidOnly ? list.filter((c) => c.pending > 0) : list;
}

/** Deuda con cada proveedor por moneda: costos vigentes menos pagos (imputados o a cuenta). */
export async function getSupplierBalances(supplierId?: number) {
  const [costs, paid] = await Promise.all([
    db
      .select({ supplierId: supplierCosts.supplierId, currency: supplierCosts.currency, total: sql<number>`sum(${supplierCosts.amount})`.mapWith(Number) })
      .from(supplierCosts)
      .where(and(eq(supplierCosts.voided, false), supplierId ? eq(supplierCosts.supplierId, supplierId) : undefined))
      .groupBy(supplierCosts.supplierId, supplierCosts.currency),
    db
      .select({ supplierId: supplierPayments.supplierId, currency: supplierPayments.currency, total: sql<number>`sum(${supplierPayments.amount})`.mapWith(Number) })
      .from(supplierPayments)
      .where(supplierId ? eq(supplierPayments.supplierId, supplierId) : undefined)
      .groupBy(supplierPayments.supplierId, supplierPayments.currency),
  ]);
  const out = new Map<number, Partial<Record<Currency, number>>>();
  for (const r of costs) {
    const m = out.get(r.supplierId) ?? {};
    m[r.currency] = (m[r.currency] ?? 0) + r.total;
    out.set(r.supplierId, m);
  }
  for (const r of paid) {
    const m = out.get(r.supplierId) ?? {};
    m[r.currency] = (m[r.currency] ?? 0) - r.total;
    out.set(r.supplierId, m);
  }
  return out;
}

/**
 * Rentabilidad de las reservas que viajan en el período: venta, costos de proveedores
 * (convertidos a la moneda de la reserva con la cotización actual) y margen.
 */
export async function getProfitability(from: string, to: string) {
  const rows = await db
    .select({
      id: bookings.id,
      code: bookings.code,
      contactName: bookings.contactName,
      status: bookings.status,
      total: bookings.total,
      paid: bookings.paidAmount,
      currency: bookings.currency,
      date: departures.date,
      title: packages.title,
    })
    .from(bookings)
    .innerJoin(departures, eq(bookings.departureId, departures.id))
    .innerJoin(packages, eq(bookings.packageId, packages.id))
    .where(and(inArray(bookings.status, ACTIVE_STATUSES), gte(departures.date, from), lte(departures.date, to)))
    .orderBy(asc(departures.date));
  if (!rows.length) return [];

  const [costRows, rates] = await Promise.all([
    db
      .select({ bookingId: supplierCosts.bookingId, amount: supplierCosts.amount, currency: supplierCosts.currency })
      .from(supplierCosts)
      .where(and(eq(supplierCosts.voided, false), inArray(supplierCosts.bookingId, rows.map((r) => r.id)))),
    getRates(),
  ]);
  return rows.map((r) => {
    const cost = Math.round(
      costRows.filter((c) => c.bookingId === r.id).reduce((sum, c) => sum + convert(c.amount, c.currency, r.currency, rates), 0),
    );
    return { ...r, cost, margin: r.total - cost, marginPercent: r.total ? Math.round(((r.total - cost) / r.total) * 100) : 0 };
  });
}

/** Costos de proveedores imputados a una reserva, para el detalle. */
export async function getBookingCostSummary(bookingId: number, currency: Currency) {
  const [costs, rates] = await Promise.all([getCosts({ bookingId }), getRates()]);
  const total = Math.round(costs.filter((c) => !c.voided).reduce((s, c) => s + convert(c.amount, c.currency, currency, rates), 0));
  return { costs, total };
}

export function monthRange(month?: string) {
  const today = todayISO();
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const [y, mm] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return { month: m, from: `${m}-01`, to: `${m}-${String(last).padStart(2, "0")}` };
}

