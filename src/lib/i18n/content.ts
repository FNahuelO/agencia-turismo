import type { DestinationI18n, PackageI18n } from "@/db/schema";
import type { Locale } from "./config";

function pick<T>(base: T, translated: T | undefined): T {
  if (translated === undefined || translated === null) return base;
  if (typeof translated === "string") return (translated.trim() ? translated : base) as T;
  if (Array.isArray(translated)) return (translated.length ? translated : base) as T;
  return translated;
}

export function localizeDestination<T extends { name: string; summary?: string; description?: string; i18n?: DestinationI18n | null }>(d: T, locale: Locale): T {
  if (locale === "es") return d;
  const tr = d.i18n?.[locale];
  if (!tr) return d;
  return {
    ...d,
    name: pick(d.name, tr.name),
    ...(d.summary !== undefined && { summary: pick(d.summary, tr.summary) }),
    ...(d.description !== undefined && { description: pick(d.description, tr.description) }),
  };
}

type PackageLike = {
  title: string;
  summary?: string;
  board?: string;
  schedule?: string;
  includes?: string[];
  excludes?: string[];
  itinerary?: { title: string; text: string }[];
  i18n?: PackageI18n | null;
};

export function localizePackage<T extends PackageLike>(p: T, locale: Locale): T {
  if (locale === "es") return p;
  const tr = p.i18n?.[locale];
  if (!tr) return p;
  return {
    ...p,
    title: pick(p.title, tr.title),
    ...(p.summary !== undefined && { summary: pick(p.summary, tr.summary) }),
    ...(p.board !== undefined && { board: pick(p.board, tr.board) }),
    ...(p.schedule !== undefined && { schedule: pick(p.schedule, tr.schedule) }),
    ...(p.includes !== undefined && { includes: pick(p.includes, tr.includes) }),
    ...(p.excludes !== undefined && { excludes: pick(p.excludes, tr.excludes) }),
    ...(p.itinerary !== undefined && { itinerary: pick(p.itinerary, tr.itinerary) }),
  };
}
