import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import type { ProductKind } from "@/db/schema";
import type { Executor } from "./bookings";
import { addDaysISO, parseISODate, todayISO } from "./format";
import type { Locale } from "./i18n/config";
import { localizeDestination, localizePackage } from "./i18n/content";

const { packages, departures, destinations } = schema;

export const DAILY_KINDS = ["actividad", "traslado", "hotel"] as const satisfies ProductKind[];
export type DailyKind = (typeof DAILY_KINDS)[number];

/** Días hacia adelante que se pueden reservar los productos diarios. */
export const BOOKING_WINDOW_DAYS = 180;
/** Estadía máxima de una reserva de hotel. */
export const MAX_NIGHTS = 30;

/** Ruta del listado público de cada tipo de producto. */
export const KIND_PATH: Record<DailyKind, string> = { actividad: "/excursiones", traslado: "/traslados", hotel: "/hoteles" };

export function isDailyKind(kind: ProductKind): kind is DailyKind {
  return kind !== "paquete";
}

/** Primera fecha reservable online (desde mañana, para dar tiempo a confirmar). */
export function firstBookableDate() {
  return addDaysISO(todayISO(), 1);
}

export function lastBookableDate() {
  return addDaysISO(todayISO(), BOOKING_WINDOW_DAYS);
}

type DailyProduct = { id: number; price: number; dailyCapacity: number; weekdays: number[] };

export function isWeekdayOpen(pkg: { weekdays: number[] }, date: string) {
  return pkg.weekdays.includes(parseISODate(date).getDay());
}

/**
 * Disponibilidad de un producto diario: `{ fecha: [precio, lugares libres] }`.
 * Los días cerrados (por día de la semana o cerrados a mano) no aparecen.
 */
export async function getDailyAvailability(pkg: DailyProduct, from = firstBookableDate(), to = lastBookableDate()) {
  const rows = await db
    .select({ date: departures.date, priceOverride: departures.priceOverride, seatsTotal: departures.seatsTotal, seatsTaken: departures.seatsTaken, cancelled: departures.cancelled })
    .from(departures)
    .where(and(eq(departures.packageId, pkg.id), gte(departures.date, from), lte(departures.date, to)));
  const byDate = new Map(rows.map((r) => [r.date, r]));

  const out: Record<string, [number, number]> = {};
  for (let date = from; date <= to; date = addDaysISO(date, 1)) {
    if (!isWeekdayOpen(pkg, date)) continue;
    const row = byDate.get(date);
    if (row?.cancelled) continue;
    out[date] = row ? [row.priceOverride ?? pkg.price, Math.max(0, row.seatsTotal - row.seatsTaken)] : [pkg.price, pkg.dailyCapacity];
  }
  return out;
}

/** Crea las filas de `departures` que falten para esas fechas y devuelve todas, ordenadas por fecha. */
export async function ensureDailyDepartures(exec: Executor, pkg: DailyProduct, dates: string[]) {
  await exec
    .insert(departures)
    .values(dates.map((date) => ({ packageId: pkg.id, date, seatsTotal: pkg.dailyCapacity, seatsTaken: 0 })))
    .onConflictDoNothing();
  return exec
    .select()
    .from(departures)
    .where(and(eq(departures.packageId, pkg.id), inArray(departures.date, dates)))
    .orderBy(asc(departures.date));
}

/** Tipos de producto con al menos uno publicado (para mostrar las secciones en el menú). */
export const getPublishedKinds = cache(async () => {
  const rows = await db.selectDistinct({ kind: packages.kind }).from(packages).where(eq(packages.published, true));
  return rows.map((r) => r.kind);
});

export type ProductCard = Awaited<ReturnType<typeof getProductCards>>[number];

export const getProductCards = cache(async (kind: DailyKind, locale: Locale = "es", destinationId?: number) => {
  const rows = await db
    .select({
      id: packages.id,
      slug: packages.slug,
      kind: packages.kind,
      title: packages.title,
      summary: packages.summary,
      schedule: packages.schedule,
      price: packages.price,
      currency: packages.currency,
      image: packages.image,
      capacityPerUnit: packages.capacityPerUnit,
      featured: packages.featured,
      destinationName: destinations.name,
      destinationSlug: destinations.slug,
      region: destinations.region,
      i18n: packages.i18n,
      destinationI18n: destinations.i18n,
    })
    .from(packages)
    .innerJoin(destinations, eq(packages.destinationId, destinations.id))
    .where(and(eq(packages.published, true), eq(packages.kind, kind), destinationId ? eq(packages.destinationId, destinationId) : undefined))
    .orderBy(sql`${packages.featured} desc`, asc(destinations.name), asc(packages.price));
  return rows.map(({ i18n, destinationI18n, ...r }) => {
    const { title, summary, schedule } = localizePackage({ title: r.title, summary: r.summary, schedule: r.schedule, i18n }, locale);
    return { ...r, title, summary, schedule, destinationName: localizeDestination({ name: r.destinationName, i18n: destinationI18n }, locale).name };
  });
});
