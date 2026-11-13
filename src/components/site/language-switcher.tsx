"use client";

import { usePathname, useRouter } from "next/navigation";
import { LOCALES, LOCALE_LABELS, localePath, stripLocale, type Locale } from "@/lib/i18n/config";
import { FlagSelect } from "./flag-select";
import { Flag, type FlagCode } from "./flags";
import { useI18n } from "./i18n";

const LOCALE_FLAG: Record<Locale, FlagCode> = { es: "ar", en: "us", pt: "br" };

const OPTIONS = LOCALES.map((l) => ({
  value: l,
  short: l.toUpperCase(),
  label: LOCALE_LABELS[l],
  icon: <Flag code={LOCALE_FLAG[l]} />,
}));

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <FlagSelect
      value={locale}
      options={OPTIONS}
      ariaLabel={t.nav.language}
      className={className}
      align="left"
      onChange={(next) => {
        const { path } = stripLocale(pathname);
        router.push(localePath(next, path) + window.location.search);
      }}
    />
  );
}
