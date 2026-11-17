import type { Dictionary } from "./i18n/dictionaries";
import { interpolate } from "./i18n/config";

export function whatsappLink(number: string, message: string) {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function brandWhatsappMessage(template: string, brand: string, vars: Record<string, string | number> = {}) {
  return interpolate(template, { brand, ...vars });
}

export function packageWhatsappMessage(
  t: Dictionary["wa"],
  opts: { brand: string; title: string; date?: string; passengers?: number },
) {
  const parts = [interpolate(t.package, { brand: opts.brand, title: opts.title })];
  if (opts.date) parts.push(interpolate(t.withDate, { date: opts.date }));
  if (opts.passengers) parts.push(opts.passengers === 1 ? t.forOnePax : interpolate(t.forPax, { n: opts.passengers }));
  return `${parts.join(" ")}. ${t.seats}`;
}
