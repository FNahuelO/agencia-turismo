"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { formatShortDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { packageWhatsappMessage, whatsappLink } from "@/lib/whatsapp";
import { asLocale, interpolate } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";

export type LeadFormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "ok"; whatsappUrl: string };

const leadSchema = (e: Dictionary["errors"]) =>
  z.object({
    name: z.string().trim().min(2, e.name).max(120),
    phone: z.string().trim().min(8, e.phone).max(30).regex(/^[\d\s()+-]+$/, e.phone),
    email: z.union([z.literal(""), z.email(e.email)]).optional(),
    passengers: z.coerce.number().int().min(1).max(60).default(1),
    packageId: z.coerce.number().int().positive().optional(),
    departureId: z.coerce.number().int().positive().optional(),
    message: z.string().trim().max(1000).optional(),
  });

export async function createLead(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  if (formData.get("website")) return { status: "ok", whatsappUrl: "/" };

  const raw = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string" && v !== "").map(([k, v]) => [k, v]),
  );
  const locale = asLocale(formData.get("locale"));
  const t = getDictionary(locale);
  const parsed = leadSchema(t.errors).safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { status: "error", message: t.errors.checkFields, fieldErrors };
  }
  const data = parsed.data;

  let title: string | undefined;
  let date: string | undefined;
  if (data.packageId) {
    const pkg = await db.query.packages.findFirst({ where: eq(schema.packages.id, data.packageId) });
    if (pkg) title = pkg.title;
  }
  if (data.departureId) {
    const dep = await db.query.departures.findFirst({ where: eq(schema.departures.id, data.departureId) });
    if (dep && dep.packageId === data.packageId) date = formatShortDate(dep.date, locale);
    else data.departureId = undefined;
  }

  await db.insert(schema.leads).values({
    name: data.name,
    phone: data.phone,
    email: data.email || null,
    passengers: data.passengers,
    packageId: data.packageId ?? null,
    departureId: data.departureId ?? null,
    message: data.message || null,
    source: "web",
  });

  const settings = await getSettings();
  const intro = title ? packageWhatsappMessage(t.wa, { title, date, passengers: data.passengers }) : t.wa.hero;
  const text = `${intro} ${interpolate(t.wa.leadDone, { name: data.name })}`;
  return { status: "ok", whatsappUrl: whatsappLink(settings.whatsapp, text) };
}
