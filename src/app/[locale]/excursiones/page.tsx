import type { Metadata } from "next";
import { ProductListing, productListingMetadata } from "@/components/site/product-listing";
import { asLocale } from "@/lib/i18n/config";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[locale]/excursiones">): Promise<Metadata> {
  return productListingMetadata("actividad", asLocale((await params).locale));
}

export default async function ExcursionesPage({ params }: PageProps<"/[locale]/excursiones">) {
  return <ProductListing kind="actividad" locale={asLocale((await params).locale)} />;
}
