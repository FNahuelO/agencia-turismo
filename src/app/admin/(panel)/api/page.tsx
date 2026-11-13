import { desc } from "drizzle-orm";
import { revokeApiKey } from "@/app/admin/api-actions";
import { ApiKeyForm } from "@/components/admin/api-key-form";
import { ConfirmButton } from "@/components/admin/client";
import { Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "API" };

const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

const ENDPOINTS = [
  ["GET", "/api/v1/products", "catalog:read", "Productos publicados. Filtros: type (package, activity, transfer, hotel), destination (slug), locale (es, en, pt)."],
  ["GET", "/api/v1/products/{slug}", "catalog:read", "Ficha completa: incluye, itinerario, condiciones y, en paquetes, las próximas salidas."],
  ["GET", "/api/v1/products/{slug}/availability", "catalog:read", "Salidas con lugares (paquetes) o calendario diario con precio y cupo (from, to)."],
  ["GET", "/api/v1/destinations", "catalog:read", "Destinos con nombre, región e imagen."],
  ["GET", "/api/v1/rates", "catalog:read", "Cotizaciones vigentes en pesos por unidad."],
  ["POST", "/api/v1/bookings", "bookings:write", "Crea una reserva con cupo, seña y vencimiento, igual que la web."],
  ["GET", "/api/v1/bookings", "bookings:read", "Reservas creadas con la clave. Filtros: status, limit."],
  ["GET", "/api/v1/bookings/{code}", "bookings:read", "Estado, pagos y saldo de una reserva creada con la clave."],
] as const;

const BOOKING_EXAMPLE = `{
  "product": "hotel-llao-llao",          // slug o id
  "date": "2027-01-15",                  // productos diarios (hotel: check-in)
  "checkOut": "2027-01-18",              // solo hoteles
  "rooms": 1,                            // solo hoteles
  "departureId": 123,                    // solo paquetes (en vez de date)
  "contact": { "name": "Ana Pérez", "email": "ana@mail.com", "phone": "+54 11 5555-5555", "document": "30111222" },
  "travelers": [
    { "fullName": "Ana Pérez", "document": "30111222" },
    { "fullName": "Juan Pérez", "document": "30111333" },
    { "fullName": "Tomi Pérez", "infant": true }
  ],
  "paymentMethod": "bank_transfer",      // o "mercadopago" (devuelve checkoutUrl)
  "payAmount": "deposit",                // o "total" con Mercado Pago
  "locale": "es",
  "notes": "Llegamos de noche"
}`;

export default async function ApiPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";
  const keys = await db.select().from(schema.apiKeys).orderBy(desc(schema.apiKeys.createdAt));
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://tu-dominio.com.ar").replace(/\/$/, "");

  return (
    <>
      <PageHeader title="API" description="Claves para que otros sistemas (sitios de terceros, apps, integraciones) lean el catálogo y carguen reservas." />

      <div className="space-y-6">
        {isAdmin ? (
          <Card title="Nueva clave">
            <ApiKeyForm />
          </Card>
        ) : (
          <p className="rounded-2xl bg-sun/15 p-4 text-sm">Solo un administrador puede crear o revocar claves.</p>
        )}

        <Card title={`Claves (${keys.length})`}>
          {keys.length === 0 ? (
            <EmptyState>Todavía no hay claves.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-soft uppercase">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Nombre</th>
                    <th className="py-2 pr-3 font-semibold">Clave</th>
                    <th className="py-2 pr-3 font-semibold">Permisos</th>
                    <th className="py-2 pr-3 font-semibold">Último uso</th>
                    <th className="py-2 pr-3 font-semibold">Pedidos</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {keys.map((k) => (
                    <tr key={k.id} className={k.revokedAt ? "opacity-50" : ""}>
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold">{k.name}</p>
                        <p className="text-xs text-ink-soft">por {k.createdBy || "—"} el {dateTime.format(k.createdAt)}</p>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{k.prefix}…</td>
                      <td className="py-2.5 pr-3 text-xs">{k.scopes.join(", ")}</td>
                      <td className="py-2.5 pr-3 text-xs">{k.lastUsedAt ? dateTime.format(k.lastUsedAt) : "Nunca"}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{k.requestCount}</td>
                      <td className="py-2.5 text-right">
                        {k.revokedAt ? (
                          <span className="text-xs">Revocada el {dateTime.format(k.revokedAt)}</span>
                        ) : (
                          isAdmin && (
                            <form action={revokeApiKey}>
                              <input type="hidden" name="id" value={k.id} />
                              <ConfirmButton message={`¿Revocar la clave "${k.name}"? Deja de funcionar al instante.`} className="btn-ghost px-3 py-1.5 text-xs text-red-600">Revocar</ConfirmButton>
                            </form>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Documentación">
          <div className="space-y-5 text-sm">
            <p>
              Base: <code className="rounded bg-sand px-1.5 py-0.5">{base}/api/v1</code>. Autenticación con el encabezado{" "}
              <code className="rounded bg-sand px-1.5 py-0.5">Authorization: Bearer ta_…</code>. Límite: 120 pedidos por minuto por clave. Las respuestas son JSON
              con <code className="rounded bg-sand px-1">data</code> o <code className="rounded bg-sand px-1">error: {"{ code, message, details }"}</code>. Los montos van en
              enteros, en la moneda del producto.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody className="divide-y divide-ink/5">
                  {ENDPOINTS.map(([method, path, scope, text]) => (
                    <tr key={method + path}>
                      <td className="py-2 pr-3 font-mono text-xs font-bold">{method}</td>
                      <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{path}</td>
                      <td className="py-2 pr-3 text-xs text-ink-soft whitespace-nowrap">{scope}</td>
                      <td className="py-2 text-ink-soft">{text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="font-semibold">Ejemplo: consultar disponibilidad</p>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-white">{`curl -H "Authorization: Bearer ta_..." \\
  "${base}/api/v1/products/hotel-llao-llao/availability?from=2027-01-01&to=2027-01-31"`}</pre>
            </div>
            <div>
              <p className="font-semibold">Ejemplo: crear una reserva (POST /api/v1/bookings)</p>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-white">{BOOKING_EXAMPLE}</pre>
              <p className="mt-2 text-ink-soft">
                Responde 201 con la reserva (código, estado, total, seña, vencimiento y <code className="rounded bg-sand px-1">customerUrl</code> para que el pasajero pague o suba el
                comprobante). Errores: 401 clave inválida, 403 sin permiso, 404 producto inexistente, 409 sin cupo o fecha cerrada, 422 datos inválidos, 429 límite superado y 503 reservas pausadas.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
