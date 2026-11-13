import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { bookFromProvider, quoteFromProvider, saveProvider } from "@/app/admin/connector-actions";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { Badge, CONNECTOR_KIND_LABELS, CONNECTOR_STATUS_META, Card, EmptyState, Field, PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { CONNECTOR_KINDS, type ConnectorKind } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { listProviders, parseSearch, searchOffers } from "@/lib/connectors";
import { addDaysISO, formatPrice, formatShortDate, todayISO } from "@/lib/format";

export const metadata = { title: "Conectores" };

export default async function ConectoresPage({ searchParams }: PageProps<"/admin/conectores">) {
  const sp = await searchParams;
  const parsed = parseSearch(sp);
  const today = todayISO();
  const [providers, orders, quotes, session] = await Promise.all([
    listProviders(),
    db.query.connectorOrders.findMany({ orderBy: desc(schema.connectorOrders.createdAt), limit: 30 }),
    db.query.quotes.findMany({
      where: inArray(schema.quotes.status, ["borrador", "enviada"]),
      orderBy: desc(schema.quotes.createdAt),
      limit: 40,
      columns: { id: true, code: true, title: true, currency: true, clientName: true },
    }),
    getSession(),
  ]);
  const query = parsed && "query" in parsed ? parsed.query : null;
  const results = query ? await searchOffers(query) : [];
  const kind = query?.kind ?? (CONNECTOR_KINDS.includes(sp.tipo as ConnectorKind) ? (sp.tipo as ConnectorKind) : "hotel");
  const quoteId = Number(sp.cotizacion) || "";

  return (
    <>
      <PageHeader
        title="Conectores"
        description="Búsqueda y reserva en proveedores externos. Hoy responde el conector simulado; Amadeus, Hotelbeds y el resto se enchufan a la misma interfaz cuando haya contrato y credenciales."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {providers.map((p) => (
          <Card key={p.code} title={p.name} actions={<span className={`text-xs font-semibold ${p.enabled ? "text-emerald-700" : "text-ink-soft"}`}>{p.enabled ? "Activo" : "Desactivado"}</span>}>
            <p className="text-sm text-ink-soft">{p.description}</p>
            <p className="mt-2 text-xs text-ink-soft">{p.kinds.map((k) => CONNECTOR_KIND_LABELS[k]).join(" · ")}</p>
            {session?.role === "admin" && (
              <ActionForm action={saveProvider} className="mt-4 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="code" value={p.code} />
                <Field label="Estado">
                  <select name="enabled" defaultValue={p.enabled ? "1" : "0"} className="field">
                    <option value="1">Activo</option>
                    <option value="0">Desactivado</option>
                  </select>
                </Field>
                <Field label="Margen %" hint="Sobre el neto del proveedor">
                  <input name="markup" inputMode="numeric" defaultValue={p.markup} className="field" />
                </Field>
                {p.credentialKeys.map((c) => (
                  <Field key={c.key} label={c.label}>
                    <input name={`cred.${c.key}`} defaultValue={p.credentials[c.key] ?? ""} className="field" autoComplete="off" />
                  </Field>
                ))}
                <div className="self-end"><SubmitButton>Guardar</SubmitButton></div>
              </ActionForm>
            )}
          </Card>
        ))}
      </div>

      <Card title="Buscar disponibilidad" className="mb-6">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Tipo">
            <select name="tipo" defaultValue={kind} className="field">
              {CONNECTOR_KINDS.map((k) => <option key={k} value={k}>{CONNECTOR_KIND_LABELS[k]}</option>)}
            </select>
          </Field>
          <Field label="Destino" className="lg:col-span-2">
            <input name="destino" required defaultValue={typeof sp.destino === "string" ? sp.destino : ""} className="field" placeholder="Bariloche, Mendoza, Iguazú..." />
          </Field>
          <Field label={kind === "hotel" ? "Entrada" : "Fecha"}>
            <input type="date" name="desde" required defaultValue={typeof sp.desde === "string" ? sp.desde : addDaysISO(today, 30)} className="field" />
          </Field>
          <Field label={kind === "hotel" ? "Salida" : "Regreso"} hint={kind === "hotel" ? undefined : "Opcional"}>
            <input type="date" name="hasta" defaultValue={typeof sp.hasta === "string" ? sp.hasta : addDaysISO(today, 33)} className="field" />
          </Field>
          <Field label="Pasajeros">
            <input name="pax" type="number" min={1} max={40} defaultValue={typeof sp.pax === "string" ? sp.pax : 2} className="field" />
          </Field>
          {kind === "hotel" && (
            <Field label="Habitaciones">
              <input name="hab" type="number" min={1} max={10} defaultValue={typeof sp.hab === "string" ? sp.hab : 1} className="field" />
            </Field>
          )}
          <div className="self-end"><button className="btn-dark">Buscar</button></div>
        </form>
        {parsed && "error" in parsed && <p className="mt-3 text-sm text-red-600">{parsed.error}</p>}
      </Card>

      {results.map((group) => (
        <Card key={group.code} title={group.name} className="mb-6">
          {group.error && <p className="text-sm text-red-600">{group.error}</p>}
          {group.offers.length === 0 && !group.error ? (
            <EmptyState>Sin disponibilidad para esta búsqueda.</EmptyState>
          ) : (
            <ul className="divide-y divide-ink/5">
              {group.offers.map((o) => (
                <li key={o.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{o.title}</p>
                      <p className="text-sm text-ink-soft">{o.detail}</p>
                      <p className="mt-1 text-xs text-ink-soft">{o.cancellation}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums">{formatPrice(o.price, o.currency)}</p>
                      <p className="text-xs text-ink-soft">neto {formatPrice(o.net, o.currency)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-lake">Reservar ahora</summary>
                      <ActionForm action={bookFromProvider} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="provider" value={o.provider} />
                        <input type="hidden" name="offerId" value={o.id} />
                        <Field label="Titular"><input name="contactName" required className="field" /></Field>
                        <Field label="Teléfono"><input name="contactPhone" className="field" /></Field>
                        <Field label="Email" className="sm:col-span-2"><input name="contactEmail" type="email" className="field" /></Field>
                        <Field label="Pasajeros" hint="Uno por línea. Si queda vacío se usa el titular." className="sm:col-span-2">
                          <textarea name="travelers" rows={2} className="field" />
                        </Field>
                        <div className="sm:col-span-2"><SubmitButton>Confirmar en el proveedor</SubmitButton></div>
                      </ActionForm>
                    </details>
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-lake">Sumar a una cotización</summary>
                      {quotes.length === 0 ? (
                        <p className="mt-3 text-sm text-ink-soft">No hay cotizaciones abiertas. <Link href="/admin/cotizaciones" className="text-lake hover:underline">Crear una</Link>.</p>
                      ) : (
                        <ActionForm action={quoteFromProvider} className="mt-3 grid gap-3">
                          <input type="hidden" name="provider" value={o.provider} />
                          <input type="hidden" name="offerId" value={o.id} />
                          <Field label="Cotización" hint="Tiene que estar en la misma moneda">
                            <select name="quoteId" defaultValue={quoteId} required className="field">
                              <option value="">Elegí</option>
                              {quotes.map((q) => (
                                <option key={q.id} value={q.id}>{q.code} · {q.clientName} · {q.currency} · {q.title}</option>
                              ))}
                            </select>
                          </Field>
                          <SubmitButton className="btn-ghost">Agregar servicio</SubmitButton>
                        </ActionForm>
                      )}
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      <Card title="Reservas en proveedores">
        {orders.length === 0 ? (
          <EmptyState>Todavía no hay reservas hechas por un conector.</EmptyState>
        ) : (
          <div className="-mx-4 sm:-mx-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/5 text-left text-xs text-ink-soft">
                <tr>
                  <th className="px-6 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Servicio</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 text-right font-medium">Venta</th>
                  <th className="px-6 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-6 py-2">
                      <Link href={`/admin/conectores/${o.id}`} className="font-mono font-semibold text-lake hover:underline">{o.code}</Link>
                      <p className="text-xs text-ink-soft">{o.externalRef}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p>{o.title}</p>
                      <p className="text-xs text-ink-soft">{CONNECTOR_KIND_LABELS[o.kind]} · {o.contactName}</p>
                    </td>
                    <td className="px-3 py-2 capitalize text-ink-soft">{o.dateFrom ? formatShortDate(o.dateFrom) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPrice(o.price, o.currency)}</td>
                    <td className="px-6 py-2"><Badge meta={CONNECTOR_STATUS_META[o.status]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
