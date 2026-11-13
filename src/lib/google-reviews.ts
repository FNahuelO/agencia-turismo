import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings, setSettings } from "@/lib/settings";

const API = "https://places.googleapis.com/v1";

export function googleApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || "";
}

type PlaceReview = {
  name: string;
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  publishTime?: string;
};

type PlaceDetails = {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  googleMapsLinks?: { reviewsUri?: string };
  reviews?: PlaceReview[];
};

export type PlaceCandidate = { id: string; name: string; address: string; rating?: number; total?: number };

async function placesFetch<T>(path: string, fieldMask: string, init?: RequestInit): Promise<T> {
  const key = googleApiKey();
  if (!key) throw new Error("Falta configurar GOOGLE_PLACES_API_KEY en el entorno");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMask, ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`Google respondió ${res.status}: ${body?.error?.message ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function searchGooglePlaces(query: string): Promise<PlaceCandidate[]> {
  const data = await placesFetch<{ places?: { id: string; displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number }[] }>(
    "/places:searchText",
    "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
    { method: "POST", body: JSON.stringify({ textQuery: query, languageCode: "es", regionCode: "AR" }) },
  );
  return (data.places ?? []).slice(0, 5).map((p) => ({
    id: p.id,
    name: p.displayName?.text ?? p.id,
    address: p.formattedAddress ?? "",
    rating: p.rating,
    total: p.userRatingCount,
  }));
}

export type SyncResult = { added: number; updated: number; rating?: number; total?: number };

/** Google devuelve como máximo las 5 reseñas más relevantes por consulta; se acumulan en cada sincronización. */
export async function syncGoogleReviews(): Promise<SyncResult> {
  const settings = await getSettings();
  const placeId = settings.googlePlaceId.trim();
  if (!placeId) throw new Error("Primero configurá el Place ID de Google");

  const place = await placesFetch<PlaceDetails>(
    `/places/${encodeURIComponent(placeId)}?languageCode=es&regionCode=AR`,
    "rating,userRatingCount,googleMapsUri,googleMapsLinks,reviews",
  );

  const minRating = Number(settings.reviewsMinRating) || 1;
  const autoPublish = settings.reviewsAutoPublish === "1";
  let added = 0;
  let updated = 0;

  for (const r of place.reviews ?? []) {
    const text = (r.originalText?.text || r.text?.text || "").trim();
    if (!text || !r.rating) continue;
    const values = {
      author: r.authorAttribution?.displayName || "Cliente de Google",
      rating: Math.round(r.rating),
      text: text.slice(0, 1000),
      authorPhoto: r.authorAttribution?.photoUri ?? null,
      authorUrl: r.authorAttribution?.uri ?? null,
      reviewedAt: r.publishTime ? new Date(r.publishTime) : null,
    };
    const existing = await db.query.reviews.findFirst({ where: eq(schema.reviews.externalId, r.name) });
    if (existing) {
      await db.update(schema.reviews).set(values).where(eq(schema.reviews.id, existing.id));
      updated++;
    } else {
      await db.insert(schema.reviews).values({
        ...values,
        source: "google",
        externalId: r.name,
        published: autoPublish && values.rating >= minRating,
      });
      added++;
    }
  }

  await setSettings({
    ...(place.rating ? { googleRating: place.rating.toFixed(1) } : {}),
    ...(place.userRatingCount ? { googleReviews: String(place.userRatingCount) } : {}),
    ...(place.googleMapsLinks?.reviewsUri || place.googleMapsUri
      ? { googleReviewsUrl: place.googleMapsLinks?.reviewsUri || place.googleMapsUri }
      : {}),
    reviewsLastSync: new Date().toISOString(),
  });

  return { added, updated, rating: place.rating, total: place.userRatingCount };
}
