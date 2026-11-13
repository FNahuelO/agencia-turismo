import Link from "next/link";
import { headers } from "next/headers";
import { asLocale, localePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function NotFound() {
  const locale = asLocale((await headers()).get("x-locale"));
  const t = getDictionary(locale);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-sand px-6 text-center">
      <p className="font-display text-8xl font-extrabold text-ink/10">404</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{t.notFound.title}</h1>
      <p className="mt-2 text-ink-soft">{t.notFound.text}</p>
      <Link href={localePath(locale, "/salidas")} className="btn-primary mt-6">{t.common.seeDepartures}</Link>
    </div>
  );
}
