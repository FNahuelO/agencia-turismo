import { desc, sql } from "drizzle-orm";
import { ExternalLink, Eye, EyeOff, RefreshCw, Trash2 } from "lucide-react";
import { deleteReview, saveReview, saveReviewSettings, syncGoogleReviewsAction, toggleReview } from "@/app/admin/actions";
import { ActionForm, ConfirmButton, GooglePlaceFinder, SubmitButton } from "@/components/admin/client";
import { Card, Field, PageHeader } from "@/components/admin/ui";
import { GoogleStars } from "@/components/site/icons";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { googleApiKey } from "@/lib/google-reviews";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Reseñas" };

const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const dateOnly = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" });

export default async function ResenasPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";
  const [settings, reviews] = await Promise.all([
    getSettings(),
    db
      .select()
      .from(schema.reviews)
      .orderBy(desc(sql`coalesce(${schema.reviews.reviewedAt}, ${schema.reviews.createdAt})`)),
  ]);
  const hasKey = Boolean(googleApiKey());
  const connected = hasKey && Boolean(settings.googlePlaceId);
  const minRating = Number(settings.reviewsMinRating);

  return (
    <>
      <PageHeader
        title="Reseñas"
        description="Conectá la ficha de Google para traer el puntaje y las reseñas reales, y elegí cuáles se muestran en el sitio."
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Google Business">
          {!hasKey ? (
            <div className="space-y-2 text-sm text-ink-soft">
              <p>
                Para traer las reseñas reales falta la variable <code className="rounded bg-sand px-1.5 py-0.5 text-ink">GOOGLE_PLACES_API_KEY</code> en el entorno
                (en local, en <code className="rounded bg-sand px-1.5 py-0.5 text-ink">.env.local</code>).
              </p>
              <p>Se crea en Google Cloud Console habilitando &quot;Places API (New)&quot;. Mientras tanto podés cargar reseñas a mano.</p>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <GoogleStars rating={Number(settings.googleRating)} />
                  <span>
                    <strong>{settings.googleRating}</strong> · {settings.googleReviews} reseñas
                  </span>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {connected ? "Conectado" : "Sin conectar"}
                </span>
              </div>
              {connected && (
                <div className="flex flex-wrap items-center gap-3">
                  <ActionForm action={syncGoogleReviewsAction}>
                    <SubmitButton className="btn-dark" pendingText="Sincronizando...">
                      <RefreshCw className="size-4" /> Sincronizar ahora
                    </SubmitButton>
                  </ActionForm>
                  <p className="text-xs text-ink-soft">
                    {settings.reviewsLastSync ? `Última sincronización: ${dateTime.format(new Date(settings.reviewsLastSync))}` : "Nunca sincronizado"}
                    {" · "}se actualiza sola una vez por día
                  </p>
                </div>
              )}
              {isAdmin && (
                <div>
                  <p className="mb-2 font-medium">{connected ? "Cambiar el negocio conectado" : "Buscá tu negocio en Google"}</p>
                  <GooglePlaceFinder defaultQuery={`${settings.brandName} ${settings.city}`} currentPlaceId={settings.googlePlaceId} />
                </div>
              )}
            </div>
          )}
        </Card>

        {isAdmin && (
          <Card title="Qué se muestra en el sitio">
            <ActionForm action={saveReviewSettings} className="grid gap-4 sm:grid-cols-2">
              <Field label="Reseñas a mostrar">
                <select name="reviewsSource" defaultValue={settings.reviewsSource} className="field">
                  <option value="todas">Google y manuales</option>
                  <option value="google">Solo de Google</option>
                  <option value="manual">Solo manuales</option>
                </select>
              </Field>
              <Field label="Puntaje mínimo">
                <select name="reviewsMinRating" defaultValue={settings.reviewsMinRating} className="field">
                  {[5, 4, 3, 1].map((n) => (
                    <option key={n} value={n}>{n === 1 ? "Todas" : `${n} estrellas o más`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad en la home">
                <select name="reviewsCount" defaultValue={settings.reviewsCount} className="field">
                  {[3, 6, 9].map((n) => <option key={n} value={n}>{n} reseñas</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 self-end pb-3 text-sm">
                <input type="checkbox" name="reviewsAutoPublish" defaultChecked={settings.reviewsAutoPublish === "1"} className="size-4 accent-lake" />
                Publicar solas las nuevas de Google
              </label>
              <details className="sm:col-span-2">
                <summary className="cursor-pointer text-sm font-medium text-lake">Datos avanzados (se completan solos al sincronizar)</summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Place ID de Google" className="sm:col-span-2">
                    <input name="googlePlaceId" defaultValue={settings.googlePlaceId} className="field font-mono text-xs" placeholder="ChIJ..." />
                  </Field>
                  <Field label="Puntaje en Google"><input name="googleRating" defaultValue={settings.googleRating} className="field" /></Field>
                  <Field label="Cantidad de reseñas"><input name="googleReviews" defaultValue={settings.googleReviews} className="field" /></Field>
                  <Field label="Link a las reseñas" className="sm:col-span-2">
                    <input name="googleReviewsUrl" defaultValue={settings.googleReviewsUrl} className="field" />
                  </Field>
                </div>
              </details>
              <div className="sm:col-span-2">
                <SubmitButton className="btn-primary" pendingText="Guardando...">Guardar</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {reviews.length === 0 && <p className="rounded-2xl bg-white p-6 text-sm text-ink-soft ring-1 ring-ink/5">Todavía no hay reseñas.</p>}
          {reviews.map((r) => {
            const sourceVisible = settings.reviewsSource === "todas" || settings.reviewsSource === r.source;
            const hiddenReason = !r.published
              ? "Oculta"
              : !sourceVisible
                ? "No se muestra por el filtro de origen"
                : r.rating < minRating
                  ? "No se muestra por el puntaje mínimo"
                  : null;
            return (
              <div key={r.id} className={`rounded-2xl bg-white p-5 ring-1 ring-ink/5 ${hiddenReason ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <GoogleStars rating={r.rating} />
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.source === "google" ? "bg-lake/10 text-lake" : "bg-sand text-ink-soft"}`}>
                        {r.source === "google" ? "Google" : "Manual"}
                      </span>
                      {hiddenReason && <span className="text-[11px] text-ink-soft">{hiddenReason}</span>}
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-line">{r.text}</p>
                    <p className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                      {r.authorPhoto && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.authorPhoto} alt="" width={20} height={20} className="size-5 rounded-full" referrerPolicy="no-referrer" />
                      )}
                      {r.author}
                      {r.trip ? ` · ${r.trip}` : ""}
                      {r.reviewedAt ? ` · ${dateOnly.format(r.reviewedAt)}` : ""}
                      {r.authorUrl && (
                        <a href={r.authorUrl} target="_blank" rel="noopener" className="hover:text-ink" title="Ver en Google"><ExternalLink className="size-3.5" /></a>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <form action={toggleReview}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="rounded-lg p-2 hover:bg-sand" title={r.published ? "Ocultar" : "Publicar"}>{r.published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</button>
                    </form>
                    <form action={deleteReview}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton message="¿Eliminar esta reseña?" className="rounded-lg p-2 text-ink-soft hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></ConfirmButton>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Card title="Agregar reseña manual" className="self-start">
          <ActionForm action={saveReview} resetOnSuccess className="space-y-3">
            <Field label="Autor"><input name="author" required className="field" placeholder="Nombre y apellido" /></Field>
            <Field label="Viaje"><input name="trip" className="field" placeholder="Ej: Bariloche" /></Field>
            <Field label="Puntaje">
              <select name="rating" defaultValue={5} className="field">{[5, 4, 3].map((n) => <option key={n} value={n}>{n} estrellas</option>)}</select>
            </Field>
            <Field label="Texto"><textarea name="text" required rows={4} className="field" /></Field>
            <SubmitButton className="btn-dark w-full">Agregar</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
