import type { Metadata } from "next";
import { Price } from "@/components/site/currency";
import Image from "next/image";
import Link from "next/link";
import { REGIONS } from "@/db/schema";
import { getDestinationCards } from "@/lib/queries";
import { asLocale, interpolate, localeAlternates, localePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[locale]/destinos">): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  return { title: t.meta.destinosTitle, description: t.meta.destinosDescription, alternates: localeAlternates(locale, "/destinos") };
}

export default async function DestinosPage({ params }: PageProps<"/[locale]/destinos">) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const destinations = await getDestinationCards(locale);
  return (
    <div className="container-x py-12">
      <p className="eyebrow">{t.destinos.breadcrumb}</p>
      <h1 className="mt-2 font-display text-5xl font-bold tracking-tight">{t.destinos.title}</h1>
      <nav aria-label={t.destinos.regions} className="mt-6 flex flex-wrap gap-2">
        {REGIONS.filter((r) => destinations.some((d) => d.region === r)).map((r) => (
          <a key={r} href={`#${r.replace(/\s/g, "-")}`} className="rounded-full bg-white px-4 py-2 text-sm font-medium ring-1 ring-ink/10 hover:bg-ink hover:text-white">{r}</a>
        ))}
      </nav>

      <div className="mt-12 space-y-16">
        {REGIONS.map((region) => {
          const items = destinations.filter((d) => d.region === region);
          if (!items.length) return null;
          return (
            <section key={region} id={region.replace(/\s/g, "-")} className="scroll-mt-24">
              <h2 className="font-display text-3xl font-bold">{region}</h2>
              <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {items.map((d) => (
                  <Link key={d.id} href={localePath(locale, `/destinos/${d.slug}`)} className="group overflow-hidden rounded-xl bg-white ring-1 ring-ink/10 transition-shadow duration-150 hover:shadow-md hover:ring-ink/20">
                    <div className="relative aspect-[4/3] bg-sand-dark">
                      {d.image && <Image src={d.image} alt={d.name} fill sizes="(min-width: 1024px) 270px, (min-width: 768px) 33vw, 50vw" className="object-cover transition-opacity duration-200 group-hover:opacity-90" />}
                    </div>
                    <div className="p-4">
                      <p className="font-display text-lg font-bold">{d.name}</p>
                      <p className="text-xs text-ink-soft">{d.province} · {d.packagesCount === 1 ? t.common.program : interpolate(t.common.programs, { n: d.packagesCount })}</p>
                      {d.minPrice && <p className="mt-2 text-sm font-semibold text-lake">{t.common.fromLower} <Price amount={d.minPrice} currency="ARS" /></p>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
