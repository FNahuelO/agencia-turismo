import type { Metadata } from "next";
import { WhatsAppIcon } from "@/components/site/icons";
import { ProductCard } from "@/components/site/product-card";
import { getProductCards, KIND_PATH, type DailyKind } from "@/lib/products";
import { getSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { localeAlternates, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export function productListingMetadata(kind: DailyKind, locale: Locale): Metadata {
  const p = getDictionary(locale).products;
  return { title: p.kinds[kind], description: p.intro[kind], alternates: localeAlternates(locale, KIND_PATH[kind]) };
}

/** Listado público de un tipo de producto (excursiones, traslados u hoteles). */
export async function ProductListing({ kind, locale }: { kind: DailyKind; locale: Locale }) {
  const t = getDictionary(locale);
  const [products, settings] = await Promise.all([getProductCards(kind, locale), getSettings()]);
  return (
    <div className="container-x py-12">
      <h1 className="font-display text-5xl font-bold tracking-tight">{t.products.kinds[kind]}</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">{t.products.intro[kind]}</p>
      {products.length ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, i) => <ProductCard key={product.id} product={product} locale={locale} priority={i < 3} />)}
        </div>
      ) : (
        <div className="mt-10 rounded-xl bg-sand p-8 text-ink-soft">
          <p>{t.products.empty}</p>
          <a href={whatsappLink(settings.whatsapp, t.wa.general)} target="_blank" rel="noopener" className="btn-whatsapp mt-4">
            <WhatsAppIcon className="size-4" /> {t.common.whatsappCta}
          </a>
        </div>
      )}
    </div>
  );
}
