"use client";

import { Price } from "@/components/site/currency";
import Image from "next/image";
import Link from "next/link";
import { Bus, Plane, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { availabilityLabel, formatDuration, formatMonthYear, formatShortDate } from "@/lib/format";
import { interpolate } from "@/lib/i18n/config";
import type { UpcomingDeparture } from "@/lib/queries";
import { useI18n } from "./i18n";

const toneClass = {
  ok: "bg-emerald-50 text-emerald-700",
  hot: "bg-sun/15 text-sun-dark",
  muted: "bg-ink/5 text-ink-soft",
};

export function DeparturesExplorer({ departures, regions }: { departures: UpcomingDeparture[]; regions: string[] }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [transport, setTransport] = useState("");
  const [month, setMonth] = useState("");
  const deferredQuery = useDeferredValue(query);
  const { locale, t, href } = useI18n();

  const months = useMemo(() => [...new Set(departures.map((d) => d.date.slice(0, 7)))], [departures]);

  const filtered = useMemo(() => {
    const q = deferredQuery
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return departures.filter((d) => {
      if (region && d.region !== region) return false;
      if (transport && d.transport !== transport) return false;
      if (month && !d.date.startsWith(month)) return false;
      if (q) {
        const haystack = `${d.packageTitle} ${d.destinationName}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [departures, deferredQuery, region, transport, month]);

  const grouped = useMemo(() => {
    const map = new Map<string, UpcomingDeparture[]>();
    for (const d of filtered) {
      const key = d.date.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div>
      <div className="sticky top-16 z-30 -mx-5 border-b border-ink/10 bg-sand px-5 py-4 sm:mx-0 sm:rounded-lg sm:border sm:bg-white sm:px-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-3 [&_select]:px-2.5 [&_select]:text-xs sm:[&_select]:px-4 sm:[&_select]:text-sm">
          <label className="relative col-span-3 sm:col-span-1">
            <span className="sr-only">{t.salidas.searchLabel}</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-soft" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.salidas.search} className="field pl-10" />
          </label>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="field" aria-label={t.salidas.region}>
            <option value="">{t.salidas.region}</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={transport} onChange={(e) => setTransport(e.target.value)} className="field" aria-label={t.salidas.transport}>
            <option value="">{t.salidas.busAndPlane}</option>
            <option value="bus">{t.salidas.busOnly}</option>
            <option value="aereo">{t.salidas.planeOnly}</option>
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="field" aria-label={t.salidas.month}>
            <option value="">{t.salidas.month}</option>
            {months.map((m) => <option key={m} value={m}>{formatMonthYear(`${m}-01`, locale)}</option>)}
          </select>
        </div>
      </div>

      <p className="mt-6 text-sm text-ink-soft">{interpolate(t.salidas.found, { n: filtered.length })}</p>

      {grouped.length === 0 && (
        <div className="mt-6 rounded-xl bg-white p-10 text-center text-ink-soft">
          {t.salidas.empty}
        </div>
      )}

      <div className="mt-4 space-y-10">
        {grouped.map(([key, items]) => (
          <section key={key}>
            <h2 className="font-display text-2xl font-bold">{formatMonthYear(`${key}-01`, locale)}</h2>
            <ul className="mt-4 divide-y divide-ink/5 overflow-hidden rounded-xl bg-white ring-1 ring-ink/5">
              {items.map((d) => {
                const availability = availabilityLabel(d, t.common);
                const Icon = d.transport === "aereo" ? Plane : Bus;
                return (
                  <li key={d.id}>
                    <Link href={href(`/paquetes/${d.packageSlug}?salida=${d.id}`)} className="flex items-center gap-4 p-4 transition-colors hover:bg-sand/60 sm:p-5">
                      <div className="w-16 shrink-0 text-center">
                        <p className="text-xs font-medium text-ink-soft uppercase">{formatShortDate(d.date, locale).split(" ")[0]}</p>
                        <p className="font-display text-3xl leading-none font-bold">{d.date.slice(8, 10)}</p>
                      </div>
                      {d.image && (
                        <Image src={d.image} alt="" width={64} height={64} className="hidden size-16 shrink-0 rounded-lg object-cover sm:block" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{d.packageTitle}</p>
                        <p className="flex items-center gap-1.5 text-sm text-ink-soft">
                          <Icon className="size-3.5 shrink-0" />
                          <span className="truncate">{formatDuration(d.days, d.nights, t.common)}{d.board ? ` · ${d.board}` : ""}</span>
                        </p>
                        <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium sm:hidden ${toneClass[availability.tone]}`}>{availability.label}</span>
                      </div>
                      <span className={`hidden rounded-full px-3 py-1 text-xs font-medium sm:inline-block ${toneClass[availability.tone]}`}>{availability.label}</span>
                      <p className="shrink-0 text-right font-display text-lg font-bold text-lake sm:text-xl"><Price amount={d.price} currency={d.currency} /></p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
