import { and, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { EmailKind, EmailStatus } from "@/db/schema";
import { amountDue, bookingUrl } from "./bookings";
import { emailDictionary } from "./email/i18n";
import { deliver } from "./email/send";
import { renderEmail, type EmailContent } from "./email/template";
import { addDaysISO, formatLongDate, formatPrice, todayISO } from "./format";
import { asLocale, INTL_LOCALE, interpolate, type Locale } from "./i18n/config";
import { localizePackage } from "./i18n/content";
import { quoteTotals } from "./quote-calc";
import { quotePdfUrl, quoteUrl } from "./quotes";
import { getSettings, type SiteSettings } from "./settings";

/** Horas antes del vencimiento de la seña en que se manda el recordatorio. */
export const DEPOSIT_REMINDER_HOURS = 12;
/** Días antes del vencimiento del saldo en que se manda el recordatorio. */
export const BALANCE_REMINDER_DAYS = 3;

export function siteUrl(path: string) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${origin}${path}`;
}

function formatDeadline(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: locale === "en" ? "h12" : "h23",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

async function loadBooking(id: number) {
  return db.query.bookings.findFirst({ where: eq(schema.bookings.id, id), with: { package: true, departure: true } });
}
type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

function adminTarget(settings: SiteSettings) {
  return settings.emailAdminAlerts === "1" ? settings.notifyEmail || settings.email : "";
}

/** Bloques comunes de un email de reserva en el idioma del pasajero. */
function bookingEmail(
  b: LoadedBooking,
  settings: SiteSettings,
  opts: { kind: EmailKind; subject: string; title: string; paragraphs: string[]; bank?: boolean; dedupeKey: string },
) {
  const locale = asLocale(b.locale);
  const t = emailDictionary(locale);
  const pkg = localizePackage(b.package, locale);
  const fmt = (n: number) => formatPrice(n, b.currency);
  const rows: [string, string][] = [
    [t.rows.code, b.code],
    [t.rows.trip, pkg.title],
    [t.rows.date, formatLongDate(b.departure.date, locale)],
  ];
  if (b.nights > 0) rows.push([t.rows.stay, interpolate(t.nights, { n: b.nights })]);
  rows.push([t.rows.passengers, String(b.passengers + b.infants)], [t.rows.total, fmt(b.total)]);
  if (b.paidAmount > 0) rows.push([t.rows.paid, fmt(b.paidAmount)]);
  const due = amountDue(b);
  if (due.balance > 0 && b.paidAmount > 0) rows.push([t.rows.balance, fmt(due.balance)]);
  if (due.balance > 0 && b.balanceDueDate && b.paidAmount >= b.depositAmount) rows.push([t.rows.balanceDue, formatLongDate(b.balanceDueDate, locale)]);

  const bankRows = (
    [
      [t.bank.bank, settings.bankName],
      [t.bank.holder, settings.bankHolder],
      [t.bank.cuit, settings.bankCuit],
      [t.bank.cbu, settings.bankCbu],
      [t.bank.alias, settings.bankAlias],
    ] as [string, string][]
  ).filter(([, v]) => v);

  const content: EmailContent = {
    brand: settings.brandName,
    preheader: opts.paragraphs[0],
    title: opts.title,
    paragraphs: [interpolate(t.greeting, { name: b.contactName.split(" ")[0] }), ...opts.paragraphs],
    rows,
    box: opts.bank && bankRows.length ? { title: t.bank.title, rows: [...bankRows] } : undefined,
    buttons: [{ label: t.viewBooking, url: siteUrl(bookingUrl(b)) }],
    footer: interpolate(t.footer, { brand: settings.brandName, phone: settings.phone }),
  };
  if (content.box) content.paragraphs.push(t.bank.hint);
  return { kind: opts.kind, to: b.contactEmail, subject: opts.subject, ...renderEmail(content), replyTo: settings.email, bookingId: b.id, dedupeKey: opts.dedupeKey };
}

/** Aviso interno (en español) con link al admin. */
function adminEmail(
  settings: SiteSettings,
  opts: { kind: EmailKind; subject: string; title: string; paragraphs: string[]; rows?: [string, string][]; adminPath: string; bookingId?: number; dedupeKey: string },
) {
  return {
    kind: opts.kind,
    to: adminTarget(settings),
    subject: opts.subject,
    ...renderEmail({
      brand: `${settings.brandName} · admin`,
      title: opts.title,
      paragraphs: opts.paragraphs,
      rows: opts.rows,
      buttons: [{ label: "Abrir en el admin", url: siteUrl(opts.adminPath) }],
      footer: "Aviso automático. Se desactiva en Configuración → Emails.",
    }),
    bookingId: opts.bookingId,
    dedupeKey: opts.dedupeKey,
  };
}

/** Ejecuta un envío sin que un error corte la acción que lo disparó. */
async function safely(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error(`[notificaciones] ${label}`, e);
  }
}

export async function notifyBookingCreated(bookingId: number) {
  await safely("reserva creada", async () => {
    const [b, settings] = await Promise.all([loadBooking(bookingId), getSettings()]);
    if (!b) return;
    const locale = asLocale(b.locale);
    const t = emailDictionary(locale);
    const title = localizePackage(b.package, locale).title;
    const due = amountDue(b);
    if (settings.emailCustomers === "1") {
      const intro =
        b.expiresAt && due.deposit > 0
          ? interpolate(t.created.deposit, { deposit: formatPrice(due.deposit, b.currency), deadline: formatDeadline(b.expiresAt, locale) })
          : t.created.noDeadline;
      await deliver(
        bookingEmail(b, settings, {
          kind: "reserva_creada",
          subject: interpolate(t.created.subject, { code: b.code, title }),
          title: t.created.title,
          paragraphs: [intro],
          bank: b.paymentMethod === "transferencia" && due.balance > 0,
          dedupeKey: `reserva_creada:${b.id}`,
        }),
      );
    }
    if (adminTarget(settings)) {
      await deliver(
        adminEmail(settings, {
          kind: "aviso_reserva",
          subject: `Nueva reserva ${b.code} · ${b.package.title}`,
          title: `Nueva reserva ${b.code}`,
          paragraphs: [`${b.contactName} reservó ${b.package.title} (origen: ${b.source}).`],
          rows: [
            ["Fecha", formatLongDate(b.departure.date)],
            ["Pasajeros", String(b.passengers + b.infants)],
            ["Total", formatPrice(b.total, b.currency)],
            ["Medio elegido", b.paymentMethod],
            ["Contacto", [b.contactPhone, b.contactEmail].filter(Boolean).join(" · ")],
          ],
          adminPath: `/admin/reservas/${b.id}`,
          bookingId: b.id,
          dedupeKey: `aviso_reserva:${b.id}`,
        }),
      );
    }
  });
}

/** Pago aprobado: email al pasajero y, si vino de Mercado Pago, aviso interno. */
export async function notifyPaymentApproved(paymentId: number) {
  await safely("pago aprobado", async () => {
    const payment = await db.query.payments.findFirst({ where: eq(schema.payments.id, paymentId) });
    if (!payment || payment.status !== "aprobado") return;
    const [b, settings] = await Promise.all([loadBooking(payment.bookingId), getSettings()]);
    if (!b) return;
    const locale = asLocale(b.locale);
    const t = emailDictionary(locale);
    const fmt = (n: number) => formatPrice(n, b.currency);
    const due = amountDue(b);

    if (settings.emailCustomers === "1") {
      const status =
        b.status === "pagada"
          ? t.payment.paid
          : b.status === "confirmada"
            ? b.balanceDueDate
              ? interpolate(t.payment.confirmedDue, { balance: fmt(due.balance), date: formatLongDate(b.balanceDueDate, locale) })
              : interpolate(t.payment.confirmed, { balance: fmt(due.balance) })
            : interpolate(t.payment.pending, { deposit: fmt(due.deposit) });
      await deliver(
        bookingEmail(b, settings, {
          kind: "pago_recibido",
          subject: interpolate(t.payment.subject, { code: b.code }),
          title: t.payment.title,
          paragraphs: [interpolate(t.payment.intro, { amount: fmt(payment.amount), code: b.code }), status],
          dedupeKey: `pago:${payment.id}`,
        }),
      );
    }
    if (payment.method === "mercadopago" && adminTarget(settings)) {
      await deliver(
        adminEmail(settings, {
          kind: "aviso_pago",
          subject: `Pago aprobado por Mercado Pago · ${b.code}`,
          title: `Pago aprobado en ${b.code}`,
          paragraphs: [`Mercado Pago acreditó ${formatPrice(payment.chargedAmount ?? payment.amount, payment.chargedCurrency ?? payment.currency)}. La reserva quedó ${b.status}.`],
          adminPath: `/admin/reservas/${b.id}`,
          bookingId: b.id,
          dedupeKey: `aviso_pago:${payment.id}`,
        }),
      );
    }
  });
}

export async function notifyReceiptUploaded(paymentId: number) {
  await safely("comprobante", async () => {
    const payment = await db.query.payments.findFirst({ where: eq(schema.payments.id, paymentId) });
    if (!payment) return;
    const [b, settings] = await Promise.all([loadBooking(payment.bookingId), getSettings()]);
    if (!b || !adminTarget(settings)) return;
    await deliver(
      adminEmail(settings, {
        kind: "aviso_comprobante",
        subject: `Comprobante para revisar · ${b.code}`,
        title: "Llegó un comprobante de transferencia",
        paragraphs: [`${b.contactName} subió un comprobante por ${formatPrice(payment.chargedAmount ?? payment.amount, payment.chargedCurrency ?? payment.currency)} en la reserva ${b.code}. Revisalo y aprobalo desde el admin.`],
        adminPath: `/admin/reservas/${b.id}`,
        bookingId: b.id,
        dedupeKey: `aviso_comprobante:${payment.id}`,
      }),
    );
  });
}

export async function notifyBookingClosed(bookingId: number, kind: "reserva_vencida" | "reserva_cancelada") {
  await safely(kind, async () => {
    const [b, settings] = await Promise.all([loadBooking(bookingId), getSettings()]);
    if (!b || settings.emailCustomers !== "1") return;
    const t = emailDictionary(asLocale(b.locale));
    const texts = kind === "reserva_vencida" ? t.expired : t.cancelled;
    await deliver(
      bookingEmail(b, settings, {
        kind,
        subject: interpolate(texts.subject, { code: b.code }),
        title: texts.title,
        paragraphs: [interpolate(texts.intro, { code: b.code })],
        dedupeKey: `${kind}:${b.id}`,
      }),
    );
  });
}

/**
 * Recordatorios del cron: seña por vencer (reservas pendientes sin pagos) y saldo por vencer.
 * Cada uno se manda una sola vez por reserva (y por fecha de saldo).
 */
export async function sendBookingReminders(now = new Date()) {
  const settings = await getSettings();
  if (settings.emailCustomers !== "1") return { deposit: 0, balance: 0 };
  const { bookings } = schema;
  const soon = new Date(now.getTime() + DEPOSIT_REMINDER_HOURS * 3600_000);
  const createdBefore = new Date(now.getTime() - 3 * 3600_000);
  const today = todayISO();

  const [pending, balance] = await Promise.all([
    db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.status, "pendiente"), gt(bookings.expiresAt, now), lte(bookings.expiresAt, soon), lt(bookings.createdAt, createdBefore))),
    db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(inArray(bookings.status, ["confirmada"]), gte(bookings.balanceDueDate, today), lte(bookings.balanceDueDate, addDaysISO(today, BALANCE_REMINDER_DAYS)))),
  ]);

  const sent = { deposit: 0, balance: 0 };
  for (const { id } of pending) {
    const b = await loadBooking(id);
    if (!b?.expiresAt) continue;
    const locale = asLocale(b.locale);
    const t = emailDictionary(locale);
    const due = amountDue(b);
    if (due.deposit <= 0) continue;
    const status = await deliver(
      bookingEmail(b, settings, {
        kind: "recordatorio_sena",
        subject: interpolate(t.reminderDeposit.subject, { code: b.code }),
        title: t.reminderDeposit.title,
        paragraphs: [interpolate(t.reminderDeposit.intro, { deposit: formatPrice(due.deposit, b.currency), deadline: formatDeadline(b.expiresAt, locale) })],
        bank: b.paymentMethod === "transferencia",
        dedupeKey: `recordatorio_sena:${b.id}`,
      }),
    );
    if (status === "enviado") sent.deposit++;
  }
  for (const { id } of balance) {
    const b = await loadBooking(id);
    if (!b?.balanceDueDate) continue;
    const locale = asLocale(b.locale);
    const t = emailDictionary(locale);
    const due = amountDue(b);
    if (due.balance <= 0) continue;
    const status = await deliver(
      bookingEmail(b, settings, {
        kind: "recordatorio_saldo",
        subject: interpolate(t.reminderBalance.subject, { code: b.code }),
        title: t.reminderBalance.title,
        paragraphs: [interpolate(t.reminderBalance.intro, { balance: formatPrice(due.balance, b.currency), date: formatLongDate(b.balanceDueDate, locale) })],
        bank: true,
        dedupeKey: `recordatorio_saldo:${b.id}:${b.balanceDueDate}`,
      }),
    );
    if (status === "enviado") sent.balance++;
  }
  return sent;
}

/** Manda la cotización al cliente. Cada envío queda registrado (se puede reenviar). */
export async function sendQuoteEmail(quoteId: number): Promise<EmailStatus | "sin_email"> {
  const [quote, settings] = await Promise.all([
    db.query.quotes.findFirst({ where: eq(schema.quotes.id, quoteId), with: { items: true } }),
    getSettings(),
  ]);
  if (!quote?.clientEmail) return "sin_email";
  const locale = asLocale(quote.locale);
  const t = emailDictionary(locale);
  const totals = quoteTotals(quote.items, quote.passengers);
  const fmt = (n: number) => formatPrice(n, quote.currency);
  const content = renderEmail({
    brand: settings.brandName,
    title: t.quote.title,
    paragraphs: [
      interpolate(t.greeting, { name: quote.clientName.split(" ")[0] }),
      interpolate(t.quote.intro, { title: quote.title, passengers: quote.passengers }),
      interpolate(t.quote.total, { total: fmt(totals.total), perPerson: fmt(totals.perPassenger), date: formatLongDate(quote.validUntil, locale) }),
      ...(quote.notes ? [quote.notes] : []),
    ],
    buttons: [
      { label: t.quote.view, url: siteUrl(quoteUrl(quote)) },
      { label: t.quote.pdf, url: siteUrl(quotePdfUrl(quote)) },
    ],
    footer: interpolate(t.footer, { brand: settings.brandName, phone: settings.phone }),
  });
  return deliver({
    kind: "cotizacion",
    to: quote.clientEmail,
    subject: interpolate(t.quote.subject, { code: quote.code, title: quote.title }),
    ...content,
    replyTo: settings.email,
    quoteId: quote.id,
  });
}

export async function sendTestEmail(to: string) {
  const settings = await getSettings();
  return deliver({
    kind: "prueba",
    to,
    subject: `Prueba de email · ${settings.brandName}`,
    ...renderEmail({
      brand: settings.brandName,
      title: "Los emails funcionan",
      paragraphs: ["Si estás leyendo esto, Resend está bien configurado y los avisos automáticos van a llegar."],
      footer: "Email de prueba enviado desde el admin.",
    }),
  });
}
