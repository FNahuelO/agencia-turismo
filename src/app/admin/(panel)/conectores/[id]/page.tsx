import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { cancelConnectorOrder } from "@/app/admin/connector-actions";
import { ActionForm, ConfirmButton, FormAlert } from "@/components/admin/client";
import { Badge, CONNECTOR_KIND_LABELS, CONNECTOR_STATUS_META, Card, PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { formatLongDate, formatPrice } from "@/lib/format";

export default async function ConectorOrdenPage({ params }: PageProps<"/admin/conectores/[id]">) {
  const id = Number((await params).id);
  const order = id
    ? await db.query.connectorOrders.findFirst({
        where: eq(schema.connectorOrders.id, id),
        with: { cost: { with: { supplier: true } } },
      })
    : undefined;
  if (!order) notFound();
  const margin = order.price - order.net;

  return (
    <>
      <Link href="/admin/conectores" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:underline">
        <ArrowLeft className="size-4" /> Conectores
      </Link>
      <PageHeader
        title={`${order.code} · ${order.title}`}
        description={`${CONNECTOR_KIND_LABELS[order.kind]} · ${order.provider}${order.externalRef ? ` · ${order.externalRef}` : ""}`}
        actions={<Badge meta={CONNECTOR_STATUS_META[order.status]} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Reserva" className="lg:col-span-2">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Row label="Destino" value={order.destination} />
            <Row label="Fecha" value={order.dateFrom ? `${formatLongDate(order.dateFrom)}${order.dateTo ? ` al ${formatLongDate(order.dateTo)}` : ""}` : "—"} />
            <Row label="Pasajeros" value={String(order.passengers)} />
            <Row label="Titular" value={order.contactName} />
            <Row label="Contacto" value={[order.contactPhone, order.contactEmail].filter(Boolean).join(" · ") || "—"} />
            <Row label="Cargada por" value={order.createdBy || "—"} />
          </dl>
          {order.detail && <p className="mt-4 text-sm">{order.detail}</p>}
          {order.cancellation && <p className="mt-2 text-sm text-ink-soft">{order.cancellation}</p>}
          {order.travelers.length > 0 && (
            <ul className="mt-4 divide-y divide-ink/5 text-sm">
              {order.travelers.map((t, i) => <li key={i} className="py-1.5">{t.fullName}</li>)}
            </ul>
          )}
          {order.error && <FormAlert tone="error" title="Error del proveedor" message={order.error} />}
        </Card>

        <div className="space-y-6">
          <Card title="Importes">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">Venta</dt><dd className="font-semibold tabular-nums">{formatPrice(order.price, order.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Costo neto</dt><dd className="tabular-nums">{formatPrice(order.net, order.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Margen</dt><dd className="tabular-nums">{formatPrice(margin, order.currency)}</dd></div>
            </dl>
            {order.cost?.supplier && (
              <p className="mt-4 text-sm">
                Deuda con <Link href={`/admin/proveedores/${order.cost.supplierId}`} className="font-semibold text-lake hover:underline">{order.cost.supplier.name}</Link>
                {order.cost.voided ? " (anulada)" : ""}.
              </p>
            )}
          </Card>
          {order.status === "confirmada" && (
            <Card title="Cancelar">
              <p className="mb-3 text-sm text-ink-soft">Cancela en el proveedor y anula el costo. Si el costo ya tiene pagos, primero hay que revertirlos.</p>
              <ActionForm action={cancelConnectorOrder}>
                <input type="hidden" name="id" value={order.id} />
                <ConfirmButton message="¿Cancelar esta reserva en el proveedor?" className="btn w-full bg-red-600 text-white hover:bg-red-700">Cancelar reserva</ConfirmButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
