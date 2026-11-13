import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { BookingForm } from "@/components/site/booking-form";
import { getRates } from "@/lib/exchange-rates";
import { formatDuration, formatLongDate, seatsLeft } from "@/lib/format";
import { isMercadoPagoEnabled } from "@/lib/mercadopago";
import { policyLines } from "@/lib/policy";
import { DEFAULT_DEPOSIT_HOURS } from "@/lib/pricing";
import { firstBookableDate, getDailyAvailability, isDailyKind, lastBookableDate, MAX_NIGHTS } from "@/lib/products";
import { getPackageBySlug } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { asLocale, interpolate, localePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[locale]/reservar/[slug]">): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.meta.reservarTitle, robots: { index: false } };
}

export default async function ReservarPage({ params, searchParams }: PageProps<"/[locale]/reservar/[slug]">) {
  const [{ slug, locale: rawLocale }, sp] = await Promise.all([params, searchParams]);
  const locale = asLocale(rawLocale);
  const t = getDictionary(locale);
  const [pkg, settings, rates] = await Promise.all([getPackageBySlug(slug, locale), getSettings(), getRates()]);
  if (!pkg) notFound();
  const daily = isDailyKind(pkg.kind);
  const detailPath = daily ? `/productos/${pkg.slug}` : `/paquetes/${pkg.slug}`;
  if (settings.onlineBooking !== "1" || (!daily && pkg.departures.length === 0)) redirect(localePath(locale, detailPath));
  const calendar = daily ? await getDailyAvailability(pkg) : null;

  const salida = Number(sp.salida) || undefined;
  const departures = pkg.departures.map((d) => ({
    id: d.id,
    label: formatLongDate(d.date, locale),
    price: d.priceOverride ?? pkg.price,
    priceOverride: d.priceOverride,
    seatsLeft: seatsLeft(d),
  }));
  const initial = departures.find((d) => d.id === salida && d.seatsLeft > 0)?.id;

  return (
    <div className="container-x pt-6 pb-20">
      <nav aria-label={t.paquete.breadcrumb} className="flex items-center gap-1 text-sm text-ink-soft">
        <Link href={localePath(locale, detailPath)} className="hover:text-ink">{pkg.title}</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink">{t.meta.reservarTitle}</span>
      </nav>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">{t.booking.title}</h1>
      <p className="mt-2 text-ink-soft">
        {daily
          ? `${pkg.title} · ${pkg.destination.name}${pkg.schedule ? ` · ${pkg.schedule}` : ""}`
          : `${pkg.title} · ${formatDuration(pkg.days, pkg.nights, t.common)} · ${pkg.transport === "aereo" ? t.common.plane : t.common.bus}`}
      </p>

      <div className="mt-8">
        <BookingForm
          pkg={{ id: pkg.id, title: pkg.title, price: pkg.price, currency: pkg.currency }}
          departures={departures}
          initialDepartureId={initial}
          policy={pkg.policy ? { depositPercent: pkg.policy.depositPercent, singleSurcharge: pkg.policy.singleSurcharge, infantsMonths: pkg.policy.infantsMonths } : null}
          mercadoPago={isMercadoPagoEnabled()}
          arsRate={pkg.currency === "ARS" ? null : rates[pkg.currency]}
          depositHours={pkg.policy?.depositHours ?? DEFAULT_DEPOSIT_HOURS}
          terms={pkg.policy ? policyLines(pkg.policy, t.policy) : [t.booking.defaultTerms]}
          daily={
            daily && calendar && pkg.kind !== "paquete"
              ? {
                  kind: pkg.kind,
                  calendar,
                  first: firstBookableDate(),
                  last: lastBookableDate(),
                  capacityPerUnit: pkg.capacityPerUnit,
                  minNights: pkg.minNights,
                  maxNights: MAX_NIGHTS,
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
