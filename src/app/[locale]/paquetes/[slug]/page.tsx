import type { Metadata } from "next";
import { Price } from "@/components/site/currency";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BedDouble, Bus, CalendarDays, Check, ChevronRight, Clock, Plane, Utensils, X } from "lucide-react";
import { TrackView } from "@/components/site/analytics";
import { WhatsAppIcon } from "@/components/site/icons";
import { LeadForm } from "@/components/site/lead-form";
import { ImageFallback } from "@/components/site/package-card";
import { availabilityLabel, formatDuration, formatLongDate, formatPrice, formatShortDate, seatsLeft } from "@/lib/format";
import { policyLines } from "@/lib/policy";
import { getPackageBySlug, getPublishedPackageSlugs } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { packageWhatsappMessage, whatsappLink } from "@/lib/whatsapp";
import { asLocale, interpolate, localeAlternates, localePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const revalidate = 3600;

export async function generateStaticParams() {
  return getPublishedPackageSlugs();
}

export async function generateMetadata({ params }: PageProps<"/[locale]/paquetes/[slug]">): Promise<Metadata> {
  const { slug, locale: rawLocale } = await params;
  const locale = asLocale(rawLocale);
  const t = getDictionary(locale);
  const pkg = await getPackageBySlug(slug, locale);
  if (!pkg) return {};
  const title = interpolate(t.meta.paqueteTitle, {
    title: pkg.title,
    transport: pkg.transport === "aereo" ? t.common.inPlane : t.common.inBus,
    duration: formatDuration(pkg.days, pkg.nights, t.common),
  });
  const description = interpolate(t.meta.paqueteDescription, { destination: pkg.destination.name, price: formatPrice(pkg.price, pkg.currency) });
  return {
    title,
    description,
    alternates: localeAlternates(locale, `/paquetes/${pkg.slug}`),
    openGraph: { title, description, images: pkg.image ? [pkg.image] : undefined },
  };
}

export default async function PackagePage({ params }: PageProps<"/[locale]/paquetes/[slug]">) {
  const { slug, locale: rawLocale } = await params;
  const locale = asLocale(rawLocale);
  const t = getDictionary(locale);
  const href = (path: string) => localePath(locale, path);
  const [pkg, settings] = await Promise.all([getPackageBySlug(slug, locale), getSettings()]);
  if (!pkg) notFound();
  if (pkg.kind !== "paquete") permanentRedirect(href(`/productos/${pkg.slug}`));

  const TransportIcon = pkg.transport === "aereo" ? Plane : Bus;
  const prices = pkg.departures.map((d) => d.priceOverride ?? pkg.price);
  const fromPrice = prices.length ? Math.min(...prices) : pkg.price;
  const nextDep = pkg.departures.find((d) => seatsLeft(d) > 0);
  const canBook = settings.onlineBooking === "1" && Boolean(nextDep);
  const waUrl = whatsappLink(
    settings.whatsapp,
    packageWhatsappMessage(t.wa, {
      title: `${pkg.title} (${formatDuration(pkg.days, pkg.nights, t.common)})`,
      date: nextDep ? formatShortDate(nextDep.date, locale) : undefined,
    }),
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: `${pkg.title} · ${formatDuration(pkg.days, pkg.nights, t.common)}`,
    description: pkg.summary,
    image: pkg.image ? new URL(pkg.image, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString() : undefined,
    touristType: "Viaje grupal",
    itinerary: { "@type": "Place", name: pkg.destination.name, address: pkg.destination.province },
    provider: { "@type": "TravelAgency", name: settings.brandName, telephone: settings.phone },
    offers: pkg.departures.map((d) => ({
      "@type": "Offer",
      price: d.priceOverride ?? pkg.price,
      priceCurrency: pkg.currency,
      availability: seatsLeft(d) > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      validThrough: d.date,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <TrackView name="view_item" params={{ item: pkg.slug, value: fromPrice, currency: pkg.currency }} />

      <div className="container-x pt-6">
        <nav aria-label={t.paquete.breadcrumb} className="flex items-center gap-1 text-sm text-ink-soft">
          <Link href={href("/")} className="hover:text-ink">{t.nav.home}</Link>
          <ChevronRight className="size-3.5" />
          <Link href={href(`/destinos/${pkg.destination.slug}`)} className="hover:text-ink">{pkg.destination.name}</Link>
          <ChevronRight className="size-3.5" />
          <span className="text-ink">{formatDuration(pkg.days, pkg.nights, t.common)}</span>
        </nav>
      </div>

      <div className="container-x grid gap-10 pt-6 pb-20 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-sand-dark">
              {pkg.image ? (
                <Image src={pkg.image} alt={interpolate(t.paquete.imageAlt, { name: pkg.title })} fill priority sizes="(min-width: 1024px) 400px, (min-width: 768px) 45vw, 100vw" className="object-cover" />
              ) : (
                <ImageFallback name={pkg.title} />
              )}
            </div>
            <div>
              <p className="eyebrow">{pkg.destination.region} · {pkg.destination.province}</p>
              <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">{pkg.title}</h1>
              {pkg.summary && <p className="mt-3 text-lg text-ink-soft">{pkg.summary}</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                {pkg.tags.map((tag) => <span key={tag} className="rounded-full bg-sun/20 px-3 py-1 text-xs font-semibold text-ink">{tag}</span>)}
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-3">
                <Fact icon={Clock} label={t.paquete.duration} value={formatDuration(pkg.days, pkg.nights, t.common)} />
                <Fact icon={TransportIcon} label={t.paquete.transport} value={pkg.transport === "aereo" ? t.common.plane : t.common.busLong} />
                {pkg.hotel && <Fact icon={BedDouble} label={t.paquete.hotel} value={pkg.hotel} />}
                {pkg.board && <Fact icon={Utensils} label={t.paquete.board} value={pkg.board} />}
              </dl>
            </div>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <section className="rounded-xl bg-white p-7 ring-1 ring-ink/5">
              <h2 className="font-display text-2xl font-bold">{t.paquete.includes}</h2>
              <ul className="mt-4 space-y-3">
                {pkg.includes.map((item) => (
                  <li key={item} className="flex gap-3"><Check className="mt-0.5 size-5 shrink-0 text-emerald-600" />{item}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl bg-white p-7 ring-1 ring-ink/5">
              <h2 className="font-display text-2xl font-bold">{t.paquete.excludes}</h2>
              <ul className="mt-4 space-y-3">
                {pkg.excludes.map((item) => (
                  <li key={item} className="flex gap-3 text-ink-soft"><X className="mt-0.5 size-5 shrink-0 text-ink/40" />{item}</li>
                ))}
              </ul>
            </section>
          </div>

          {pkg.itinerary.length > 0 && (
            <section className="mt-12">
              <h2 className="font-display text-3xl font-bold">{t.paquete.itinerary}</h2>
              <ol className="mt-6 space-y-0">
                {pkg.itinerary.map((day, i) => (
                  <li key={i} className="relative flex gap-5 pb-8 last:pb-0">
                    {i < pkg.itinerary.length - 1 && <span className="absolute top-10 bottom-0 left-5 w-px bg-ink/10" />}
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink font-display font-bold text-white">{i + 1}</span>
                    <div className="pt-1.5">
                      <p className="font-semibold">{interpolate(t.paquete.dayN, { n: i + 1 })} · {day.title}</p>
                      <p className="mt-1 text-ink-soft">{day.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {pkg.video && (
            <section className="mt-12">
              <h2 className="font-display text-3xl font-bold">{t.paquete.video}</h2>
              <video controls preload="none" poster={pkg.image ?? undefined} className="mt-6 aspect-video w-full rounded-xl bg-ink object-cover">
                <source src={pkg.video} type="video/mp4" />
              </video>
            </section>
          )}

          {pkg.policy && (
            <section className="mt-12">
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
            <p className="font-display text-4xl font-bold text-lake"><Price amount={fromPrice} currency={pkg.currency} /></p>
            <p className="mt-1 text-xs text-ink-soft">{t.paquete.priceBase}{pkg.policy ? ` · ${interpolate(t.paquete.deposit, { n: pkg.policy.depositPercent })}` : ""}</p>

            {pkg.departures.length > 0 ? (
              <div className="mt-5">
                <p className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4" />{t.paquete.departures}</p>
                <ul className="mt-2 max-h-56 divide-y divide-ink/5 overflow-y-auto rounded-lg border border-ink/10">
                  {pkg.departures.map((d) => {
                    const availability = availabilityLabel(d, t.common);
                    const content = (
                      <>
                        <span>
                          <span className="block font-medium capitalize">{formatShortDate(d.date, locale)}</span>
                          <span className={`text-xs ${availability.tone === "hot" ? "text-sun-dark" : "text-ink-soft"}`}>{availability.label}</span>
                        </span>
                        <span className="font-semibold"><Price amount={d.priceOverride ?? pkg.price} currency={pkg.currency} /></span>
                      </>
                    );
                    return (
                      <li key={d.id}>
                        {canBook && seatsLeft(d) > 0 ? (
                          <Link href={href(`/reservar/${pkg.slug}?salida=${d.id}`)} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-sand/60">
                            {content}
                          </Link>
                        ) : (
                          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="mt-5 rounded-lg bg-sand p-4 text-sm text-ink-soft">{t.paquete.noDates}</p>
            )}

            {canBook && (
              <Link href={href(`/reservar/${pkg.slug}${nextDep ? `?salida=${nextDep.id}` : ""}`)} className="btn-primary mt-5 w-full" data-event="begin_checkout" data-location="package" data-item={pkg.slug}>
                {t.paquete.bookOnline}
              </Link>
            )}

            <a href={waUrl} target="_blank" rel="noopener" className={`btn-whatsapp w-full ${canBook ? "mt-3" : "mt-5"}`} data-event="whatsapp_click" data-location="package" data-item={pkg.slug}>
              <WhatsAppIcon className="size-4" /> {t.common.whatsappCta}
            </a>

            <div className="my-5 flex items-center gap-3 text-xs text-ink-soft">
              <span className="h-px flex-1 bg-ink/10" />{t.paquete.orLeaveData}<span className="h-px flex-1 bg-ink/10" />
            </div>

            <LeadForm
              compact
              packageId={pkg.id}
              packageTitle={pkg.title}
              departures={pkg.departures.map((d) => ({
                id: d.id,
                label: `${formatLongDate(d.date, locale)}${seatsLeft(d) === 0 ? t.paquete.soldOutSuffix : ""}`,
                disabled: seatsLeft(d) === 0,
              }))}
            />
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
