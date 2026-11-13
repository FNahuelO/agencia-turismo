import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Booking, BookingPassenger, Departure, Destination, Package, Policy, ProductKind } from "@/db/schema";
import { absoluteUrl } from "./api";
import { amountDue, bookingUrl } from "./bookings";
import { addDaysISO, seatsLeft } from "./format";
import { localePath, type Locale } from "./i18n/config";
import { localizeDestination, localizePackage } from "./i18n/content";

const PRICE_UNIT: Record<ProductKind, string> = { paquete: "person", actividad: "person", traslado: "vehicle", hotel: "room_night" };
const TYPE: Record<ProductKind, string> = { paquete: "package", actividad: "activity", traslado: "transfer", hotel: "hotel" };
export const TYPE_TO_KIND: Record<string, ProductKind> = { package: "paquete", activity: "actividad", transfer: "traslado", hotel: "hotel" };

export function productPath(pkg: { kind: ProductKind; slug: string }) {
  return pkg.kind === "paquete" ? `/paquetes/${pkg.slug}` : `/productos/${pkg.slug}`;
}

export function serializeDestination(req: Request, d: Destination, locale: Locale) {
  const l = localizeDestination(d, locale);
  return { slug: l.slug, name: l.name, region: l.region, province: l.province, summary: l.summary, image: absoluteUrl(req, l.image) };
}

export function serializeProduct(req: Request, pkg: Package & { destination: Destination; policy?: Policy | null }, locale: Locale, full = false) {
  const l = localizePackage(pkg, locale);
  const base = {
    id: l.id,
    slug: l.slug,
    type: TYPE[l.kind],
    title: l.title,
    summary: l.summary,
    destination: { slug: l.destination.slug, name: localizeDestination(l.destination, locale).name, region: l.destination.region },
    price: l.price,
    currency: l.currency,
    priceUnit: PRICE_UNIT[l.kind],
    image: absoluteUrl(req, l.image),
    url: absoluteUrl(req, localePath(locale, productPath(l))),
    tags: l.tags,
    ...(l.kind === "paquete"
      ? { days: l.days, nights: l.nights, transport: l.transport, hotel: l.hotel || null, board: l.board || null }
      : {
          schedule: l.schedule || null,
          board: l.board || null,
          weekdays: l.weekdays,
          dailyCapacity: l.dailyCapacity,
          ...(l.kind !== "actividad" && { capacityPerUnit: l.capacityPerUnit }),
          ...(l.kind === "hotel" && { minNights: l.minNights }),
        }),
  };
  if (!full) return base;
  return {
    ...base,
    includes: l.includes,
    excludes: l.excludes,
    itinerary: l.itinerary,
    policy: pkg.policy
      ? {
          depositPercent: pkg.policy.depositPercent,
          depositHours: pkg.policy.depositHours,
          finalPaymentDays: pkg.policy.finalPaymentDays,
          singleSurchargePercent: pkg.policy.singleSurcharge,
          infantsMonths: pkg.policy.infantsMonths,
        }
      : null,
  };
}

export function serializeDeparture(d: Departure, pkg: { price: number }) {
  return { id: d.id, date: d.date, price: d.priceOverride ?? pkg.price, seatsLeft: seatsLeft(d), available: !d.cancelled && seatsLeft(d) > 0 };
}

export async function getProductForApi(idOrSlug: string | number) {
  const where = typeof idOrSlug === "number" || /^\d+$/.test(String(idOrSlug)) ? eq(schema.packages.id, Number(idOrSlug)) : eq(schema.packages.slug, String(idOrSlug));
  return db.query.packages.findFirst({
    where: and(where, eq(schema.packages.published, true)),
    with: { destination: true, policy: true },
  });
}

export async function getUpcomingDeparturesFor(packageId: number, from: string, to?: string) {
  const rows = await db.query.departures.findMany({
    where: (d, { and, eq, gte, lte }) => and(eq(d.packageId, packageId), gte(d.date, from), to ? lte(d.date, to) : undefined, eq(d.cancelled, false)),
    orderBy: asc(schema.departures.date),
  });
  return rows;
}

type BookingWithRelations = Booking & {
  package: Pick<Package, "slug" | "title" | "kind">;
  departure: Pick<Departure, "date">;
  passengerList: BookingPassenger[];
};

export function serializeBooking(req: Request, b: BookingWithRelations) {
  const due = amountDue(b);
  return {
    code: b.code,
    status: b.status,
    product: { slug: b.package.slug, title: b.package.title, type: TYPE[b.package.kind] },
    date: b.departure.date,
    ...(b.nights > 0 && { checkOut: addDaysISO(b.departure.date, b.nights), nights: b.nights }),
    ...(b.units !== null && { [b.package.kind === "hotel" ? "rooms" : "vehicles"]: b.units }),
    passengers: b.passengers,
    infants: b.infants,
    currency: b.currency,
    total: b.total,
    deposit: b.depositAmount,
    paid: b.paidAmount,
    depositDue: due.deposit,
    balanceDue: due.balance,
    expiresAt: b.expiresAt?.toISOString() ?? null,
    balanceDueDate: b.balanceDueDate,
    paymentMethod: b.paymentMethod,
    customerUrl: absoluteUrl(req, bookingUrl(b)),
    contact: { name: b.contactName, email: b.contactEmail, phone: b.contactPhone, document: b.contactDocument },
    travelers: b.passengerList.map((p) => ({ fullName: p.fullName, document: p.document, birthDate: p.birthDate, infant: p.infant })),
    locale: b.locale,
    createdAt: b.createdAt.toISOString(),
  };
}

export const bookingWith = {
  package: { columns: { slug: true, title: true, kind: true } },
  departure: { columns: { date: true } },
  passengerList: true,
} as const;
