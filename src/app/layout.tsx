import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

const bricolage = localFont({
  src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  display: "swap",
  weight: "200 800",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Agencia de Turismo · Viajes por Argentina en bus y aéreos",
    template: "%s · Agencia de Turismo",
  },
  description:
    "Agencia de viajes con paquetes por Argentina en bus y aéreos, coordinación en cada salida y precios claros.",
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Agencia de Turismo",
    images: ["/media/hero.webp"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1c38",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${inter.variable} ${bricolage.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
