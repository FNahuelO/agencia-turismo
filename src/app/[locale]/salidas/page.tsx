import type { Metadata } from "next";
import { DeparturesExplorer } from "@/components/site/departures-explorer";
import { REGIONS } from "@/db/schema";
import { getUpcomingDepartures } from "@/lib/queries";
import { asLocale, localeAlternates } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[locale]/salidas">): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  return { title: t.meta.salidasTitle, description: t.meta.salidasDescription, alternates: localeAlternates(locale, "/salidas") };
}

export default async function SalidasPage({ params }: PageProps<"/[locale]/salidas">) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const departures = await getUpcomingDepartures(locale);
  const regions = REGIONS.filter((r) => departures.some((d) => d.region === r));
  return (
    <div className="container-x py-12">
      <p className="eyebrow">{t.salidas.eyebrow}</p>
      <h1 className="mt-2 font-display text-5xl font-bold tracking-tight">{t.salidas.title}</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">{t.salidas.intro}</p>
      <div className="mt-8">
        <DeparturesExplorer departures={departures} regions={regions} />
      </div>
    </div>
  );
}
