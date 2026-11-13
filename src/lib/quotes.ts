import { randomInt, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { todayISO } from "./format";
import { asLocale, localePath } from "./i18n/config";

const { quotes, quoteItems } = schema;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function generateQuoteCode() {
  for (;;) {
    let code = "CT-";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    const clash = await db.query.quotes.findFirst({ where: eq(quotes.code, code), columns: { id: true } });
    if (!clash) return code;
  }
}

export function quoteUrl(quote: { code: string; accessToken: string; locale?: string }) {
  return localePath(asLocale(quote.locale), `/cotizacion/${quote.code}?t=${quote.accessToken}`);
}

export function quotePdfUrl(quote: { code: string; accessToken: string }) {
  return `/api/cotizaciones/${quote.code}/pdf?t=${quote.accessToken}`;
}

const withItems = { items: { orderBy: [asc(quoteItems.position), asc(quoteItems.id)] } } satisfies { items: { orderBy: unknown[] } };

export async function getQuoteWithItems(id: number) {
  return db.query.quotes.findFirst({ where: eq(quotes.id, id), with: withItems });
}

/** Cotización para el cliente: exige el token y lo compara en tiempo constante. */
export async function getQuoteForCustomer(code: string, token: string | undefined | null) {
  if (!token) return null;
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.code, code.toUpperCase()), with: withItems });
  if (!quote) return null;
  const a = Buffer.from(quote.accessToken);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b) ? quote : null;
}

export type QuoteWithItems = NonNullable<Awaited<ReturnType<typeof getQuoteWithItems>>>;

/** Salidas futuras para elegir en los formularios del admin. */
export async function getDepartureOptions() {
  const { departures, packages } = schema;
  return db
    .select({
      id: departures.id,
      date: departures.date,
      title: packages.title,
      days: packages.days,
      currency: packages.currency,
      left: sql<number>`${departures.seatsTotal} - ${departures.seatsTaken}`,
    })
    .from(departures)
    .innerJoin(packages, eq(departures.packageId, packages.id))
    .where(and(gte(departures.date, todayISO()), eq(departures.cancelled, false), eq(packages.kind, "paquete")))
    .orderBy(asc(departures.date), asc(packages.title));
}

/** Totales de venta y costo por cotización, para listados. */
export async function getQuoteTotalsMap(ids: number[]) {
  if (!ids.length) return new Map<number, { total: number; cost: number }>();
  const rows = await db
    .select({
      quoteId: quoteItems.quoteId,
      total: sql<number>`sum(${quoteItems.unitPrice} * ${quoteItems.quantity})`.mapWith(Number),
      cost: sql<number>`sum(${quoteItems.unitCost} * ${quoteItems.quantity})`.mapWith(Number),
    })
    .from(quoteItems)
    .where(inArray(quoteItems.quoteId, ids))
    .groupBy(quoteItems.quoteId);
  return new Map(rows.map((r) => [r.quoteId, { total: Number(r.total), cost: Number(r.cost) }]));
}
