import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CalendarDays, Check, ChevronRight, Clock, MapPin, Users, X } from "lucide-react";
import { TrackView } from "@/components/site/analytics";
import { Price } from "@/components/site/currency";
import { WhatsAppIcon } from "@/components/site/icons";
import { LeadForm } from "@/components/site/lead-form";
import { ImageFallback } from "@/components/site/package-card";
import { KIND_ICON } from "@/components/site/product-card";
import { formatPrice } from "@/lib/format";
import { policyLines } from "@/lib/policy";
import { isDailyKind, KIND_PATH } from "@/lib/products";
import { getPackageBySlug, getPublishedPackageSlugs } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { packageWhatsappMessage, whatsappLink } from "@/lib/whatsapp";
import { asLocale, interpolate, localeAlternates, localePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const revalidate = 3600;

export async function generateStaticParams() {
  return getPublishedPackageSlugs("productos");
}

export async function generateMetadata({ params }: PageProps<"/[locale]/productos/[slug]">): Promise<Metadata> {
  const { slug, locale: rawLocale } = await params;
  const locale = asLocale(rawLocale);
  const t = getDictionary(locale);
  const pkg = await getPackageBySlug(slug, locale);
  if (!pkg || !isDailyKind(pkg.kind)) return {};
  const title = `${pkg.title} · ${pkg.destination.name}`;
  const description = pkg.summary || `${t.products.singular[pkg.kind]} · ${pkg.destination.name} · ${t.common.from} ${formatPrice(pkg.price, pkg.currency)} ${t.products.unit[pkg.kind]}`;
  return {
    title,
    description,
    alternates: localeAlternates(locale, `/productos/${pkg.slug}`),
    openGraph: { title, description, images: pkg.image ? [pkg.image] : undefined },
  };
}

export default async function ProductPage({ params }: PageProps<"/[locale]/productos/[slug]">) {
  const { slug, locale: rawLocale } = await params;
  const locale = asLocale(rawLocale);
  const t = getDictionary(locale);
  const p = t.products;
  const href = (path: string) => localePath(locale, path);
  const [pkg, settings] = await Promise.all([getPackageBySlug(slug, locale), getSettings()]);
  if (!pkg) notFound();
  if (!isDailyKind(pkg.kind)) permanentRedirect(href(`/paquetes/${pkg.slug}`));
  const kind = pkg.kind;
  const Icon = KIND_ICON[kind];
  const canBook = settings.onlineBooking === "1";
  const waUrl = whatsappLink(
    settings.whatsapp,
    packageWhatsappMessage(t.wa, { brand: settings.brandName, title: `${pkg.title} (${pkg.destination.name})` }),
  );

  return (
    <>
      <TrackView name="view_item" params={{ item: pkg.slug, value: pkg.price, currency: pkg.currency }} />

      <div className="container-x pt-6">
        <nav aria-label={t.paquete.breadcrumb} className="flex items-center gap-1 text-sm text-ink-soft">
          <Link href={href("/")} className="hover:text-ink">{t.nav.home}</Link>
          <ChevronRight className="size-3.5" />
          <Link href={href(KIND_PATH[kind])} className="hover:text-ink">{p.kinds[kind]}</Link>
          <ChevronRight className="size-3.5" />
          <span className="text-ink">{pkg.destination.name}</span>
        </nav>
      </div>

      <div className="container-x grid gap-10 pt-6 pb-20 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-sand-dark">
            {pkg.image ? (
              <Image src={pkg.image} alt={interpolate(t.paquete.imageAlt, { name: pkg.title })} fill priority sizes="(min-width: 1024px) 760px, 100vw" className="object-cover" />
            ) : (
              <ImageFallback name={pkg.title} />
            )}
          </div>
          <p className="eyebrow mt-8 flex items-center gap-1.5"><Icon className="size-4" />{p.singular[kind]} · {pkg.destination.name}</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">{pkg.title}</h1>
          {pkg.summary && <p className="mt-3 text-lg text-ink-soft">{pkg.summary}</p>}

          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <Fact icon={MapPin} label={p.location} value={[pkg.destination.name, pkg.destination.province].filter(Boolean).join(", ")} />
            {pkg.schedule && <Fact icon={Clock} label={p.schedule[kind]} value={pkg.schedule} />}
            {kind === "traslado" && <Fact icon={Users} label={p.unit.traslado} value={interpolate(p.perVehicle, { n: pkg.capacityPerUnit })} />}
            {kind === "hotel" && <Fact icon={Users} label={p.rooms} value={interpolate(p.perRoom, { n: pkg.capacityPerUnit })} />}
            {kind === "hotel" && pkg.minNights > 1 && <Fact icon={CalendarDays} label={p.stay} value={interpolate(p.minNights, { n: pkg.minNights })} />}
            {pkg.board && <Fact icon={Check} label={t.paquete.board} value={pkg.board} />}
          </dl>

          {(pkg.includes.length > 0 || pkg.excludes.length > 0) && (
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {pkg.includes.length > 0 && (
                <section className="rounded-xl bg-white p-7 ring-1 ring-ink/5">
                  <h2 className="font-display text-2xl font-bold">{t.paquete.includes}</h2>
                  <ul className="mt-4 space-y-3">
                    {pkg.includes.map((item) => <li key={item} className="flex gap-3"><Check className="mt-0.5 size-5 shrink-0 text-emerald-600" />{item}</li>)}
                  </ul>
                </section>
              )}
              {pkg.excludes.length > 0 && (
                <section className="rounded-xl bg-white p-7 ring-1 ring-ink/5">
                  <h2 className="font-display text-2xl font-bold">{t.paquete.excludes}</h2>
                  <ul className="mt-4 space-y-3">
                    {pkg.excludes.map((item) => <li key={item} className="flex gap-3 text-ink-soft"><X className="mt-0.5 size-5 shrink-0 text-ink/40" />{item}</li>)}
                  </ul>
                </section>
              )}
            </div>
          )}

          {pkg.itinerary.length > 0 && (
            <section className="mt-10 space-y-4">
              {pkg.itinerary.map((block, i) => (
                <div key={i}>
                  <h2 className="font-display text-2xl font-bold">{block.title}</h2>
                  {block.text && <p className="mt-2 text-ink-soft">{block.text}</p>}
                </div>
              ))}
            </section>
          )}

          {pkg.policy && (
            <section className="mt-10">
              <details className="group rounded-xl bg-white p-7 ring-1 ring-ink/5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-display text-2xl font-bold [&::-webkit-details-marker]:hidden">
                  {t.paquete.conditions}
                  <ChevronRight className="size-5 transition-transform group-open:rotate-90" />
                </summary>
                <ul className="mt-5 list-disc space-y-2 pl-5 text-ink-soft">
                  {policyLines(pkg.policy, t.policy).map((line) => <li key={line}>{line}</li>)}
                </ul>
              </details>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl bg-white p-6 shadow-xl shadow-ink/5 ring-1 ring-ink/5">
            <p className="text-sm text-ink-soft">{t.paquete.priceFrom}</p>
            <p className="font-display text-4xl font-bold text-lake">
              <Price amount={pkg.price} currency={pkg.currency} /> <span className="text-base font-medium text-ink-soft">{p.unit[kind]}</span>
            </p>
            {pkg.policy && <p className="mt-1 text-xs text-ink-soft">{interpolate(t.paquete.deposit, { n: pkg.policy.depositPercent })}</p>}

            {canBook && (
              <Link href={href(`/reservar/${pkg.slug}`)} className="btn-primary mt-5 w-full" data-event="begin_checkout" data-location="product" data-item={pkg.slug}>
                {p.bookNow}
              </Link>
            )}
            <a href={waUrl} target="_blank" rel="noopener" className={`btn-whatsapp w-full ${canBook ? "mt-3" : "mt-5"}`} data-event="whatsapp_click" data-location="product" data-item={pkg.slug}>
              <WhatsAppIcon className="size-4" /> {t.common.whatsappCta}
            </a>

            <div className="my-5 flex items-center gap-3 text-xs text-ink-soft">
              <span className="h-px flex-1 bg-ink/10" />{t.paquete.orLeaveData}<span className="h-px flex-1 bg-ink/10" />
            </div>
            <LeadForm compact packageId={pkg.id} packageTitle={pkg.title} />
          </div>
        </aside>
      </div>
    </>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-3.5 ring-1 ring-ink/5">
      <dt className="flex items-center gap-1.5 text-xs text-ink-soft"><Icon className="size-3.5" />{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
