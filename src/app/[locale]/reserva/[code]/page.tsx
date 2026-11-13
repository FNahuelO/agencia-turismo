import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, CreditCard, Landmark, Users, XCircle } from "lucide-react";
import { payBooking } from "@/app/[locale]/reservar/actions";
import { CopyButton, ReceiptForm, TrackPurchase } from "@/components/site/booking-client";
import { WhatsAppIcon } from "@/components/site/icons";
import type { BookingStatus, PaymentStatus } from "@/db/schema";
import { amountDue, getBookingForCustomer } from "@/lib/bookings";
import { getRates } from "@/lib/exchange-rates";
import { addDaysISO, formatDuration, formatLongDate, formatPrice } from "@/lib/format";
import { isMercadoPagoEnabled, syncMercadoPagoPayment } from "@/lib/mercadopago";
import { policyLines } from "@/lib/policy";
import { getSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { asLocale, INTL_LOCALE, interpolate, localePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[locale]/reserva/[code]">): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.meta.reservaTitle, robots: { index: false } };
}

const STATUS_STYLE: Record<BookingStatus, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
  pendiente: { className: "bg-sun/15", icon: Clock },
  confirmada: { className: "bg-emerald-50", icon: CheckCircle2 },
  pagada: { className: "bg-emerald-50", icon: CheckCircle2 },
  cancelada: { className: "bg-ink/5", icon: XCircle },
  vencida: { className: "bg-ink/5", icon: XCircle },
};

const PAYMENT_KEY = {
  pendiente: "statusPendiente",
  en_revision: "statusRevision",
  aprobado: "statusAprobado",
  rechazado: "statusRechazado",
  reintegrado: "statusReintegrado",
} as const satisfies Record<PaymentStatus, string>;

export default async function ReservaPage({ params, searchParams }: PageProps<"/[locale]/reserva/[code]">) {
  const [{ code, locale: rawLocale }, sp] = await Promise.all([params, searchParams]);
  const locale = asLocale(rawLocale);
  const t = getDictionary(locale);
  const r = t.reserva;
  const dateTime = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const token = typeof sp.t === "string" ? sp.t : undefined;
  let booking = await getBookingForCustomer(code, token);
  if (!booking || !token) notFound();

  const mpPaymentId = typeof sp.payment_id === "string" ? sp.payment_id : typeof sp.collection_id === "string" ? sp.collection_id : undefined;
  if (mpPaymentId && /^\d+$/.test(mpPaymentId) && isMercadoPagoEnabled()) {
    try {
      await syncMercadoPagoPayment(mpPaymentId);
      booking = (await getBookingForCustomer(code, token))!;
    } catch (e) {
      console.error("[reserva] sync Mercado Pago", e);
    }
  }

  const [settings, rates] = await Promise.all([getSettings(), getRates()]);
  const status = { ...STATUS_STYLE[booking.status], title: r[booking.status], text: r[`${booking.status}Text`] };
  const due = amountDue(booking);
  const fmt = (n: number) => formatPrice(n, booking.currency);
  const canPayOnline = isMercadoPagoEnabled() && due.balance > 0;
  const inReview = booking.payments.some((p) => p.status === "en_revision" || p.status === "pendiente");
  const hasBank = Boolean(settings.bankCbu || settings.bankAlias);
  const wa = whatsappLink(
    settings.whatsapp,
    interpolate(t.wa.booking, { code: booking.code, title: booking.package.title, date: formatLongDate(booking.departure.date, locale) }),
  );
  const mpReturned = sp.status === "approved" || sp.collection_status === "approved";

  return (
    <div className="container-x max-w-4xl pt-8 pb-20">
      {(sp.nueva === "1" || mpReturned) && booking.paidAmount > 0 && <TrackPurchase code={booking.code} value={booking.total} currency={booking.currency} />}

      <div className={`flex gap-4 rounded-xl p-6 ${status.className}`}>
        <status.icon className="mt-1 size-7 shrink-0" />
        <div>
          <p className="text-sm text-ink-soft">{r.code} <strong className="font-mono text-ink">{booking.code}</strong></p>
          <h1 className="font-display text-3xl font-bold tracking-tight">{status.title}</h1>
          <p className="mt-1 text-ink-soft">{status.text}</p>
          {sp.nueva === "1" && (
            <p className="mt-3 text-sm font-medium">{r.saveLink}</p>
          )}
        </div>
      </div>

      {sp.error === "mp" && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="size-4 shrink-0" /> {r.mpError}
        </p>
      )}
      {(sp.status === "rejected" || sp.collection_status === "rejected") && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="size-4 shrink-0" /> {r.mpRejected}
        </p>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]">
        <section className="rounded-xl bg-white p-6 ring-1 ring-ink/5">
          <p className="eyebrow">{booking.package.destination.name}</p>
          <h2 className="mt-1 font-display text-2xl font-bold">{booking.package.title}</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center gap-2 capitalize">
              <CalendarDays className="size-4 text-ink-soft" />
              {formatLongDate(booking.departure.date, locale)}
              {booking.nights > 0 && ` → ${formatLongDate(addDaysISO(booking.departure.date, booking.nights), locale)}`}
            </li>
            {booking.package.kind === "paquete" && (
              <li className="flex items-center gap-2"><Clock className="size-4 text-ink-soft" />{formatDuration(booking.package.days, booking.package.nights, t.common)}</li>
            )}
            {booking.package.kind === "hotel" && (
              <li className="flex items-center gap-2">
                <Clock className="size-4 text-ink-soft" />
                {booking.nights === 1 ? t.products.night : interpolate(t.products.nights, { n: booking.nights })} · {booking.units} {t.products.rooms.toLowerCase()}
              </li>
            )}
            {booking.package.kind === "traslado" && booking.units !== null && (
              <li className="flex items-center gap-2"><Clock className="size-4 text-ink-soft" />{booking.units === 1 ? t.products.vehicle : interpolate(t.products.vehicles, { n: booking.units })}</li>
            )}
            <li className="flex items-center gap-2">
              <Users className="size-4 text-ink-soft" />
              {booking.passengers === 1 ? r.onePax : interpolate(r.pax, { n: booking.passengers })}
              {booking.infants > 0 && interpolate(r.infants, { n: booking.infants })}
              {booking.singleRoom && r.singleRoom}
            </li>
          </ul>
          <h3 className="mt-6 text-sm font-semibold">{r.passengers}</h3>
          <ul className="mt-2 divide-y divide-ink/5 rounded-lg ring-1 ring-ink/10">
            {booking.passengerList.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{p.fullName}{p.infant && <span className="text-ink-soft">{r.infant}</span>}</span>
                <span className="text-ink-soft">{p.document}</span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="rounded-xl bg-white p-6 ring-1 ring-ink/5">
          <dl className="space-y-2 text-sm">
            <Row label={t.booking.total} value={<strong>{fmt(booking.total)}</strong>} />
            <Row label={r.paid} value={fmt(booking.paidAmount)} />
            <Row label={r.balance} value={<strong className="text-lake">{fmt(due.balance)}</strong>} />
          </dl>
          {booking.status === "pendiente" && booking.expiresAt && (
            <p className="mt-4 rounded-md bg-sun/15 p-3 text-xs">
              {interpolate(r.depositDeadline, { amount: fmt(booking.depositAmount), date: dateTime.format(booking.expiresAt) })}
            </p>
          )}
          {booking.status === "confirmada" && booking.balanceDueDate && (
            <p className="mt-4 rounded-md bg-lake-soft p-3 text-xs">{interpolate(r.balanceDeadline, { date: formatLongDate(booking.balanceDueDate, locale) })}</p>
          )}
          <a href={wa} target="_blank" rel="noopener" className="btn-whatsapp mt-5 w-full"><WhatsAppIcon className="size-4" /> {r.ask}</a>
        </aside>
      </div>

      {due.balance > 0 && (
        <section className="mt-6 rounded-xl bg-white p-6 ring-1 ring-ink/5">
          <h2 className="font-display text-2xl font-bold">{r.pay}</h2>
          {inReview && <p className="mt-2 rounded-md bg-lake-soft p-3 text-sm">{r.inReview}</p>}
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            {canPayOnline && (
              <div>
                <h3 className="flex items-center gap-2 font-semibold"><CreditCard className="size-4" />Mercado Pago</h3>
                <p className="mt-1 text-sm text-ink-soft">
                  {r.mpText}
                  {booking.currency !== "ARS" && interpolate(r.mpArs, { rate: formatPrice(Math.round(rates[booking.currency]), "ARS"), currency: booking.currency })}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {due.deposit > 0 && due.deposit < due.balance && (
                    <PayButton code={booking.code} token={token} locale={locale} kind="seña" label={interpolate(r.payDeposit, { amount: fmt(due.deposit) })} primary />
                  )}
                  <PayButton code={booking.code} token={token} locale={locale} kind={booking.paidAmount > 0 ? "saldo" : "total"} label={interpolate(booking.paidAmount > 0 ? r.payBalance : r.payTotal, { amount: fmt(due.balance) })} primary={!(due.deposit > 0 && due.deposit < due.balance)} />
                </div>
              </div>
            )}
            <div>
              <h3 className="flex items-center gap-2 font-semibold"><Landmark className="size-4" />{t.booking.transferTitle}</h3>
              {hasBank ? (
                <dl className="mt-3 space-y-1.5 rounded-lg bg-sand/70 p-4 text-sm">
                  {settings.bankName && <BankRow label={r.bank} value={settings.bankName} />}
                  {settings.bankHolder && <BankRow label={r.holder} value={settings.bankHolder} />}
                  {settings.bankCuit && <BankRow label="CUIT" value={settings.bankCuit} copy />}
                  {settings.bankCbu && <BankRow label="CBU/CVU" value={settings.bankCbu} copy />}
                  {settings.bankAlias && <BankRow label="Alias" value={settings.bankAlias} copy />}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-ink-soft">{r.askBank}</p>
              )}
              <div className="mt-4">
                <ReceiptForm code={booking.code} token={token} suggestedAmount={due.deposit > 0 ? due.deposit : due.balance} currency={booking.currency} />
              </div>
            </div>
          </div>
        </section>
      )}

      {booking.payments.length > 0 && (
        <section className="mt-6 rounded-xl bg-white p-6 ring-1 ring-ink/5">
          <h2 className="font-display text-xl font-bold">{r.payments}</h2>
          <ul className="mt-3 divide-y divide-ink/5 text-sm">
            {booking.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2.5">
                <span>
                  <span className="capitalize">{p.method === "mercadopago" ? "Mercado Pago" : p.method === "transferencia" ? t.booking.transferTitle : p.method}</span>
                  <span className="text-ink-soft"> · {dateTime.format(p.createdAt)}</span>
                </span>
                <span>{fmt(p.amount)} <span className="text-xs text-ink-soft">({r[PAYMENT_KEY[p.status]]})</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {booking.package.policy && (
        <details className="mt-6 rounded-xl bg-white p-6 ring-1 ring-ink/5">
          <summary className="cursor-pointer font-display text-xl font-bold">{t.paquete.conditions}</summary>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-soft">
            {policyLines(booking.package.policy, t.policy).map((l) => <li key={l}>{l}</li>)}
          </ul>
        </details>
      )}

      <p className="mt-8 text-center text-sm text-ink-soft">
        <Link href={localePath(locale, `/paquetes/${booking.package.slug}`)} className="underline">{r.seePackage}</Link>
      </p>
    </div>
  );
}

function PayButton({ code, token, kind, label, locale, primary }: { code: string; token: string; kind: string; label: string; locale: string; primary?: boolean }) {
  return (
    <form action={payBooking}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className={`${primary ? "btn-primary" : "btn-ghost"} w-full`}>{label}</button>
    </form>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function BankRow({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="flex items-center gap-1 font-medium">
        <span className="font-mono text-xs sm:text-sm">{value}</span>
        {copy && <CopyButton value={value} label={label} />}
      </dd>
    </div>
  );
}
