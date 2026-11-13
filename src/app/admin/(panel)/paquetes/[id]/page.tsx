import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, Copy, ExternalLink, Minus, Plus, Trash2 } from "lucide-react";
import { addDepartures, adjustSeats, deleteDeparture, deletePackage, duplicatePackage, savePackage, setDailyRates, updateDeparture } from "@/app/admin/actions";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin/client";
import { PackageTranslations } from "@/components/admin/translations";
import { Card, Field, OccupancyBar, PageHeader, PRODUCT_KIND_META } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { PRODUCT_KINDS, type ProductKind } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { formatShortDate, todayISO } from "@/lib/format";

export const metadata = { title: "Editar producto" };

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default async function PaqueteEditPage({ params, searchParams }: PageProps<"/admin/paquetes/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "nuevo";
  const session = await getSession();

  const [pkg, destinations, policies] = await Promise.all([
    isNew
      ? null
      : db.query.packages.findFirst({
          where: eq(schema.packages.id, Number(id)),
          with: { departures: { orderBy: asc(schema.departures.date) }, destination: true },
        }),
    db.select().from(schema.destinations).orderBy(asc(schema.destinations.name)),
    db.select().from(schema.policies).orderBy(asc(schema.policies.name)),
  ]);
  if (!isNew && !pkg) notFound();

  const tipo = String(sp.tipo ?? "");
  const kind: ProductKind = pkg?.kind ?? ((PRODUCT_KINDS as readonly string[]).includes(tipo) ? (tipo as ProductKind) : "paquete");
  const meta = PRODUCT_KIND_META[kind];
  const daily = kind !== "paquete";
  const today = todayISO();
  const upcoming = pkg?.departures.filter((d) => d.date >= today) ?? [];
  const past = pkg?.departures.filter((d) => d.date < today) ?? [];

  return (
    <>
      <Link href="/admin/paquetes" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Productos
      </Link>
      <PageHeader
        title={isNew ? `Nuevo: ${meta.label.toLowerCase()}` : daily ? `${pkg!.title} · ${meta.label}` : `${pkg!.title} · ${pkg!.days}d`}
        description={
          sp.creado
            ? daily
              ? "Producto creado. Se puede reservar cualquier día habilitado; abajo podés fijar tarifas y cupos por fecha."
              : "Paquete creado. Ahora cargale las salidas más abajo."
            : undefined
        }
        actions={
          pkg && (
            <>
              <Link href={daily ? `/productos/${pkg.slug}` : `/paquetes/${pkg.slug}`} target="_blank" className="btn-ghost"><ExternalLink className="size-4" /> Ver en la web</Link>
              <form action={duplicatePackage}>
                <input type="hidden" name="id" value={pkg.id} />
                <button type="submit" className="btn-ghost"><Copy className="size-4" /> Duplicar</button>
              </form>
            </>
          )
        }
      />

      <ActionForm action={savePackage} className="space-y-6">
        {pkg && <input type="hidden" name="id" value={pkg.id} />}
        <Card title="Datos principales">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Título"><input name="title" required defaultValue={pkg?.title} className="field" placeholder="Ej: Bariloche" /></Field>
            <Field label="URL (slug)" hint="Se genera sola si la dejás vacía"><input name="slug" defaultValue={pkg?.slug} className="field" placeholder="bariloche-aereo-4-dias" /></Field>
            <Field label="Tipo de producto" hint={pkg ? "Guardá para ver los campos del tipo elegido" : undefined}>
              <select name="kind" defaultValue={kind} className="field">
                {PRODUCT_KINDS.map((k) => <option key={k} value={k}>{PRODUCT_KIND_META[k].label}</option>)}
              </select>
            </Field>
            <Field label="Destino">
              <select name="destinationId" required defaultValue={pkg?.destinationId ?? ""} className="field">
                <option value="" disabled>Elegí un destino</option>
                {destinations.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.region})</option>)}
              </select>
            </Field>
            <Field label="Condiciones de reserva">
              <select name="policyId" defaultValue={pkg?.policyId ?? ""} className="field">
                <option value="">Sin condiciones</option>
                {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Resumen" className="md:col-span-2" hint="Una frase que venda el destino. Aparece en la ficha y en Google.">
              <input name="summary" defaultValue={pkg?.summary} maxLength={400} className="field" />
            </Field>
          </div>
        </Card>

        {daily ? (
          <Card title="Tarifa y disponibilidad">
            <input type="hidden" name="transport" value={pkg?.transport ?? "bus"} />
            <input type="hidden" name="days" value={pkg?.days ?? 1} />
            <input type="hidden" name="nights" value={pkg?.nights ?? 0} />
            <input type="hidden" name="weekdaysSent" value="1" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={`Precio base ${meta.unit}`}><input name="price" type="number" min={1} required defaultValue={pkg?.price} className="field" /></Field>
              <Field label="Moneda">
                <select name="currency" defaultValue={pkg?.currency ?? "ARS"} className="field">
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </Field>
              <Field label={meta.capacity}><input name="dailyCapacity" type="number" min={1} required defaultValue={pkg?.dailyCapacity ?? (kind === "actividad" ? 20 : kind === "hotel" ? 10 : 3)} className="field" /></Field>
              {meta.perUnit ? (
                <Field label={meta.perUnit}><input name="capacityPerUnit" type="number" min={1} required defaultValue={pkg?.capacityPerUnit ?? (kind === "hotel" ? 2 : 4)} className="field" /></Field>
              ) : (
                <input type="hidden" name="capacityPerUnit" value={pkg?.capacityPerUnit ?? 4} />
              )}
              {kind === "hotel" ? (
                <Field label="Estadía mínima (noches)"><input name="minNights" type="number" min={1} max={30} defaultValue={pkg?.minNights ?? 1} className="field" /></Field>
              ) : (
                <input type="hidden" name="minNights" value={pkg?.minNights ?? 1} />
              )}
              <Field label={kind === "hotel" ? "Régimen" : "Comidas"}><input name="board" defaultValue={pkg?.board} className="field" placeholder={kind === "hotel" ? "Desayuno incluido" : ""} /></Field>
              <Field label={kind === "hotel" ? "Check-in / check-out" : kind === "traslado" ? "Horario" : "Horario y punto de encuentro"} className="sm:col-span-2">
                <input name="schedule" defaultValue={pkg?.schedule} className="field" placeholder={kind === "hotel" ? "Check-in 14 h · Check-out 10 h" : "Salida 9 h desde el hotel"} />
              </Field>
              <Field label={kind === "hotel" ? "Días de entrada habilitados" : "Días habilitados"} className="sm:col-span-2 lg:col-span-4">
                <div className="flex flex-wrap gap-3 pt-1">
                  {WEEKDAYS.map((label, i) => (
                    <label key={label} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="weekdays" value={i} defaultChecked={pkg ? pkg.weekdays.includes(i) : true} className="size-4 accent-lake" /> {label}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Etiquetas" className="sm:col-span-2" hint="Separadas por coma"><input name="tags" defaultValue={pkg?.tags.join(", ")} className="field" /></Field>
            </div>
            <input type="hidden" name="transportDetail" value={pkg?.transportDetail ?? ""} />
            <input type="hidden" name="hotel" value={pkg?.hotel ?? ""} />
          </Card>
        ) : (
        <Card title="Programa">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Transporte">
              <select name="transport" defaultValue={pkg?.transport ?? "bus"} className="field">
                <option value="bus">Bus</option>
                <option value="aereo">Aéreo</option>
              </select>
            </Field>
            <Field label="Días"><input name="days" type="number" min={1} required defaultValue={pkg?.days ?? 4} className="field" /></Field>
            <Field label="Noches"><input name="nights" type="number" min={0} required defaultValue={pkg?.nights ?? 3} className="field" /></Field>
            <Field label="Pensión"><input name="board" defaultValue={pkg?.board} className="field" placeholder="Media pensión" /></Field>
            <Field label="Detalle del transporte" className="sm:col-span-2"><input name="transportDetail" defaultValue={pkg?.transportDetail} className="field" placeholder="Bus Mix Confort | Ida y vuelta" /></Field>
            <Field label="Hotel" className="sm:col-span-2"><input name="hotel" defaultValue={pkg?.hotel} className="field" /></Field>
            <Field label="Precio base por persona"><input name="price" type="number" min={1} required defaultValue={pkg?.price} className="field" /></Field>
            <Field label="Moneda">
              <select name="currency" defaultValue={pkg?.currency ?? "ARS"} className="field">
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </Field>
            <Field label="Etiquetas" className="sm:col-span-2" hint="Separadas por coma: Super Sale, Fin de semana largo..."><input name="tags" defaultValue={pkg?.tags.join(", ")} className="field" /></Field>
          </div>
        </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Incluye">
            <textarea name="includes" rows={7} defaultValue={pkg?.includes.join("\n")} className="field font-mono text-xs" placeholder="Un ítem por línea" />
          </Card>
          <Card title="No incluye">
            <textarea name="excludes" rows={7} defaultValue={pkg?.excludes.join("\n")} className="field font-mono text-xs" placeholder="Un ítem por línea" />
          </Card>
        </div>

        <Card title={daily ? "Descripción" : "Itinerario"}>
          <p className="mb-2 text-xs text-ink-soft">
            {daily ? "Un bloque por línea" : "Un día por línea"} con el formato <code className="rounded bg-sand px-1">Título | Descripción</code>
          </p>
          <textarea name="itinerary" rows={7} defaultValue={pkg?.itinerary.map((d) => `${d.title} | ${d.text}`).join("\n")} className="field font-mono text-xs" />
        </Card>

        <Card title="Traducciones (inglés y portugués)">
          <PackageTranslations i18n={pkg?.i18n} />
        </Card>

        <Card title="Multimedia">
          <div className="grid gap-6 md:grid-cols-[160px_1fr]">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-sand">
              {pkg?.image && <Image src={pkg.image} alt="" fill sizes="160px" className="object-cover" />}
            </div>
            <div className="space-y-4">
              <Field label="Subir nueva imagen" hint="JPG, PNG o WebP. Se optimiza automáticamente."><input name="imageFile" type="file" accept="image/*" className="field" /></Field>
              <Field label="o URL de imagen"><input name="image" defaultValue={pkg?.image ?? ""} className="field" /></Field>
              <Field label="URL de video (mp4)" hint="Se carga solo cuando el usuario le da play."><input name="video" defaultValue={pkg?.video ?? ""} className="field" /></Field>
            </div>
          </div>
        </Card>

        <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-6 border-t border-ink/10 bg-sand/95 px-5 py-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="published" defaultChecked={pkg?.published ?? true} className="size-4 accent-lake" /> Publicado</label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="featured" defaultChecked={pkg?.featured ?? false} className="size-4 accent-lake" /> Recomendado en la home</label>
          <SubmitButton className="btn-primary ml-auto" pendingText="Guardando...">{isNew ? `Crear ${meta.label.toLowerCase()}` : "Guardar cambios"}</SubmitButton>
        </div>
      </ActionForm>

      {pkg && daily && (
        <div id="tarifas" className="mt-10 scroll-mt-6 space-y-6">
          <Card title="Tarifas y cupos por fecha">
            <p className="mb-4 text-sm text-ink-soft">
              Sin cargar nada, cada día habilitado se vende al precio base con el cupo diario. Usá un rango para cambiar el precio (temporada alta), el cupo o cerrar fechas.
            </p>
            <ActionForm action={setDailyRates} resetOnSuccess className="mb-6 grid items-end gap-3 rounded-xl bg-sand/60 p-4 sm:grid-cols-3 lg:grid-cols-6">
              <input type="hidden" name="packageId" value={pkg.id} />
              <Field label="Desde"><input name="from" type="date" required min={today} className="field" /></Field>
              <Field label="Hasta"><input name="to" type="date" required min={today} className="field" /></Field>
              <Field label="Precio"><input name="price" type="number" min={1} placeholder={String(pkg.price)} className="field" /></Field>
              <Field label="Cupo"><input name="capacity" type="number" min={0} placeholder={String(pkg.dailyCapacity)} className="field" /></Field>
              <Field label="Acción">
                <select name="mode" className="field" defaultValue="abrir">
                  <option value="abrir">Abrir / fijar valores</option>
                  <option value="cerrar">Cerrar fechas</option>
                  <option value="base">Volver al precio y cupo base</option>
                </select>
              </Field>
              <SubmitButton className="btn-dark">Aplicar</SubmitButton>
            </ActionForm>

            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-soft">Todavía no hay fechas con reservas ni tarifas especiales.</p>
            ) : (
              <div className="max-h-[32rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white text-left text-xs text-ink-soft uppercase">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Fecha</th>
                      <th className="py-2 pr-3 font-semibold">Cupo</th>
                      <th className="py-2 pr-3 font-semibold">Ocupados</th>
                      <th className="py-2 pr-3 font-semibold">Precio</th>
                      <th className="py-2 pr-3 font-semibold">Ocupación</th>
                      <th className="py-2 pr-3 font-semibold">Cerrada</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {upcoming.map((d) => (
                      <tr key={d.id} className={d.cancelled ? "opacity-50" : ""}>
                        <td className="py-2 pr-3 whitespace-nowrap capitalize">
                          {formatShortDate(d.date)}
                          <input form={`dep-${d.id}`} type="hidden" name="date" value={d.date} />
                        </td>
                        <td className="py-2 pr-3"><input form={`dep-${d.id}`} name="seatsTotal" type="number" min={1} defaultValue={d.seatsTotal} className="field w-20 py-1.5" /></td>
                        <td className="py-2 pr-3 tabular-nums">
                          {d.seatsTaken}
                          <input form={`dep-${d.id}`} type="hidden" name="seatsTaken" value={d.seatsTaken} />
                        </td>
                        <td className="py-2 pr-3"><input form={`dep-${d.id}`} name="priceOverride" type="number" min={1} defaultValue={d.priceOverride ?? ""} placeholder={String(pkg.price)} className="field w-28 py-1.5" /></td>
                        <td className="py-2 pr-3"><OccupancyBar taken={d.seatsTaken} total={d.seatsTotal} /></td>
                        <td className="py-2 pr-3"><input form={`dep-${d.id}`} name="cancelled" type="checkbox" defaultChecked={d.cancelled} className="size-4 accent-lake" /></td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <form id={`dep-${d.id}`} action={updateDeparture} className="inline">
                            <input type="hidden" name="id" value={d.id} />
                            <SubmitButton className="btn-ghost px-3 py-1.5 text-xs">Guardar</SubmitButton>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {pkg && session?.role === "admin" && daily && (
        <ActionForm action={deletePackage} className="mt-6 flex flex-col items-end">
          <input type="hidden" name="id" value={pkg.id} />
          <ConfirmButton message="¿Eliminar el producto y todas sus fechas? Esta acción no se puede deshacer." className="btn text-red-600 hover:bg-red-50">
            <Trash2 className="size-4" /> Eliminar producto
          </ConfirmButton>
        </ActionForm>
      )}

      {pkg && !daily && (
        <div id="salidas" className="mt-10 scroll-mt-6 space-y-6">
          <Card title={`Salidas próximas (${upcoming.length})`}>
            <ActionForm action={addDepartures} resetOnSuccess className="mb-6 grid items-end gap-3 rounded-xl bg-sand/60 p-4 sm:grid-cols-3 lg:grid-cols-6">
              <input type="hidden" name="packageId" value={pkg.id} />
              <Field label="Primera fecha"><input name="date" type="date" required min={today} className="field" /></Field>
              <Field label="Cupo"><input name="seatsTotal" type="number" min={1} defaultValue={pkg.transport === "aereo" ? 20 : 45} className="field" /></Field>
              <Field label="Precio (opcional)"><input name="priceOverride" type="number" min={1} placeholder={String(pkg.price)} className="field" /></Field>
              <Field label="Repetir"><input name="repeat" type="number" min={1} max={52} defaultValue={1} className="field" /></Field>
              <Field label="Cada (días)"><input name="every" type="number" min={1} defaultValue={7} className="field" /></Field>
              <SubmitButton className="btn-dark"><Plus className="size-4" /> Agregar</SubmitButton>
            </ActionForm>

            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-soft">Este paquete no tiene salidas futuras. Agregá al menos una para que aparezca en el calendario.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-ink-soft uppercase">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Fecha</th>
                      <th className="py-2 pr-3 font-semibold">Cupo</th>
                      <th className="py-2 pr-3 font-semibold">Vendidos</th>
                      <th className="py-2 pr-3 font-semibold">Precio</th>
                      <th className="py-2 pr-3 font-semibold">Ocupación</th>
                      <th className="py-2 pr-3 font-semibold">Cancelada</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {upcoming.map((d) => (
                      <tr key={d.id} className={d.cancelled ? "opacity-50" : ""}>
                        <td className="py-2 pr-3"><input form={`dep-${d.id}`} name="date" type="date" defaultValue={d.date} className="field w-40 py-1.5" /></td>
                        <td className="py-2 pr-3"><input form={`dep-${d.id}`} name="seatsTotal" type="number" min={1} defaultValue={d.seatsTotal} className="field w-20 py-1.5" /></td>
                        <td className="py-2 pr-3"><input form={`dep-${d.id}`} name="seatsTaken" type="number" min={0} defaultValue={d.seatsTaken} className="field w-20 py-1.5" /></td>
                        <td className="py-2 pr-3"><input form={`dep-${d.id}`} name="priceOverride" type="number" min={1} defaultValue={d.priceOverride ?? ""} placeholder={String(pkg.price)} className="field w-28 py-1.5" /></td>
                        <td className="py-2 pr-3"><OccupancyBar taken={d.seatsTaken} total={d.seatsTotal} /></td>
                        <td className="py-2 pr-3"><input form={`dep-${d.id}`} name="cancelled" type="checkbox" defaultChecked={d.cancelled} className="size-4 accent-lake" /></td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <form id={`dep-${d.id}`} action={updateDeparture} className="inline">
                            <input type="hidden" name="id" value={d.id} />
                            <SubmitButton className="btn-ghost px-3 py-1.5 text-xs">Guardar</SubmitButton>
                          </form>
                          <ActionForm action={deleteDeparture} className="inline">
                            <input type="hidden" name="id" value={d.id} />
                            <ConfirmButton message="¿Eliminar esta salida?" className="ml-1 rounded-lg p-2 text-ink-soft hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></ConfirmButton>
                          </ActionForm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {past.length > 0 && (
            <details className="rounded-2xl bg-white p-6 ring-1 ring-ink/5">
              <summary className="cursor-pointer font-display text-lg font-bold">Salidas pasadas ({past.length})</summary>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {past.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-xl bg-sand/60 px-3 py-2">
                    <span>{d.date}</span>
                    <span className="flex items-center gap-1">
                      <form action={adjustSeats}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="delta" value={-1} /><button className="rounded p-1 hover:bg-white" aria-label="Restar"><Minus className="size-3" /></button></form>
                      <span className="tabular-nums">{d.seatsTaken}/{d.seatsTotal}</span>
                      <form action={adjustSeats}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="delta" value={1} /><button className="rounded p-1 hover:bg-white" aria-label="Sumar"><Plus className="size-3" /></button></form>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {session?.role === "admin" && (
            <ActionForm action={deletePackage} className="flex flex-col items-end">
              <input type="hidden" name="id" value={pkg.id} />
              <ConfirmButton message="¿Eliminar el paquete y todas sus salidas? Esta acción no se puede deshacer." className="btn text-red-600 hover:bg-red-50">
                <Trash2 className="size-4" /> Eliminar paquete
              </ConfirmButton>
            </ActionForm>
          )}
        </div>
      )}
    </>
  );
}
