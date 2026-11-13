"use client";

import Link from "next/link";
import { useI18n } from "@/components/site/i18n";

export default function LocaleNotFound() {
  const { t, href } = useI18n();
  return (
    <div className="container-x flex flex-col items-center py-24 text-center">
      <p className="font-display text-8xl font-bold text-ink/10">404</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{t.notFound.title}</h1>
      <p className="mt-2 text-ink-soft">{t.notFound.text}</p>
      <Link href={href("/salidas")} className="btn-primary mt-6">{t.common.seeDepartures}</Link>
    </div>
  );
}
