import Link from "next/link";
import { Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import type { SiteSettings } from "@/lib/settings";
import { interpolate, localePath, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { GoogleStars, InstagramIcon } from "./icons";

export function Footer({ settings, locale }: { settings: SiteSettings; locale: Locale }) {
  const t = getDictionary(locale);
  const href = (path: string) => localePath(locale, path);
  return (
    <footer className="bg-ink text-white/80">
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-display text-2xl font-bold text-white">{settings.brandName}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed">
            {interpolate(t.footer.about, { years: settings.yearsActive })}
          </p>
          <a href={settings.googleReviewsUrl} target="_blank" rel="noopener" className="mt-5 inline-flex items-center gap-2 text-sm hover:text-white">
            <GoogleStars rating={Number(settings.googleRating)} />
            <span>{interpolate(t.footer.googleLine, { rating: settings.googleRating, n: settings.googleReviews })}</span>
          </a>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">{t.footer.explore}</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href={href("/salidas")} className="hover:text-white">{t.nav.salidas}</Link></li>
            <li><Link href={href("/destinos")} className="hover:text-white">{t.nav.destinos}</Link></li>
            <li><Link href={href("/nosotros")} className="hover:text-white">{t.footer.about2}</Link></li>
            <li><Link href={href("/contacto")} className="hover:text-white">{t.footer.offices}</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">{t.footer.contact}</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0" />{settings.address}, {settings.city}</li>
            <li><a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="flex gap-2 hover:text-white"><Phone className="mt-0.5 size-4 shrink-0" />{settings.phone}</a></li>
            <li><a href={`mailto:${settings.email}`} className="flex gap-2 hover:text-white"><Mail className="mt-0.5 size-4 shrink-0" />{settings.email}</a></li>
            <li><a href={`https://instagram.com/${settings.instagram}`} target="_blank" rel="noopener" className="flex gap-2 hover:text-white"><InstagramIcon className="mt-0.5 size-4 shrink-0" />@{settings.instagram}</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-2 py-5 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5"><ShieldCheck className="size-4" />{interpolate(t.footer.licensed, { n: settings.legajo })}</p>
          <p>© {new Date().getFullYear()} {settings.brandName}</p>
        </div>
      </div>
    </footer>
  );
}
