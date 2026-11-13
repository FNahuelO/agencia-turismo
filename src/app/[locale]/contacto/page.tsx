import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/site/icons";
import { LeadForm } from "@/components/site/lead-form";
import { getSettings, localizedSetting } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { asLocale, localeAlternates } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[locale]/contacto">): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  return { title: t.meta.contactoTitle, description: t.meta.contactoDescription, alternates: localeAlternates(locale, "/contacto") };
}

export default async function ContactoPage({ params }: PageProps<"/[locale]/contacto">) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const settings = await getSettings();
  const mapQuery = encodeURIComponent(`${settings.address}, ${settings.city}`);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TravelAgency",
    name: settings.brandName,
    telephone: settings.phone,
    email: settings.email,
    address: { "@type": "PostalAddress", streetAddress: settings.address, addressLocality: settings.city, postalCode: settings.postalCode, addressCountry: "AR" },
    aggregateRating: { "@type": "AggregateRating", ratingValue: settings.googleRating, reviewCount: settings.googleReviews },
  };

  return (
    <div className="container-x py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <p className="eyebrow">{t.contacto.eyebrow}</p>
      <h1 className="mt-2 font-display text-5xl font-bold tracking-tight">{t.contacto.title}</h1>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-xl bg-white p-7 ring-1 ring-ink/5">
            <h2 className="font-display text-2xl font-bold">{t.contacto.office}</h2>
            <ul className="mt-5 space-y-4">
              <li className="flex gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-lake" />{settings.address}, {settings.city} ({settings.postalCode})</li>
              <li className="flex gap-3"><Clock className="mt-0.5 size-5 shrink-0 text-lake" />{localizedSetting(settings, "hours", locale)}</li>
              <li><a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="flex gap-3 hover:text-lake"><Phone className="mt-0.5 size-5 shrink-0 text-lake" />{settings.phone}</a></li>
              <li><a href={`mailto:${settings.email}`} className="flex gap-3 hover:text-lake"><Mail className="mt-0.5 size-5 shrink-0 text-lake" />{settings.email}</a></li>
            </ul>
            <a href={whatsappLink(settings.whatsapp, t.wa.general)} target="_blank" rel="noopener" className="btn-whatsapp mt-6" data-event="whatsapp_click" data-location="contacto">
              <WhatsAppIcon className="size-4" /> {t.nav.whatsapp}
            </a>
          </div>
          <iframe
            title={t.contacto.mapTitle}
            src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="aspect-[4/3] w-full rounded-xl border-0 ring-1 ring-ink/5"
          />
        </div>
        <div className="rounded-xl bg-white p-7 ring-1 ring-ink/5">
          <h2 className="font-display text-2xl font-bold">{t.contacto.formTitle}</h2>
          <p className="mt-1 text-ink-soft">{t.contacto.formText}</p>
          <div className="mt-6"><LeadForm /></div>
        </div>
      </div>
    </div>
  );
}
