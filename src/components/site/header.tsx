import Image from "next/image";
import Link from "next/link";
import { Menu, Phone } from "lucide-react";
import type { ProductKind } from "@/db/schema";
import { DAILY_KINDS, KIND_PATH } from "@/lib/products";
import type { SiteSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { localePath, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { CurrencySwitcher } from "./currency";
import { WhatsAppIcon } from "./icons";
import { LanguageSwitcher } from "./language-switcher";

export function Header({ settings, locale, productKinds = [] }: { settings: SiteSettings; locale: Locale; productKinds?: ProductKind[] }) {
  const t = getDictionary(locale);
  const NAV = [
    { href: localePath(locale, "/salidas"), label: t.nav.salidas },
    ...DAILY_KINDS.filter((k) => productKinds.includes(k)).map((k) => ({ href: localePath(locale, KIND_PATH[k]), label: t.products.kinds[k] })),
    { href: localePath(locale, "/destinos"), label: t.nav.destinos },
    { href: localePath(locale, "/nosotros"), label: t.nav.nosotros },
    { href: localePath(locale, "/contacto"), label: t.nav.contacto },
  ];
  const wa = whatsappLink(settings.whatsapp, t.wa.general);
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Link href={localePath(locale, "/")} className="shrink-0" aria-label={`TravelAr Turismo, ${t.nav.home}`}>
          <Image src="/logo.webp" alt="TravelAr Turismo" width={139} height={48} priority className="h-10 w-auto" />
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-5 md:flex xl:gap-7">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm font-medium text-ink-soft transition-colors hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher className="hidden lg:block" />
          <CurrencySwitcher className="hidden lg:block" />
          <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
            <Phone className="size-4" />
            {settings.phone}
          </a>
          <a href={wa} target="_blank" rel="noopener" className="btn-whatsapp py-2.5" data-event="whatsapp_click" data-location="header">
            <WhatsAppIcon className="size-4" />
            {t.nav.consultar}
          </a>
        </div>

        <details className="group relative md:hidden">
          <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-ink/10 [&::-webkit-details-marker]:hidden" aria-label={t.nav.menu}>
            <Menu className="size-5" />
          </summary>
          <div className="absolute right-0 mt-2 w-64 rounded-lg border border-ink/10 bg-white p-2 shadow-xl">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="block rounded-md px-4 py-3 text-sm font-medium hover:bg-sand">
                {item.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <LanguageSwitcher className="w-full" />
              <CurrencySwitcher className="w-full" />
            </div>
            <a href={wa} target="_blank" rel="noopener" className="btn-whatsapp mt-2 w-full" data-event="whatsapp_click" data-location="menu">
              <WhatsAppIcon className="size-4" />
              {t.nav.whatsapp}
            </a>
          </div>
        </details>
      </div>
    </header>
  );
}
