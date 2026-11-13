import Image from "next/image";
import { Price } from "@/components/site/currency";
import Link from "next/link";
import { ArrowRight, Bus, MessageCircle, Plane, Wallet } from "lucide-react";
import { GoogleStars, WhatsAppIcon } from "@/components/site/icons";
import { PackageCard } from "@/components/site/package-card";
import { TrustBar } from "@/components/site/trust-bar";
import { availabilityLabel, formatShortDate } from "@/lib/format";
import { getDestinationCards, getPackageCards, getPublishedReviews, getUpcomingDepartures } from "@/lib/queries";
import { getSettings, localizedSetting } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { asLocale, INTL_LOCALE, interpolate, localePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const revalidate = 3600;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const href = (path: string) => localePath(locale, path);
  const reviewDate = new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long", year: "numeric" });
  const [settings, upcoming, featured, destinations, reviews] = await Promise.all([
    getSettings(),
    getUpcomingDepartures(locale, 6),
    getPackageCards({ featured: true, locale }),
    getDestinationCards(locale),
    getPublishedReviews(),
  ]);
  const recommended = featured.length >= 3 ? featured.slice(0, 6) : (await getPackageCards({ locale })).slice(0, 6);
  const featuredDestinations = destinations.filter((d) => d.featured).slice(0, 6);
  const next = upcoming[0];

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="container-x grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-sm font-semibold text-sun">{t.home.eyebrow}</p>
            <h1 className="mt-4 font-display text-5xl leading-[1.02] font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              {localizedSetting(settings, "heroTitle", locale)}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">{localizedSetting(settings, "heroSubtitle", locale)}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href={href("/salidas")} className="btn-primary px-6 py-3.5 text-base">
                {t.common.seeDepartures} <ArrowRight className="size-4" />
              </Link>
              <a
                href={whatsappLink(settings.whatsapp, t.wa.hero)}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 text-sm font-semibold text-white underline decoration-white/30 underline-offset-4 transition-colors duration-150 hover:decoration-white"
                data-event="whatsapp_click"
                data-location="hero"
              >
                <WhatsAppIcon className="size-4" /> {t.common.whatsappCta}
              </a>
            </div>
            <a href={settings.googleReviewsUrl} target="_blank" rel="noopener" className="mt-8 inline-flex items-center gap-3 text-sm text-white/70 hover:text-white">
              <GoogleStars rating={Number(settings.googleRating)} />
              <span><strong className="text-white">{settings.googleRating}</strong> · {interpolate(t.common.reviewsOnGoogle, { n: settings.googleReviews })}</span>
            </a>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl sm:aspect-square">
              <Image src="/media/hero.webp" alt={t.home.heroAlt} fill priority sizes="(min-width: 1024px) 520px, 90vw" className="object-cover" />
            </div>
            {next && (
              <Link
                href={href(`/paquetes/${next.packageSlug}?salida=${next.id}`)}
                className="absolute -bottom-6 left-4 right-4 flex items-center gap-4 rounded-lg bg-white p-4 text-ink shadow-lg ring-1 ring-ink/10 transition-shadow duration-150 hover:shadow-xl sm:left-auto sm:-right-4 sm:w-80"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-sun text-ink">
                  {next.transport === "aereo" ? <Plane className="size-6" /> : <Bus className="size-6" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-ink-soft">{interpolate(t.home.nextDeparture, { date: formatShortDate(next.date, locale) })}</span>
                  <span className="block truncate font-semibold">{next.packageTitle}</span>
                  <span className="block text-sm font-bold text-lake"><Price amount={next.price} currency={next.currency} /></span>
                </span>
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="container-x pt-16">
        <TrustBar settings={settings} t={t.trust} />
      </section>

      <section className="container-x pt-14 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t.home.agenda}</p>
            <h2 className="mt-1 font-display text-4xl font-bold">{t.home.upcoming}</h2>
          </div>
          <Link href={href("/salidas")} className="link-arrow">{t.home.fullCalendar} <ArrowRight className="size-4" /></Link>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {upcoming.map((d) => {
            const availability = availabilityLabel(d, t.common);
            return (
              <Link key={d.id} href={href(`/paquetes/${d.packageSlug}?salida=${d.id}`)} className="flex items-center gap-4 rounded-lg bg-white p-4 ring-1 ring-ink/10 transition-colors duration-150 hover:ring-lake/40">
                <div className="w-14 shrink-0 rounded-md bg-sand py-2 text-center">
                  <p className="text-[11px] font-semibold text-ink-soft uppercase">{formatShortDate(d.date, locale).split(" ").at(-1)}</p>
                  <p className="font-display text-2xl leading-none font-bold">{d.date.slice(8, 10)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{d.packageTitle}</p>
                  <p className={`text-xs font-medium ${availability.tone === "hot" ? "text-sun-dark" : "text-ink-soft"}`}>{availability.label}</p>
                </div>
                <p className="font-display text-lg font-bold text-lake"><Price amount={d.price} currency={d.currency} /></p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="container-x">
          <p className="eyebrow">{t.home.recommendedEyebrow}</p>
          <h2 className="mt-1 font-display text-4xl font-bold">{t.home.recommended}</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} locale={locale} />)}
          </div>
        </div>
      </section>

      <section className="container-x py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t.home.destinationsEyebrow}</p>
            <h2 className="mt-1 font-display text-4xl font-bold">{t.home.destinations}</h2>
          </div>
          <Link href={href("/destinos")} className="link-arrow">{t.home.allDestinations} <ArrowRight className="size-4" /></Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 lg:auto-rows-[230px] lg:grid-cols-3">
          {featuredDestinations.map((d, i) => (
            <Link
              key={d.id}
              href={href(`/destinos/${d.slug}`)}
              className={`group relative aspect-[4/3] overflow-hidden rounded-lg bg-ink lg:aspect-auto ${i === 0 ? "lg:col-span-2 lg:row-span-2" : ""}`}
            >
              {d.image && (
                <Image
                  src={d.image}
                  alt={d.name}
                  fill
                  sizes={i === 0 ? "(min-width: 1024px) 740px, 50vw" : "(min-width: 1024px) 360px, 50vw"}
                  className="object-cover opacity-85 transition-opacity duration-200 group-hover:opacity-70"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/20 to-transparent" />
              <div className={`absolute inset-x-0 bottom-0 p-4 text-white ${i === 0 ? "sm:p-7" : "sm:p-5"}`}>
                <p className="text-xs text-white/75">{d.region}</p>
                <p className={`font-display font-bold ${i === 0 ? "text-2xl sm:text-4xl" : "text-xl sm:text-2xl"}`}>{d.name}</p>
                {d.minPrice && <p className="text-sm text-white/80">{t.common.fromLower} <Price amount={d.minPrice} currency="ARS" /></p>}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-lake text-white">
        <div className="container-x grid items-center gap-12 py-24 lg:grid-cols-[5fr_6fr]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-xl">
            <Image src="/media/grupo-merlo.webp" alt={t.home.whyGroupAlt} fill sizes="(min-width: 1024px) 470px, 90vw" className="object-cover" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sun">{t.home.whyEyebrow}</p>
            <h2 className="mt-1 max-w-lg font-display text-4xl leading-tight font-bold">{t.home.why}</h2>
            <ul className="mt-10 divide-y divide-white/15 border-y border-white/15">
              {[
                { icon: MessageCircle, title: t.home.why1Title, text: t.home.why1Text },
                { icon: Bus, title: t.home.why2Title, text: t.home.why2Text },
                { icon: Wallet, title: t.home.why3Title, text: t.home.why3Text },
              ].map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4 py-5">
                  <Icon className="mt-0.5 size-5 shrink-0 text-sun" aria-hidden />
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-1 max-w-prose text-white/80">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="container-x grid gap-10 py-16 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <div>
          <p className="eyebrow">{t.home.howEyebrow}</p>
          <h2 className="mt-1 font-display text-4xl font-bold">{t.home.how}</h2>
        </div>
        <ol className="divide-y divide-ink/10 border-y border-ink/10">
          {[
            { title: t.home.how1Title, text: t.home.how1Text },
            { title: t.home.how2Title, text: t.home.how2Text },
            { title: t.home.how3Title, text: t.home.how3Text },
          ].map(({ title, text }, i) => (
            <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 py-6 sm:grid-cols-[3rem_14rem_1fr] sm:items-baseline">
              <span className="font-display text-3xl font-bold text-sun-dark tabular-nums">{i + 1}</span>
              <p className="font-display text-xl font-bold">{title}</p>
              <p className="col-start-2 mt-1 max-w-prose text-ink-soft sm:col-start-3 sm:mt-0">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {reviews.length > 0 && (
        <section className="bg-white py-20">
          <div className="container-x">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{t.home.reviewsEyebrow}</p>
                <h2 className="mt-1 font-display text-4xl font-bold">{interpolate(t.home.reviews, { n: settings.googleReviews })}</h2>
              </div>
              <a href={settings.googleReviewsUrl} target="_blank" rel="noopener" className="link-arrow">{t.home.seeReviews} <ArrowRight className="size-4" /></a>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {reviews.map((r) => (
                <figure key={r.id} className="flex flex-col rounded-xl bg-sand p-7">
                  <GoogleStars rating={r.rating} />
                  <blockquote className="mt-4 flex-1 leading-relaxed">“{r.text}”</blockquote>
                  <figcaption className="mt-5 flex items-center gap-3 text-sm">
                    {r.authorPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.authorPhoto} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" className="size-9 rounded-full" />
                    ) : (
                      <span className="grid size-9 place-items-center rounded-full bg-ink text-xs font-bold text-white">{r.author.charAt(0)}</span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-semibold">{r.author}</span>
                      <span className="block text-xs text-ink-soft">
                        {r.source === "google" ? t.home.googleReview : r.trip ? interpolate(t.home.traveledTo, { trip: r.trip }) : t.home.client}
                        {r.reviewedAt && ` · ${reviewDate.format(r.reviewedAt)}`}
                      </span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="container-x pt-16 pb-20">
        <div className="flex flex-col items-start gap-6 rounded-xl bg-sun p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">{t.home.ctaTitle}</h2>
            <p className="mt-2 max-w-lg text-ink/80">{t.home.ctaText}</p>
          </div>
          <a href={whatsappLink(settings.whatsapp, t.wa.recommend)} target="_blank" rel="noopener" className="btn-dark px-6 py-3.5 text-base" data-event="whatsapp_click" data-location="cta_final">
            <WhatsAppIcon className="size-4" /> {t.home.ctaButton}
          </a>
        </div>
      </section>
    </>
  );
}
