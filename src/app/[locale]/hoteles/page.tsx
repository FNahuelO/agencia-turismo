import type { Metadata } from "next";
import { ProductListing, productListingMetadata } from "@/components/site/product-listing";
import { asLocale } from "@/lib/i18n/config";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[locale]/hoteles">): Promise<Metadata> {
  return productListingMetadata("hotel", asLocale((await params).locale));
}

export default async function HotelesPage({ params }: PageProps<"/[locale]/hoteles">) {
  return <ProductListing kind="hotel" locale={asLocale((await params).locale)} />;
}
