import Image from "next/image";
import { Price } from "@/components/site/currency";
import Link from "next/link";
import { Bus, CalendarDays, Plane } from "lucide-react";
import type { PackageCard as PackageCardData } from "@/lib/queries";
import { formatDuration, formatShortDate } from "@/lib/format";
import { interpolate, localePath, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export function ImageFallback({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 flex items-end bg-gradient-to-br from-lake to-ink p-6">
      <span className="font-display text-3xl leading-tight font-bold text-white/90">{name}</span>
    </div>
  );
}

export function PackageCard({ pkg, locale, priority = false }: { pkg: PackageCardData; locale: Locale; priority?: boolean }) {
  const t = getDictionary(locale);
  const TransportIcon = pkg.transport === "aereo" ? Plane : Bus;
  return (
    <Link
      href={localePath(locale, `/paquetes/${pkg.slug}`)}
      className="group flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-ink/10 transition-shadow duration-150 hover:shadow-md hover:ring-ink/20"
    >
      <div className="relative aspect-square overflow-hidden bg-sand-dark">
        {pkg.image ? (
          <Image
            src={pkg.image}
            alt={interpolate(t.paquete.imageAlt, { name: pkg.destinationName })}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-opacity duration-200 group-hover:opacity-90"
          />
        ) : (
          <ImageFallback name={pkg.destinationName} />
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-ink">
          <TransportIcon className="size-3.5" />
          {pkg.transport === "aereo" ? t.common.plane : t.common.bus}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-medium text-ink-soft">{pkg.region}</p>
        <h3 className="mt-1 font-display text-xl font-bold">{pkg.title}</h3>
        <p className="mt-1 text-sm text-ink-soft">
          {formatDuration(pkg.days, pkg.nights, t.common)}
          {pkg.board ? ` · ${pkg.board}` : ""}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <p className="text-xs text-ink-soft">{t.common.from}</p>
            <p className="font-display text-2xl font-bold text-lake"><Price amount={pkg.price} currency={pkg.currency} /></p>
          </div>
          {pkg.nextDeparture && (
            <p className="flex items-center gap-1 rounded-full bg-lake-soft px-3 py-1 text-xs font-medium text-lake">
              <CalendarDays className="size-3.5" />
              {formatShortDate(pkg.nextDeparture, locale)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
