import type { MetadataRoute } from "next";
import { LOCALES, localePath } from "@/lib/i18n/config";
import { getPublishedKinds, isDailyKind, KIND_PATH } from "@/lib/products";
import { getDestinationCards, getPublishedPackageSlugs } from "@/lib/queries";

export const revalidate = 3600;

type Freq = MetadataRoute.Sitemap[number]["changeFrequency"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const [packages, products, destinations, kinds] = await Promise.all([
    getPublishedPackageSlugs(),
    getPublishedPackageSlugs("productos"),
    getDestinationCards(),
    getPublishedKinds(),
  ]);
  const pages: { path: string; changeFrequency: Freq; priority: number }[] = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/salidas", changeFrequency: "daily", priority: 0.9 },
    { path: "/destinos", changeFrequency: "weekly", priority: 0.8 },
    { path: "/nosotros", changeFrequency: "monthly", priority: 0.4 },
    { path: "/contacto", changeFrequency: "monthly", priority: 0.5 },
    ...destinations.map((d) => ({ path: `/destinos/${d.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...packages.map((p) => ({ path: `/paquetes/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...kinds.filter(isDailyKind).map((k) => ({ path: KIND_PATH[k], changeFrequency: "weekly" as const, priority: 0.7 })),
    ...products.map((p) => ({ path: `/productos/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
  return pages.flatMap(({ path, ...rest }) =>
    LOCALES.map((locale) => ({
      url: `${base}${localePath(locale, path)}`,
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${base}${localePath(l, path)}`])) },
      ...rest,
      priority: locale === "es" ? rest.priority : Math.round(rest.priority * 0.8 * 10) / 10,
    })),
  );
}
