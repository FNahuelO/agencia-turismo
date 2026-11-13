import type { Metadata } from "next";
import { ProductListing, productListingMetadata } from "@/components/site/product-listing";
import { asLocale } from "@/lib/i18n/config";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[locale]/traslados">): Promise<Metadata> {
  return productListingMetadata("traslado", asLocale((await params).locale));
}

export default async function TrasladosPage({ params }: PageProps<"/[locale]/traslados">) {
  return <ProductListing kind="traslado" locale={asLocale((await params).locale)} />;
}
