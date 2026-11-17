import Link from "next/link";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Download, Plus, Trash2 } from "lucide-react";
import { createManualLead, deleteLead, updateLead } from "@/app/admin/actions";
import { WhatsAppIcon } from "@/components/site/icons";
import { ActionForm, AutoSubmitSelect, ConfirmButton, SubmitButton } from "@/components/admin/client";
import { EmptyState, Field, LEAD_STATUS_META, PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { LEAD_STATUSES, type LeadStatus } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata = { title: "Consultas" };

const dateTime = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function ConsultasPage({ searchParams }: PageProps<"/admin/consultas">) {
  const sp = await searchParams;
  const estado = LEAD_STATUSES.includes(sp.estado as LeadStatus) ? (sp.estado as LeadStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const session = await getSession();

  const conditions: SQL[] = [];
  if (estado) conditions.push(eq(schema.leads.status, estado));
  if (q) conditions.push(or(ilike(schema.leads.name, `%${q}%`), ilike(schema.leads.phone, `%${q}%`))!);

  const [rows, counts, packageOptions] = await Promise.all([
    db.query.leads.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: desc(schema.leads.createdAt),
      limit: 200,
      with: { package: true, departure: true },
    }),
    db.select({ status: schema.leads.status, n: count() }).from(schema.leads).groupBy(schema.leads.status),
    db.select({ id: schema.packages.id, title: schema.packages.title, days: schema.packages.days }).from(schema.packages).orderBy(asc(schema.packages.title)),
  ]);
  const total = counts.reduce((acc, c) => acc + c.n, 0);

  return (
    <>
      <PageHeader
        title="Consultas"
        description="Todas las consultas de la web y las que cargues a mano. Cambiá el estado a medida que avanzan."
        actions={
          <a href={`/admin/consultas/export${estado ? `?estado=${estado}` : ""}`} className="btn-ghost">
            <Download className="size-4" /> Exportar CSV
          </a>
        }
      />

      <details className="group mb-6 rounded-2xl bg-white ring-1 ring-ink/5">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-5 font-semibold [&::-webkit-details-marker]:hidden">
          <Plus className="size-4 transition-transform group-open:rotate-45" /> Registrar consulta de WhatsApp, teléfono u oficina
        </summary>
        <ActionForm action={createManualLead} resetOnSuccess className="grid gap-4 border-t border-ink/5 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nombre"><input name="name" required className="field" /></Field>
          <Field label="Teléfono"><input name="phone" required className="field" /></Field>
          <Field label="Pasajeros"><input name="passengers" type="number" min={1} defaultValue={2} className="field" /></Field>
          <Field label="Paquete">
            <select name="packageId" className="field">
              <option value="">Consulta general</option>
              {packageOptions.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.days}d</option>)}
            </select>
          </Field>
          <Field label="Origen">
            <select name="source" className="field">
              <option value="whatsapp">WhatsApp</option>
              <option value="telefono">Teléfono</option>
              <option value="oficina">Oficina</option>
              <option value="instagram">Instagram</option>
            </select>
          </Field>
          <Field label="Mensaje"><input name="message" className="field" /></Field>
          <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>Guardar consulta</SubmitButton></div>
        </ActionForm>
      </details>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip href="/admin/consultas" active={!estado} label={`Todas (${total})`} />
        {LEAD_STATUSES.map((s) => (
          <FilterChip key={s} href={`/admin/consultas?estado=${s}`} active={estado === s} label={`${LEAD_STATUS_META[s].label} (${counts.find((c) => c.status === s)?.n ?? 0})`} />
        ))}
        <form className="w-full sm:ml-auto sm:w-auto">
          {estado && <input type="hidden" name="estado" value={estado} />}
          <input name="q" defaultValue={q} placeholder="Buscar nombre o teléfono" className="field py-2 sm:w-56" />
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No hay consultas con este filtro.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((l) => {
            const trip = l.package ? `${l.package.title}${l.departure ? ` del ${formatShortDate(l.departure.date)}` : ""}` : "tu viaje";
            const reply = whatsappLink(l.phone.startsWith("+") || l.phone.startsWith("54") ? l.phone : `549${l.phone}`, `Hola ${l.name.split(" ")[0]}! Te escribo por tu consulta sobre ${trip}.`);
            return (
              <li key={l.id} className="rounded-2xl bg-white p-5 ring-1 ring-ink/5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {l.name} <span className="font-normal text-ink-soft">· {l.passengers} {l.passengers === 1 ? "pasajero" : "pasajeros"}</span>
                    </p>
                    <p className="text-sm text-ink-soft">
                      {l.phone}
                      {l.email ? ` · ${l.email}` : ""} · <span className="capitalize">{l.source}</span> · {dateTime.format(l.createdAt)}
                    </p>
                    <p className="mt-2 text-sm">
                      {l.package ? (
                        <Link href={`/admin/paquetes/${l.package.id}`} className="font-medium text-lake hover:underline">
                          {l.package.title} · {l.package.days}d
                        </Link>
                      ) : (
                        <span className="font-medium">Consulta general</span>
                      )}
                      {l.departure && <span className="text-ink-soft"> · salida {formatShortDate(l.departure.date)}</span>}
                    </p>
                    {l.message && <p className="mt-2 rounded-xl bg-sand px-3 py-2 text-sm">{l.message}</p>}
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <a href={reply} target="_blank" rel="noopener" className="btn-whatsapp px-3 py-2"><WhatsAppIcon className="size-4" /> Responder</a>
                    <Link href={`/admin/cotizaciones?lead=${l.id}`} className="btn-ghost px-3 py-2">Cotizar</Link>
                    <form action={updateLead}>
                      <input type="hidden" name="id" value={l.id} />
                      <AutoSubmitSelect name="status" defaultValue={l.status} className={`rounded-full border-0 px-3 py-2 text-sm font-semibold ${LEAD_STATUS_META[l.status].className}`} aria-label="Estado">
                        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_META[s].label}</option>)}
                      </AutoSubmitSelect>
                    </form>
                    {session?.role === "admin" && (
                      <form action={deleteLead}>
                        <input type="hidden" name="id" value={l.id} />
                        <ConfirmButton message="¿Eliminar esta consulta?" className="ml-auto rounded-lg p-2 text-ink-soft hover:bg-red-50 hover:text-red-600 sm:ml-0">
                          <Trash2 className="size-4" />
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                </div>
                <form action={updateLead} className="mt-3 flex gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <input name="notes" defaultValue={l.notes ?? ""} placeholder="Nota interna (ej: pidió habitación triple, seña por transferencia...)" className="field min-w-0 py-2" />
                  <SubmitButton className="btn-ghost shrink-0 py-2">Guardar</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${active ? "bg-ink text-white" : "bg-white ring-1 ring-ink/10 hover:bg-sand"}`}>
      {label}
    </Link>
  );
}
