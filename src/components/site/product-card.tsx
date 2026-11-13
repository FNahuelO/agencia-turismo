import Image from "next/image";
import Link from "next/link";
import { BedDouble, Car, Compass } from "lucide-react";
import { Price } from "@/components/site/currency";
import { ImageFallback } from "@/components/site/package-card";
import type { DailyKind, ProductCard as ProductCardData } from "@/lib/products";
import { interpolate, localePath, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const KIND_ICON: Record<DailyKind, React.ComponentType<{ className?: string }>> = { actividad: Compass, traslado: Car, hotel: BedDouble };

export function ProductCard({ product, locale, priority = false }: { product: ProductCardData; locale: Locale; priority?: boolean }) {
  const t = getDictionary(locale);
  const p = t.products;
  const kind = product.kind as DailyKind;
  const Icon = KIND_ICON[kind];
  return (
    <Link
      href={localePath(locale, `/productos/${product.slug}`)}
      className="group flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-ink/10 transition-shadow duration-150 hover:shadow-md hover:ring-ink/20"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-sand-dark">
        {product.image ? (
          <Image
            src={product.image}
            alt={interpolate(t.paquete.imageAlt, { name: product.title })}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-opacity duration-200 group-hover:opacity-90"
          />
        ) : (
          <ImageFallback name={product.title} />
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-ink">
          <Icon className="size-3.5" />
          {p.singular[kind]}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-medium text-ink-soft">{product.destinationName}</p>
        <h3 className="mt-1 font-display text-xl font-bold">{product.title}</h3>
        {product.summary && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{product.summary}</p>}
        <div className="mt-auto pt-5">
          <p className="text-xs text-ink-soft">{t.common.from}</p>
          <p className="font-display text-2xl font-bold text-lake">
            <Price amount={product.price} currency={product.currency} /> <span className="text-sm font-medium text-ink-soft">{p.unit[kind]}</span>
          </p>
        </div>
      </div>
    </Link>
  );
}
