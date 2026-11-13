import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PackageCard } from "@/components/site/package-card";
import { ProductCard } from "@/components/site/product-card";
import { DAILY_KINDS, getProductCards } from "@/lib/products";
import { getDestinationBySlug, getDestinationCards, getPackageCards } from "@/lib/queries";
import { asLocale, interpolate, localeAlternates, localePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const revalidate = 3600;

export async function generateStaticParams() {
  const destinations = await getDestinationCards();
  return destinations.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/destinos/[slug]">): Promise<Metadata> {
  const { slug, locale: rawLocale } = await params;
  const locale = asLocale(rawLocale);
  const t = getDictionary(locale);
  const dest = await getDestinationBySlug(slug, locale);
  if (!dest) return {};
  return {
    title: interpolate(t.meta.destinoTitle, { name: dest.name }),
    description: interpolate(t.meta.destinoDescription, { summary: dest.summary, name: dest.name }),
    alternates: localeAlternates(locale, `/destinos/${dest.slug}`),
    openGraph: { images: dest.image ? [dest.image] : undefined },
  };
}

export default async function DestinoPage({ params }: PageProps<"/[locale]/destinos/[slug]">) {
  const { slug, locale: rawLocale } = await params;
  const locale = asLocale(rawLocale);
  const t = getDictionary(locale);
  const dest = await getDestinationBySlug(slug, locale);
  if (!dest) notFound();
  const [packages, ...productGroups] = await Promise.all([
    getPackageCards({ destinationId: dest.id, locale }),
    ...DAILY_KINDS.map((k) => getProductCards(k, locale, dest.id)),
  ]);
  const products = productGroups.flat();

  return (
    <div className="container-x py-12">
      <nav aria-label={t.paquete.breadcrumb} className="flex items-center gap-1 text-sm text-ink-soft">
        <Link href={localePath(locale, "/destinos")} className="hover:text-ink">{t.destinos.breadcrumb}</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink">{dest.name}</span>
      </nav>
      <p className="eyebrow mt-6">{dest.region} · {dest.province}</p>
      <h1 className="mt-2 font-display text-5xl font-bold tracking-tight">{interpolate(t.destinos.heading, { name: dest.name })}</h1>
      {dest.description && <p className="mt-4 max-w-2xl text-lg text-ink-soft">{dest.description}</p>}

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg, i) => <PackageCard key={pkg.id} pkg={pkg} locale={locale} priority={i < 3} />)}
      </div>
      {packages.length === 0 && products.length === 0 && <p className="mt-10 text-ink-soft">{t.destinos.empty}</p>}
      {products.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-3xl font-bold">{DAILY_KINDS.filter((k) => products.some((p) => p.kind === k)).map((k) => t.products.kinds[k]).join(" · ")}</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => <ProductCard key={product.id} product={product} locale={locale} />)}
          </div>
        </section>
      )}
    </div>
  );
}
