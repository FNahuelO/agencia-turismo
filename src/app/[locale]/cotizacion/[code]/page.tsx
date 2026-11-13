import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CalendarDays, CheckCircle2, Clock, FileDown, Users, XCircle } from "lucide-react";
import { respondQuote } from "@/app/[locale]/cotizacion/actions";
import { WhatsAppIcon } from "@/components/site/icons";
import { db, schema } from "@/db";
import { bookingUrl } from "@/lib/bookings";
import { formatLongDate, formatPrice, formatShortDate, todayISO, toISODate } from "@/lib/format";
import { asLocale, interpolate } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { quoteDisplayStatus, quoteTotals } from "@/lib/quote-calc";
import { getQuoteForCustomer, quotePdfUrl } from "@/lib/quotes";
import { getSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";

export async function generateMetadata({ params }: PageProps<"/[locale]/cotizacion/[code]">): Promise<Metadata> {
  const { locale, code } = await params;
  const t = getDictionary(asLocale(locale));
  return { title: `${t.quote.title} ${code.toUpperCase()}`, robots: { index: false } };
}

export default async function CotizacionPublicPage({ params, searchParams }: PageProps<"/[locale]/cotizacion/[code]">) {
  const [{ code, locale: rawLocale }, sp] = await Promise.all([params, searchParams]);
  const locale = asLocale(rawLocale);
  const t = getDictionary(locale);
  const q = t.quote;
  const token = typeof sp.t === "string" ? sp.t : undefined;
  const quote = await getQuoteForCustomer(code, token);
  if (!quote || !token) notFound();

  if (!quote.viewedAt && sp.preview !== "1") {
    await db.update(schema.quotes).set({ viewedAt: new Date() }).where(eq(schema.quotes.id, quote.id));
  }

  const [settings, booking] = await Promise.all([
    getSettings(),
    quote.bookingId ? db.query.bookings.findFirst({ where: eq(schema.bookings.id, quote.bookingId), columns: { code: true, accessToken: true, locale: true } }) : undefined,
  ]);
  const status = quoteDisplayStatus(quote, todayISO());
  const open = status === "borrador" || status === "enviada";
  const totals = quoteTotals(quote.items, quote.passengers);
  const fmt = (n: number) => formatPrice(n, quote.currency);
  const wa = whatsappLink(settings.whatsapp, interpolate(q.waText, { code: quote.code, title: quote.title }));

  return (
    <div className="container-x max-w-4xl pt-8 pb-20">
      <p className="eyebrow">{q.title} <span className="font-mono">{quote.code}</span></p>
      <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">{quote.title}</h1>
      <p className="mt-3 text-lg text-ink-soft">{interpolate(q.greeting, { name: quote.clientName.split(" ")[0] })}</p>
      <p className="mt-2 text-sm text-ink-soft">
        {interpolate(q.issued, { date: formatLongDate(toISODate(quote.createdAt), locale) })} ·{" "}
        {interpolate(q.validUntil, { date: formatLongDate(quote.validUntil, locale) })}
      </p>

      {status === "vencida" && (
        <Banner tone="sun" icon={Clock}>{interpolate(q.expired, { date: formatLongDate(quote.validUntil, locale) })}</Banner>
      )}
      {status === "aceptada" && <Banner tone="green" icon={CheckCircle2}>{q.accepted}</Banner>}
      {status === "rechazada" && <Banner tone="muted" icon={XCircle}>{q.rejected}</Banner>}
      {status === "convertida" && (
        <Banner tone="green" icon={CheckCircle2}>
          {interpolate(q.converted, { code: booking?.code ?? "" })}{" "}
          {booking && <Link href={bookingUrl(booking)} className="font-semibold underline">{q.seeBooking}</Link>}
        </Banner>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {quote.travelDate && <Fact icon={CalendarDays} label={q.travelDate} value={formatLongDate(quote.travelDate, locale)} />}
        <Fact icon={Users} label={q.passengers} value={String(quote.passengers)} />
        <Fact icon={CheckCircle2} label={q.perPax} value={fmt(totals.perPassenger)} />
      </div>

      <section className="mt-8 rounded-xl bg-white p-6 ring-1 ring-ink/5 sm:p-8">
        <h2 className="font-display text-2xl font-bold">{q.services}</h2>
        <ul className="mt-4 divide-y divide-ink/5">
          {quote.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-wide text-lake uppercase">{q.kinds[item.kind]}</p>
                <p className="font-semibold">{item.description}</p>
                <p className="text-sm text-ink-soft">
                  {[item.dateFrom, item.dateTo].filter((d): d is string => Boolean(d)).map((d) => formatShortDate(d, locale)).join(" – ")}
                  {item.detail && `${item.dateFrom ? " · " : ""}${item.detail}`}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-bold">{fmt(item.unitPrice * item.quantity)}</p>
                {item.quantity > 1 && <p className="text-xs text-ink-soft">{item.quantity} × {fmt(item.unitPrice)}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-baseline justify-between border-t border-ink pt-4">
          <span className="font-semibold">{q.total}</span>
          <span className="font-display text-3xl font-bold text-lake">{fmt(totals.total)}</span>
        </div>
        <p className="mt-3 text-xs text-ink-soft">{interpolate(q.pricesNote, { currency: quote.currency })}</p>
      </section>

      {quote.notes && (
        <section className="mt-6 rounded-xl bg-sand p-6">
          <h2 className="font-semibold">{q.notes}</h2>
          <p className="mt-2 whitespace-pre-line text-ink-soft">{quote.notes}</p>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {open && (
          <form action={respondQuote} className="flex flex-wrap gap-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="code" value={quote.code} />
            <input type="hidden" name="t" value={token} />
            <button name="response" value="accept" className="btn-primary px-6">{q.accept}</button>
            <button name="response" value="reject" className="btn-ghost">{q.reject}</button>
          </form>
        )}
        <a href={quotePdfUrl(quote)} target="_blank" rel="noopener" className="btn-ghost"><FileDown className="size-4" /> {q.downloadPdf}</a>
        <a href={wa} target="_blank" rel="noopener" className="btn-whatsapp" data-event="whatsapp_click" data-location="quote"><WhatsAppIcon className="size-4" /> {q.ask}</a>
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-ink/5">
      <p className="flex items-center gap-1.5 text-xs text-ink-soft"><Icon className="size-3.5" />{label}</p>
      <p className="mt-1 font-semibold capitalize">{value}</p>
    </div>
  );
}

function Banner({ tone, icon: Icon, children }: { tone: "green" | "sun" | "muted"; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  const cls = { green: "bg-emerald-50 text-emerald-800", sun: "bg-sun/15", muted: "bg-ink/5 text-ink-soft" }[tone];
  return (
    <p className={`mt-6 flex items-center gap-2 rounded-lg p-4 text-sm ${cls}`}>
      <Icon className="size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
