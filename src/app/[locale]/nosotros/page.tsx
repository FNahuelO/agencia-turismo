import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { TrustBar } from "@/components/site/trust-bar";
import { getSettings } from "@/lib/settings";
import { asLocale, interpolate, localeAlternates, localePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[locale]/nosotros">): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  return { title: t.meta.nosotrosTitle, description: t.meta.nosotrosDescription, alternates: localeAlternates(locale, "/nosotros") };
}

export default async function NosotrosPage({ params }: PageProps<"/[locale]/nosotros">) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const settings = await getSettings();
  return (
    <>
      <section className="container-x grid items-center gap-12 py-16 lg:grid-cols-2">
        <div>
          <p className="eyebrow">{t.nosotros.eyebrow}</p>
          <h1 className="mt-2 font-display text-5xl font-bold tracking-tight">{interpolate(t.nosotros.title, { years: settings.yearsActive })}</h1>
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-ink-soft">
            <p>{interpolate(t.nosotros.p1, { city: settings.city })}</p>
            <p>{t.nosotros.p2}</p>
          </div>
          <Link href={localePath(locale, "/salidas")} className="btn-primary mt-8">{t.common.seeDepartures}</Link>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-xl">
          <Image src="/media/foto-salta.webp" alt={t.nosotros.imageAlt} fill priority sizes="(min-width: 1024px) 520px, 90vw" className="object-cover" />
        </div>
      </section>
      <section className="container-x pb-20">
        <TrustBar settings={settings} t={t.trust} />
      </section>
    </>
  );
}
