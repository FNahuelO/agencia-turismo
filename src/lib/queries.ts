import { and, asc, desc, eq, gte, ne, sql } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import { todayISO } from "./format";
import type { Locale } from "./i18n/config";
import { localizeDestination, localizePackage } from "./i18n/content";
import { getSettings } from "./settings";

const { packages, departures, destinations, reviews } = schema;

export type UpcomingDeparture = Awaited<ReturnType<typeof getUpcomingDepartures>>[number];

export const getUpcomingDepartures = cache(async (locale: Locale = "es", limit?: number) => {
  const query = db
    .select({
      id: departures.id,
      date: departures.date,
      seatsTotal: departures.seatsTotal,
      seatsTaken: departures.seatsTaken,
      price: sql<number>`coalesce(${departures.priceOverride}, ${packages.price})`,
      currency: packages.currency,
      packageSlug: packages.slug,
      packageTitle: packages.title,
      transport: packages.transport,
      days: packages.days,
      nights: packages.nights,
      board: packages.board,
      image: packages.image,
      destinationName: destinations.name,
      destinationSlug: destinations.slug,
      region: destinations.region,
      packageI18n: packages.i18n,
      destinationI18n: destinations.i18n,
    })
    .from(departures)
    .innerJoin(packages, eq(departures.packageId, packages.id))
    .innerJoin(destinations, eq(packages.destinationId, destinations.id))
    .where(and(gte(departures.date, todayISO()), eq(departures.cancelled, false), eq(packages.published, true), eq(packages.kind, "paquete")))
    .orderBy(asc(departures.date), asc(packages.title));
  const rows = await (limit ? query.limit(limit) : query);
  return rows.map(({ packageI18n, destinationI18n, ...r }) => {
    const pkg = localizePackage({ title: r.packageTitle, board: r.board, i18n: packageI18n }, locale);
    return {
      ...r,
      packageTitle: pkg.title,
      board: pkg.board,
      destinationName: localizeDestination({ name: r.destinationName, i18n: destinationI18n }, locale).name,
    };
  });
});

export const getPackageBySlug = cache(async (slug: string, locale: Locale = "es") => {
  const pkg = await db.query.packages.findFirst({
    where: and(eq(packages.slug, slug), eq(packages.published, true)),
    with: {
      destination: true,
      policy: true,
      departures: {
        where: and(gte(departures.date, todayISO()), eq(departures.cancelled, false)),
        orderBy: asc(departures.date),
      },
    },
  });
  if (!pkg) return null;
  return { ...localizePackage(pkg, locale), destination: localizeDestination(pkg.destination, locale) };
});

/** Slugs publicados: solo paquetes (`paquete`) o solo productos diarios (`productos`). */
export const getPublishedPackageSlugs = cache(async (group: "paquete" | "productos" = "paquete") => {
  return db
    .select({ slug: packages.slug })
    .from(packages)
    .where(and(eq(packages.published, true), group === "paquete" ? eq(packages.kind, "paquete") : ne(packages.kind, "paquete")));
});

export type PackageCard = Awaited<ReturnType<typeof getPackageCards>>[number];

export const getPackageCards = cache(async (opts: { featured?: boolean; destinationId?: number; locale?: Locale } = {}) => {
  const nextDeparture = sql<string | null>`(
    select min(d.date) from ${departures} d
    where d.package_id = ${packages.id} and d.date >= ${todayISO()} and d.cancelled = false
  )`;
  const conditions = [eq(packages.published, true), eq(packages.kind, "paquete")];
  if (opts.featured) conditions.push(eq(packages.featured, true));
  if (opts.destinationId) conditions.push(eq(packages.destinationId, opts.destinationId));

  const locale = opts.locale ?? "es";
  const rows = await db
    .select({
      id: packages.id,
      slug: packages.slug,
      title: packages.title,
      transport: packages.transport,
      days: packages.days,
      nights: packages.nights,
      board: packages.board,
      hotel: packages.hotel,
      price: packages.price,
      currency: packages.currency,
      image: packages.image,
      destinationName: destinations.name,
      region: destinations.region,
      nextDeparture,
      i18n: packages.i18n,
      destinationI18n: destinations.i18n,
    })
    .from(packages)
    .innerJoin(destinations, eq(packages.destinationId, destinations.id))
    .where(and(...conditions))
    .orderBy(sql`${nextDeparture} is null`, asc(nextDeparture), asc(packages.price));
  return rows.map(({ i18n, destinationI18n, ...r }) => {
    const { title, board } = localizePackage({ title: r.title, board: r.board, i18n }, locale);
    return { ...r, title, board, destinationName: localizeDestination({ name: r.destinationName, i18n: destinationI18n }, locale).name };
  });
});

export type DestinationCard = Awaited<ReturnType<typeof getDestinationCards>>[number];

export const getDestinationCards = cache(async (locale: Locale = "es") => {
  const rows = await db
    .select({
      id: destinations.id,
      slug: destinations.slug,
      name: destinations.name,
      region: destinations.region,
      province: destinations.province,
      summary: destinations.summary,
      image: destinations.image,
      featured: destinations.featured,
      i18n: destinations.i18n,
      packagesCount: sql<number>`count(${packages.id})`.mapWith(Number),
      minPrice: sql<number | null>`min(case when ${packages.currency} = 'ARS' then ${packages.price} end)`,
    })
    .from(destinations)
    .leftJoin(packages, and(eq(packages.destinationId, destinations.id), eq(packages.published, true), eq(packages.kind, "paquete")))
    .groupBy(destinations.id)
    .having(sql`count(${packages.id}) > 0`)
    .orderBy(asc(destinations.name));
  return rows.map((d) => localizeDestination(d, locale));
});

export const getDestinationBySlug = cache(async (slug: string, locale: Locale = "es") => {
  const dest = await db.query.destinations.findFirst({ where: eq(destinations.slug, slug) });
  return dest ? localizeDestination(dest, locale) : null;
});

export const getPublishedReviews = cache(async () => {
  const settings = await getSettings();
  const source = settings.reviewsSource;
  return db
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.published, true),
        gte(reviews.rating, Number(settings.reviewsMinRating) || 1),
        source === "google" || source === "manual" ? eq(reviews.source, source) : undefined,
      ),
    )
    .orderBy(desc(sql`coalesce(${reviews.reviewedAt}, ${reviews.createdAt})`))
    .limit(Number(settings.reviewsCount) || 3);
});
