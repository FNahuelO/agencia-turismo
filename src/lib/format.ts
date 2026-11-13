import type { Currency } from "@/db/schema";

const formatters = new Map<string, Intl.NumberFormat>();

export function formatPrice(amount: number, currency: Currency = "ARS") {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 });
    formatters.set(currency, f);
  }
  return f.format(amount);
}

export function parseISODate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, days: number) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Fechas de cada noche de una estadía que empieza en `checkIn`. */
export function nightDates(checkIn: string, nights: number) {
  return Array.from({ length: Math.max(1, nights) }, (_, i) => addDaysISO(checkIn, i));
}

export function daysBetweenISO(from: string, to: string) {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

type Words = { fullDay: string; day: string; days: string; night: string; nights: string };
type AvailabilityWords = { available: string; soldOut: string; cancelled: string; lastSeat: string; lastSeats: string };

const ES_WORDS: Words & AvailabilityWords = {
  fullDay: "Full day",
  day: "día",
  days: "días",
  night: "noche",
  nights: "noches",
  available: "Disponible",
  soldOut: "Agotada",
  cancelled: "Cancelada",
  lastSeat: "Último lugar",
  lastSeats: "Últimos {n} lugares",
};

const INTL: Record<string, string> = { es: "es-AR", en: "en-US", pt: "pt-BR" };
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormat(locale: string, kind: "short" | "long" | "month") {
  const key = `${locale}-${kind}`;
  let f = dateFormatters.get(key);
  if (!f) {
    const options: Intl.DateTimeFormatOptions =
      kind === "short"
        ? { weekday: "short", day: "numeric", month: "short" }
        : kind === "long"
          ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
          : { month: "long", year: "numeric" };
    f = new Intl.DateTimeFormat(INTL[locale] ?? "es-AR", options);
    dateFormatters.set(key, f);
  }
  return f;
}

export function formatShortDate(iso: string, locale = "es") {
  return dateFormat(locale, "short").format(parseISODate(iso)).replace(/\./g, "");
}

export function formatLongDate(iso: string, locale = "es") {
  return dateFormat(locale, "long").format(parseISODate(iso));
}

export function formatMonthYear(iso: string, locale = "es") {
  const text = dateFormat(locale, "month").format(parseISODate(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDuration(days: number, nights: number, w: Words = ES_WORDS) {
  if (days <= 1 && nights === 0) return w.fullDay;
  const d = `${days} ${days === 1 ? w.day : w.days}`;
  const n = `${nights} ${nights === 1 ? w.night : w.nights}`;
  return `${d} · ${n}`;
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function seatsLeft(dep: { seatsTotal: number; seatsTaken: number }) {
  return Math.max(0, dep.seatsTotal - dep.seatsTaken);
}

export function availabilityLabel(dep: { seatsTotal: number; seatsTaken: number; cancelled?: boolean }, w: AvailabilityWords = ES_WORDS) {
  if (dep.cancelled) return { label: w.cancelled, tone: "muted" as const };
  const left = seatsLeft(dep);
  if (left === 0) return { label: w.soldOut, tone: "muted" as const };
  if (left === 1) return { label: w.lastSeat, tone: "hot" as const };
  if (left <= 8) return { label: w.lastSeats.replace("{n}", String(left)), tone: "hot" as const };
  return { label: w.available, tone: "ok" as const };
}
