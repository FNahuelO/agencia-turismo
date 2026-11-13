import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Analytics } from "@/components/site/analytics";
import { CurrencyProvider } from "@/components/site/currency";
import { I18nProvider } from "@/components/site/i18n";
import { getRates } from "@/lib/exchange-rates";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { WhatsAppFloat } from "@/components/site/whatsapp-float";
import { LOCALES, OG_LOCALE, isLocale, localeAlternates } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getPublishedKinds } from "@/lib/products";
import { getSettings } from "@/lib/settings";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    title: { default: t.meta.title, template: "%s · TravelAr Turismo" },
    description: t.meta.description,
    alternates: localeAlternates(locale, "/"),
    openGraph: { type: "website", locale: OG_LOCALE[locale], siteName: "TravelAr Turismo", images: ["/media/hero.webp"] },
  };
}

export default async function SiteLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [settings, rates, kinds] = await Promise.all([getSettings(), getRates(), getPublishedKinds()]);
  const t = getDictionary(locale);
  return (
    <I18nProvider locale={locale} t={t}>
      {locale !== "es" && (
        <script dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(locale)}` }} />
      )}
      <CurrencyProvider rates={rates}>
        <Header settings={settings} locale={locale} productKinds={kinds} />
        <main>{children}</main>
        <Footer settings={settings} locale={locale} />
        <WhatsAppFloat number={settings.whatsapp} locale={locale} />
        <Analytics />
      </CurrencyProvider>
    </I18nProvider>
  );
}
