"use server";

import bcrypt from "bcryptjs";
import { and, count, eq, gte, lte, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { CURRENCIES, LEAD_STATUSES, PRODUCT_KINDS, REGIONS, TRANSPORTS, type DestinationI18n, type ItineraryDay, type PackageI18n } from "@/db/schema";
import { createSession, destroySession, getSession, requireSession } from "@/lib/auth";
import { slugify, toISODate, parseISODate } from "@/lib/format";
import { searchGooglePlaces, syncGoogleReviews, type PlaceCandidate } from "@/lib/google-reviews";
import { SETTINGS_DEFAULTS, SETTINGS_LABELS, setSettings, type SettingKey } from "@/lib/settings";
import { saveImageUpload } from "@/lib/storage";

export type FormState = { error?: string; ok?: string } | undefined;

function refreshSite() {
  revalidatePath("/", "layout");
}

function itineraryLines(value: FormDataEntryValue | null): ItineraryDay[] {
  return lines(value).map((l) => {
    const [title, ...rest] = l.split("|");
    return { title: title.trim(), text: rest.join("|").trim() };
  });
}

const TRANSLATED_LOCALES = ["en", "pt"] as const;

/** Lee los campos `i18n.<idioma>.<campo>` y descarta los vacíos. */
function readPackageI18n(fd: FormData): PackageI18n {
  const out: PackageI18n = {};
  for (const l of TRANSLATED_LOCALES) {
    const tr = {
      title: str(fd, `i18n.${l}.title`) || undefined,
      summary: str(fd, `i18n.${l}.summary`) || undefined,
      board: str(fd, `i18n.${l}.board`) || undefined,
      schedule: str(fd, `i18n.${l}.schedule`) || undefined,
      includes: lines(fd.get(`i18n.${l}.includes`)),
      excludes: lines(fd.get(`i18n.${l}.excludes`)),
      itinerary: itineraryLines(fd.get(`i18n.${l}.itinerary`)),
    };
    if (tr.title || tr.summary || tr.board || tr.schedule || tr.includes.length || tr.excludes.length || tr.itinerary.length) out[l] = tr;
  }
  return out;
}

function readDestinationI18n(fd: FormData): DestinationI18n {
  const out: DestinationI18n = {};
  for (const l of TRANSLATED_LOCALES) {
    const tr = {
      name: str(fd, `i18n.${l}.name`) || undefined,
      summary: str(fd, `i18n.${l}.summary`) || undefined,
      description: str(fd, `i18n.${l}.description`) || undefined,
    };
    if (tr.name || tr.summary || tr.description) out[l] = tr;
  }
  return out;
}

function lines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "Dato"}: ${issue.message}` : "Datos inválidos";
}

/* ---------- Auth ---------- */

const loginAttempts = new Map<string, { count: number; until: number }>();

export async function login(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const next = str(fd, "next");

  const attempt = loginAttempts.get(email);
  if (attempt && attempt.until > Date.now()) return { error: "Demasiados intentos. Probá de nuevo en unos minutos." };

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) {
    const c = (attempt?.count ?? 0) + 1;
    loginAttempts.set(email, { count: c, until: c >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return { error: "Email o contraseña incorrectos" };
  }
  loginAttempts.delete(email);
  await createSession({ sub: String(user.id), name: user.name, email: user.email, role: user.role });
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout() {
  await destroySession();
  redirect("/admin/login");
}

/* ---------- Paquetes ---------- */

const packageSchema = z.object({
  title: z.string().min(2, "El título es obligatorio"),
  kind: z.enum(PRODUCT_KINDS),
  slug: z.string(),
  destinationId: z.coerce.number().int().positive("Elegí un destino"),
  policyId: z.coerce.number().int().positive().nullable(),
  transport: z.enum(TRANSPORTS),
  transportDetail: z.string(),
  days: z.coerce.number().int().min(1).max(60),
  nights: z.coerce.number().int().min(0).max(60),
  hotel: z.string(),
  board: z.string(),
  price: z.coerce.number().int().positive("El precio debe ser mayor a 0"),
  currency: z.enum(CURRENCIES),
  summary: z.string().max(400),
  video: z.string(),
  image: z.string(),
  schedule: z.string().max(300),
  dailyCapacity: z.coerce.number().int().min(1, "El cupo diario debe ser al menos 1").max(1000),
  capacityPerUnit: z.coerce.number().int().min(1).max(60),
  minNights: z.coerce.number().int().min(1).max(30),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Habilitá al menos un día de la semana"),
});

export async function savePackage(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(fd.get("id")) || null;
  const parsed = packageSchema.safeParse({
    title: str(fd, "title"),
    kind: fd.get("kind") || "paquete",
    slug: str(fd, "slug"),
    destinationId: fd.get("destinationId"),
    policyId: Number(fd.get("policyId")) || null,
    transport: fd.get("transport"),
    transportDetail: str(fd, "transportDetail"),
    days: fd.get("days"),
    nights: fd.get("nights"),
    hotel: str(fd, "hotel"),
    board: str(fd, "board"),
    price: fd.get("price"),
    currency: fd.get("currency"),
    summary: str(fd, "summary"),
    video: str(fd, "video"),
    image: str(fd, "image"),
    schedule: str(fd, "schedule"),
    dailyCapacity: fd.get("dailyCapacity") || 20,
    capacityPerUnit: fd.get("capacityPerUnit") || 4,
    minNights: fd.get("minNights") || 1,
    weekdays: fd.has("weekdaysSent") ? fd.getAll("weekdays").map(Number) : [0, 1, 2, 3, 4, 5, 6],
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const data = parsed.data;

  let image = data.image || null;
  const upload = fd.get("imageFile");
  if (upload instanceof File && upload.size > 0) {
    try {
      image = await saveImageUpload(upload, data.title);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  const dest = await db.query.destinations.findFirst({ where: eq(schema.destinations.id, data.destinationId) });
  const baseSlug = slugify(data.slug || (data.kind === "paquete" ? `${data.title}-${data.transport === "aereo" ? "aereo" : "bus"}-${data.days}-dias` : data.title));
  let slug = baseSlug;
  for (let i = 2; ; i++) {
    const clash = await db.query.packages.findFirst({
      where: id ? and(eq(schema.packages.slug, slug), ne(schema.packages.id, id)) : eq(schema.packages.slug, slug),
    });
    if (!clash) break;
    slug = `${baseSlug}-${i}`;
  }

  const values = {
    ...data,
    slug,
    image: image ?? dest?.image ?? null,
    video: data.video || null,
    includes: lines(fd.get("includes")),
    excludes: lines(fd.get("excludes")),
    itinerary: itineraryLines(fd.get("itinerary")),
    i18n: readPackageI18n(fd),
    tags: str(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean),
    published: fd.get("published") === "on",
    featured: fd.get("featured") === "on",
  };

  let savedId = id;
  if (id) {
    const before = await db.query.packages.findFirst({ where: eq(schema.packages.id, id), columns: { kind: true, dailyCapacity: true } });
    if (before && before.kind !== values.kind) {
      const [{ n }] = await db.select({ n: count() }).from(schema.bookings).where(eq(schema.bookings.packageId, id));
      if (n > 0) return { error: "No se puede cambiar el tipo de un producto que ya tiene reservas" };
    }
    await db.update(schema.packages).set(values).where(eq(schema.packages.id, id));
    if (before && values.kind !== "paquete") await syncDailyCapacity(id, before.dailyCapacity, values.dailyCapacity);
  } else {
    const [row] = await db.insert(schema.packages).values(values).returning({ id: schema.packages.id });
    savedId = row.id;
  }
  refreshSite();
  if (!id) redirect(`/admin/paquetes/${savedId}?creado=1`);
  return { ok: values.kind === "paquete" ? "Paquete guardado" : "Producto guardado" };
}

export async function duplicatePackage(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const pkg = await db.query.packages.findFirst({ where: eq(schema.packages.id, id) });
  if (!pkg) return;
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = pkg;
  const [row] = await db
    .insert(schema.packages)
    .values({ ...rest, slug: `${pkg.slug}-copia-${Date.now().toString(36)}`, title: `${pkg.title} (copia)`, published: false, legacyIds: [] })
    .returning({ id: schema.packages.id });
  redirect(`/admin/paquetes/${row.id}`);
}

export async function togglePackagePublished(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const pkg = await db.query.packages.findFirst({ where: eq(schema.packages.id, id) });
  if (!pkg) return;
  await db.update(schema.packages).set({ published: !pkg.published }).where(eq(schema.packages.id, id));
  refreshSite();
  revalidatePath("/admin/paquetes");
}

export async function deletePackage(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession("admin");
  const id = Number(fd.get("id"));
  const [{ n }] = await db.select({ n: count() }).from(schema.bookings).where(eq(schema.bookings.packageId, id));
  if (n > 0) return { error: `Tiene ${n} ${n === 1 ? "reserva" : "reservas"}: no se puede borrar. Despublicalo para sacarlo del sitio.` };
  await db.delete(schema.packages).where(eq(schema.packages.id, id));
  refreshSite();
  redirect("/admin/paquetes");
}

/* ---------- Salidas ---------- */

const departureSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  seatsTotal: z.coerce.number().int().min(1).max(500),
  seatsTaken: z.coerce.number().int().min(0).max(500),
  priceOverride: z.coerce.number().int().positive().nullable(),
});

export async function addDepartures(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const packageId = Number(fd.get("packageId"));
  const parsed = departureSchema.safeParse({
    date: fd.get("date"),
    seatsTotal: fd.get("seatsTotal"),
    seatsTaken: 0,
    priceOverride: Number(fd.get("priceOverride")) || null,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const repeat = Math.min(52, Math.max(1, Number(fd.get("repeat")) || 1));
  const every = Math.max(1, Number(fd.get("every")) || 7);

  const start = parseISODate(parsed.data.date);
  const rows = Array.from({ length: repeat }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i * every);
    return { ...parsed.data, packageId, date: toISODate(d) };
  });
  const inserted = await db.insert(schema.departures).values(rows).onConflictDoNothing().returning({ id: schema.departures.id });
  refreshSite();
  const skipped = rows.length - inserted.length;
  if (!inserted.length) return { error: "Ya existe una salida en esa fecha" };
  return { ok: `${inserted.length} ${inserted.length === 1 ? "salida agregada" : "salidas agregadas"}${skipped ? ` (${skipped} ya existían)` : ""}` };
}

export async function updateDeparture(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const parsed = departureSchema.safeParse({
    date: fd.get("date"),
    seatsTotal: fd.get("seatsTotal"),
    seatsTaken: fd.get("seatsTaken"),
    priceOverride: Number(fd.get("priceOverride")) || null,
  });
  if (!parsed.success) return;
  try {
    await db
      .update(schema.departures)
      .set({ ...parsed.data, seatsTaken: Math.min(parsed.data.seatsTaken, parsed.data.seatsTotal), cancelled: fd.get("cancelled") === "on" })
      .where(eq(schema.departures.id, id));
  } catch {
    return;
  }
  refreshSite();
}

export async function adjustSeats(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const delta = Number(fd.get("delta"));
  const dep = await db.query.departures.findFirst({ where: eq(schema.departures.id, id) });
  if (!dep) return;
  const seatsTaken = Math.min(dep.seatsTotal, Math.max(0, dep.seatsTaken + delta));
  await db.update(schema.departures).set({ seatsTaken }).where(eq(schema.departures.id, id));
  refreshSite();
}

export async function deleteDeparture(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(fd.get("id"));
  const dep = await db.query.departures.findFirst({ where: eq(schema.departures.id, id), with: { package: { columns: { kind: true } } } });
  if (!dep) return { error: "La fecha ya no existe" };
  const [{ n }] = await db.select({ n: count() }).from(schema.bookings).where(eq(schema.bookings.departureId, id));
  if (n > 0) return { error: `Tiene ${n} ${n === 1 ? "reserva" : "reservas"}: cancelá la salida en lugar de borrarla.` };
  if (dep.package.kind !== "paquete" && dep.seatsTaken > 0) return { error: "Hay reservas que ocupan esta fecha: cerrala en lugar de borrarla." };
  await db.delete(schema.departures).where(eq(schema.departures.id, id));
  refreshSite();
  return { ok: "Fecha eliminada" };
}

/* ---------- Tarifas y cupos de productos diarios ---------- */

const rateRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha desde inválida"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha hasta inválida"),
    price: z.coerce.number().int().positive().nullable(),
    capacity: z.coerce.number().int().min(0).max(1000).nullable(),
    mode: z.enum(["abrir", "cerrar", "base"]),
  })
  .refine((d) => d.to >= d.from, "La fecha hasta debe ser posterior a la fecha desde");

/**
 * Fija precio y cupo para un rango de fechas de un producto diario: crea las filas de `departures`
 * que falten y actualiza las existentes sin tocar los lugares ocupados.
 */
export async function setDailyRates(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const packageId = Number(fd.get("packageId"));
  const pkg = await db.query.packages.findFirst({ where: eq(schema.packages.id, packageId) });
  if (!pkg || pkg.kind === "paquete") return { error: "Producto inválido" };
  const parsed = rateRangeSchema.safeParse({
    from: fd.get("from"),
    to: fd.get("to"),
    price: Number(fd.get("price")) || null,
    capacity: str(fd, "capacity") === "" ? null : fd.get("capacity"),
    mode: fd.get("mode") || "abrir",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { from, to, price, capacity, mode } = parsed.data;

  const dates: string[] = [];
  for (const d = parseISODate(from); toISODate(d) <= to; d.setDate(d.getDate() + 1)) {
    dates.push(toISODate(d));
    if (dates.length > 400) return { error: "El rango no puede superar los 400 días" };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.departures)
      .values(dates.map((date) => ({ packageId, date, seatsTotal: pkg.dailyCapacity, seatsTaken: 0 })))
      .onConflictDoNothing();
    const patch: Partial<typeof schema.departures.$inferInsert> =
      mode === "base"
        ? { priceOverride: null, seatsTotal: pkg.dailyCapacity, cancelled: false }
        : { cancelled: mode === "cerrar", ...(price !== null && { priceOverride: price }), ...(capacity !== null && { seatsTotal: capacity }) };
    await tx
      .update(schema.departures)
      .set(patch)
      .where(and(eq(schema.departures.packageId, packageId), gte(schema.departures.date, from), lte(schema.departures.date, to)));
  });
  refreshSite();
  revalidatePath(`/admin/paquetes/${packageId}`);
  return { ok: `${dates.length} ${dates.length === 1 ? "fecha actualizada" : "fechas actualizadas"}` };
}

/** Al cambiar el cupo diario de un producto, actualiza las fechas futuras que usaban el cupo anterior. */
async function syncDailyCapacity(packageId: number, previous: number, next: number) {
  if (previous === next) return;
  const today = toISODate(new Date());
  await db
    .update(schema.departures)
    .set({ seatsTotal: next })
    .where(and(eq(schema.departures.packageId, packageId), eq(schema.departures.seatsTotal, previous), gte(schema.departures.date, today)));
}

/* ---------- Consultas ---------- */

export async function updateLead(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const status = z.enum(LEAD_STATUSES).safeParse(fd.get("status"));
  const patch: Partial<typeof schema.leads.$inferInsert> = {};
  if (status.success) patch.status = status.data;
  if (fd.has("notes")) patch.notes = str(fd, "notes") || null;
  await db.update(schema.leads).set(patch).where(eq(schema.leads.id, id));
  revalidatePath("/admin", "layout");
}

const manualLeadSchema = z.object({
  name: z.string().min(2, "Ingresá el nombre"),
  phone: z.string().min(6, "Ingresá el teléfono"),
  passengers: z.coerce.number().int().min(1).max(60),
  packageId: z.coerce.number().int().positive().nullable(),
  source: z.string().min(1),
  message: z.string(),
});

export async function createManualLead(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const parsed = manualLeadSchema.safeParse({
    name: str(fd, "name"),
    phone: str(fd, "phone"),
    passengers: fd.get("passengers") || 1,
    packageId: Number(fd.get("packageId")) || null,
    source: str(fd, "source") || "whatsapp",
    message: str(fd, "message"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  await db.insert(schema.leads).values({ ...parsed.data, message: parsed.data.message || null });
  revalidatePath("/admin", "layout");
  return { ok: "Consulta registrada" };
}

export async function deleteLead(fd: FormData) {
  await requireSession("admin");
  await db.delete(schema.leads).where(eq(schema.leads.id, Number(fd.get("id"))));
  revalidatePath("/admin", "layout");
}

/* ---------- Destinos ---------- */

const destinationSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  region: z.enum(REGIONS),
  province: z.string(),
  summary: z.string().max(300),
  description: z.string().max(5000),
  image: z.string(),
});

export async function saveDestination(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(fd.get("id")) || null;
  const parsed = destinationSchema.safeParse({
    name: str(fd, "name"),
    region: fd.get("region"),
    province: str(fd, "province"),
    summary: str(fd, "summary"),
    description: str(fd, "description"),
    image: str(fd, "image"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  let image = parsed.data.image || null;
  const upload = fd.get("imageFile");
  if (upload instanceof File && upload.size > 0) {
    try {
      image = await saveImageUpload(upload, parsed.data.name);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  const values = { ...parsed.data, image, featured: fd.get("featured") === "on", i18n: readDestinationI18n(fd) };
  if (id) {
    await db.update(schema.destinations).set(values).where(eq(schema.destinations.id, id));
  } else {
    let slug = slugify(parsed.data.name);
    const clash = await db.query.destinations.findFirst({ where: eq(schema.destinations.slug, slug) });
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;
    await db.insert(schema.destinations).values({ ...values, slug });
  }
  refreshSite();
  if (!id) redirect("/admin/destinos");
  return { ok: "Destino guardado" };
}

export async function deleteDestination(fd: FormData) {
  await requireSession("admin");
  const id = Number(fd.get("id"));
  const [{ n }] = await db.select({ n: count() }).from(schema.packages).where(eq(schema.packages.destinationId, id));
  if (n > 0) redirect(`/admin/destinos/${id}?error=tiene-paquetes`);
  await db.delete(schema.destinations).where(eq(schema.destinations.id, id));
  refreshSite();
  redirect("/admin/destinos");
}

/* ---------- Políticas ---------- */

const policySchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  depositPercent: z.coerce.number().int().min(0).max(100),
  depositHours: z.coerce.number().int().min(1).max(720),
  finalPaymentDays: z.coerce.number().int().min(0).max(120),
  adminFee: z.string(),
  infantsMonths: z.coerce.number().int().min(0).max(120),
  singleSurcharge: z.coerce.number().int().min(0).max(300),
});

export async function savePolicy(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(fd.get("id")) || null;
  const parsed = policySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const values = { ...parsed.data, shareMode: fd.get("shareMode") === "on", extraNotes: lines(fd.get("extraNotes")) };
  if (id) await db.update(schema.policies).set(values).where(eq(schema.policies.id, id));
  else await db.insert(schema.policies).values(values);
  refreshSite();
  return { ok: "Política guardada" };
}

export async function deletePolicy(fd: FormData) {
  await requireSession("admin");
  await db.delete(schema.policies).where(eq(schema.policies.id, Number(fd.get("id"))));
  refreshSite();
}

/* ---------- Reseñas ---------- */

export async function saveReview(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const parsed = z
    .object({
      author: z.string().min(2, "Ingresá el autor"),
      text: z.string().min(10, "La reseña es muy corta").max(1000),
      rating: z.coerce.number().int().min(1).max(5),
      trip: z.string(),
    })
    .safeParse({ author: str(fd, "author"), text: str(fd, "text"), rating: fd.get("rating"), trip: str(fd, "trip") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  await db.insert(schema.reviews).values({ ...parsed.data, trip: parsed.data.trip || null, published: true });
  refreshSite();
  return { ok: "Reseña agregada" };
}

export async function toggleReview(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const review = await db.query.reviews.findFirst({ where: eq(schema.reviews.id, id) });
  if (!review) return;
  await db.update(schema.reviews).set({ published: !review.published }).where(eq(schema.reviews.id, id));
  refreshSite();
}

export async function deleteReview(fd: FormData) {
  await requireSession();
  await db.delete(schema.reviews).where(eq(schema.reviews.id, Number(fd.get("id"))));
  refreshSite();
}

export async function saveReviewSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession("admin");
  const parsed = z
    .object({
      googlePlaceId: z.string().max(200),
      reviewsSource: z.enum(["todas", "google", "manual"]),
      reviewsMinRating: z.coerce.number().int().min(1).max(5),
      reviewsCount: z.coerce.number().int().min(1).max(12),
      googleRating: z.string().regex(/^\d([.,]\d)?$/, "Puntaje inválido"),
      googleReviews: z.string().regex(/^\d+$/, "Cantidad inválida"),
      googleReviewsUrl: z.url("Link inválido"),
    })
    .safeParse({
      googlePlaceId: str(fd, "googlePlaceId"),
      reviewsSource: str(fd, "reviewsSource"),
      reviewsMinRating: fd.get("reviewsMinRating"),
      reviewsCount: fd.get("reviewsCount"),
      googleRating: str(fd, "googleRating"),
      googleReviews: str(fd, "googleReviews"),
      googleReviewsUrl: str(fd, "googleReviewsUrl"),
    });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  await setSettings({
    googlePlaceId: d.googlePlaceId,
    reviewsSource: d.reviewsSource,
    reviewsMinRating: String(d.reviewsMinRating),
    reviewsCount: String(d.reviewsCount),
    reviewsAutoPublish: fd.get("reviewsAutoPublish") ? "1" : "0",
    googleRating: d.googleRating.replace(",", "."),
    googleReviews: d.googleReviews,
    googleReviewsUrl: d.googleReviewsUrl,
  });
  refreshSite();
  return { ok: "Configuración de reseñas guardada" };
}

export type PlaceSearchState = { error?: string; results?: PlaceCandidate[] } | undefined;

export async function findGooglePlace(_prev: PlaceSearchState, fd: FormData): Promise<PlaceSearchState> {
  await requireSession("admin");
  const query = str(fd, "query");
  if (query.length < 3) return { error: "Escribí el nombre del negocio y la localidad" };
  try {
    const results = await searchGooglePlaces(query);
    return results.length ? { results } : { error: "Google no encontró resultados para esa búsqueda" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo consultar Google" };
  }
}

export async function selectGooglePlace(fd: FormData) {
  await requireSession("admin");
  const placeId = str(fd, "placeId");
  if (!placeId) return;
  await setSettings({ googlePlaceId: placeId });
  try {
    await syncGoogleReviews();
  } catch {}
  refreshSite();
}

export async function syncGoogleReviewsAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  await requireSession();
  try {
    const r = await syncGoogleReviews();
    refreshSite();
    const summary = r.rating ? ` Puntaje ${r.rating.toFixed(1)} con ${r.total} reseñas.` : "";
    return { ok: `Sincronizado: ${r.added} nuevas, ${r.updated} actualizadas.${summary}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo sincronizar" };
  }
}

/* ---------- Configuración y usuarios ---------- */

const optionalEmail = z.union([z.literal(""), z.email("tiene que ser un email válido")]);
const flag = z.enum(["0", "1"], "tiene que ser Sí o No");
const SETTING_RULES: Partial<Record<SettingKey, z.ZodType<string>>> = {
  brandName: z.string().min(2, "no puede quedar vacío"),
  email: z.email("tiene que ser un email válido"),
  notifyEmail: optionalEmail,
  whatsapp: z.string().regex(/^\d{10,15}$/, "solo números, con código de país (por ejemplo 5491139478823)"),
  yearsActive: z.string().regex(/^\d{0,3}$/, "tiene que ser un número"),
  googleRating: z.string().regex(/^(|[0-5]([.,]\d)?)$/, "tiene que ser un número entre 0 y 5"),
  googleReviews: z.string().regex(/^\d{0,7}$/, "tiene que ser un número"),
  googleReviewsUrl: z.union([z.literal(""), z.url("tiene que ser un link válido")]),
  reviewsMinRating: z.string().regex(/^[1-5]$/, "tiene que ser un número del 1 al 5"),
  reviewsCount: z.string().regex(/^\d{1,2}$/, "tiene que ser un número"),
  bankCuit: z.string().regex(/^(|\d{2}-?\d{8}-?\d)$/, "tiene que tener 11 dígitos (XX-XXXXXXXX-X)"),
  bankCbu: z.string().regex(/^(|\d{22})$/, "tiene que tener 22 dígitos"),
  onlineBooking: flag,
  reviewsAutoPublish: flag,
  emailCustomers: flag,
  emailAdminAlerts: flag,
};

export async function saveSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession("admin");
  const keys = (Object.keys(SETTINGS_DEFAULTS) as SettingKey[]).filter((key) => fd.has(key));
  const values: Partial<Record<SettingKey, string>> = {};
  for (const key of keys) {
    const value = key === "bankCbu" ? str(fd, key).replace(/\s/g, "") : str(fd, key);
    if (value.length > 2000) return { error: `${SETTINGS_LABELS[key]}: es demasiado largo` };
    const rule = SETTING_RULES[key]?.safeParse(value);
    if (rule && !rule.success) return { error: `${SETTINGS_LABELS[key]}: ${rule.error.issues[0].message}` };
    values[key] = value;
  }
  for (const [key, value] of Object.entries(values)) {
    await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  }
  refreshSite();
  return { ok: "Configuración guardada" };
}

export async function createUser(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession("admin");
  const parsed = z
    .object({
      name: z.string().min(2, "Ingresá el nombre"),
      email: z.email("Email inválido"),
      password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres"),
      role: z.enum(["admin", "editor"]),
    })
    .safeParse({ name: str(fd, "name"), email: str(fd, "email").toLowerCase(), password: String(fd.get("password") ?? ""), role: fd.get("role") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const exists = await db.query.users.findFirst({ where: eq(schema.users.email, parsed.data.email) });
  if (exists) return { error: "Ya existe un usuario con ese email" };
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.insert(schema.users).values({ name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, passwordHash });
  revalidatePath("/admin/configuracion");
  return { ok: "Usuario creado" };
}

export async function deleteUser(fd: FormData) {
  const session = await requireSession("admin");
  const id = Number(fd.get("id"));
  if (String(id) === session.sub) return;
  await db.delete(schema.users).where(eq(schema.users.id, id));
  revalidatePath("/admin/configuracion");
}

export async function changePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (next.length < 10) return { error: "La nueva contraseña debe tener al menos 10 caracteres" };
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, Number(session.sub)) });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return { error: "La contraseña actual no es correcta" };
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(next, 10) }).where(eq(schema.users.id, user.id));
  return { ok: "Contraseña actualizada" };
}
